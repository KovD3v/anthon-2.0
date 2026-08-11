import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  extractMemoryCandidates: vi.fn(),
  rememberFact: vi.fn(),
  createMemoryApproval: vi.fn(),
  updateCanonicalProfile: vi.fn(),
  updateCanonicalPreferences: vi.fn(),
  messageFindFirst: vi.fn(),
}));

vi.mock("@/lib/ai/memory-extractor", () => ({
  extractMemoryCandidates: mocks.extractMemoryCandidates,
}));
vi.mock("@/lib/ai/memory-facts", () => ({
  rememberFact: mocks.rememberFact,
}));
vi.mock("@/lib/ai/memory-approval", () => ({
  createMemoryApproval: mocks.createMemoryApproval,
}));
vi.mock("@/lib/ai/user-knowledge", () => ({
  updateCanonicalProfile: mocks.updateCanonicalProfile,
  updateCanonicalPreferences: mocks.updateCanonicalPreferences,
}));
vi.mock("@/lib/db", () => ({
  prisma: { message: { findFirst: mocks.messageFindFirst } },
}));

import { consolidateTurnMemory } from "./memory-consolidator";

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    key: "training_schedule",
    value: "Martedì sera",
    category: "schedule",
    confidence: 0.94,
    sensitivity: "LOW",
    origin: "EXPLICIT",
    explicitSetting: false,
    durability: "DURABLE",
    evidence: "mi alleno ogni martedì sera",
    ...overrides,
  };
}

const input = {
  userId: "user-1",
  inboundMessageId: "inbound-1",
  conversationThreadId: "thread-1",
  userText: "Da questo mese mi alleno ogni martedì sera.",
  assistantText: "Perfetto.",
};

describe("ai/memory-consolidator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.extractMemoryCandidates.mockResolvedValue([]);
    mocks.rememberFact.mockResolvedValue({
      status: "saved",
      factId: "memory-1",
    });
    mocks.createMemoryApproval.mockResolvedValue({ id: "approval-1" });
    mocks.updateCanonicalProfile.mockResolvedValue({ id: "profile-1" });
    mocks.updateCanonicalPreferences.mockResolvedValue({ id: "preferences-1" });
    mocks.messageFindFirst.mockResolvedValue({
      id: "inbound-1",
      conversationThreadId: "thread-1",
    });
  });

  it("persists one ordinary durable fact with source provenance", async () => {
    mocks.extractMemoryCandidates.mockResolvedValue([candidate()]);

    await expect(consolidateTurnMemory(input)).resolves.toEqual({
      considered: 1,
      persisted: 1,
      approvalsCreated: 0,
      rejected: 0,
    });
    expect(mocks.rememberFact).toHaveBeenCalledWith({
      userId: "user-1",
      key: "training_schedule",
      value: "Martedì sera",
      category: "schedule",
      confidence: 0.94,
      sensitivity: "LOW",
      origin: "EXPLICIT",
      sourceMessageId: "inbound-1",
      sourceThreadId: "thread-1",
      dedupeKey: "memory:inbound-1:training_schedule",
    });
  });

  it("skips deleted, foreign, or mismatched source messages before extraction", async () => {
    mocks.messageFindFirst.mockResolvedValue(null);

    await expect(consolidateTurnMemory(input)).resolves.toEqual({
      considered: 0,
      persisted: 0,
      approvalsCreated: 0,
      rejected: 0,
    });
    expect(mocks.extractMemoryCandidates).not.toHaveBeenCalled();
    expect(mocks.messageFindFirst).toHaveBeenCalledWith({
      where: {
        id: "inbound-1",
        userId: "user-1",
        direction: "INBOUND",
        role: "USER",
        deletedAt: null,
        conversationThreadId: "thread-1",
      },
      select: { id: true },
    });
  });

  it("routes canonical profile fields and only explicit preferences", async () => {
    mocks.extractMemoryCandidates.mockResolvedValue([
      candidate({
        key: "user_sport",
        value: "Tennis",
        category: "sport",
        evidence: "gioco a tennis",
      }),
      candidate({
        key: "preferred_tone",
        value: "diretto",
        category: "preference",
        explicitSetting: true,
        evidence: "preferisco un tono diretto",
      }),
    ]);

    const report = await consolidateTurnMemory({
      ...input,
      userText: "Gioco a tennis e preferisco un tono diretto.",
    });

    expect(report).toEqual({
      considered: 2,
      persisted: 2,
      approvalsCreated: 0,
      rejected: 0,
    });
    expect(mocks.updateCanonicalProfile).toHaveBeenCalledWith("user-1", {
      sport: "Tennis",
    });
    expect(mocks.updateCanonicalPreferences).toHaveBeenCalledWith("user-1", {
      tone: "diretto",
    });
    expect(mocks.rememberFact).not.toHaveBeenCalled();
  });

  it("rejects inferred settings, transient details, low confidence, and unsupported evidence", async () => {
    mocks.extractMemoryCandidates.mockResolvedValue([
      candidate({
        key: "preferred_tone",
        category: "preference",
        value: "diretto",
        evidence: "forse un tono diretto",
      }),
      candidate({ durability: "TRANSIENT", evidence: "gara domani" }),
      candidate({ key: "low_confidence", confidence: 0.4 }),
      candidate({ key: "assistant_claim", evidence: "mai detto dall'utente" }),
    ]);

    await expect(
      consolidateTurnMemory({
        ...input,
        userText:
          "Forse un tono diretto; ho una gara domani e mi alleno ogni martedì sera.",
      }),
    ).resolves.toEqual({
      considered: 4,
      persisted: 0,
      approvalsCreated: 0,
      rejected: 4,
    });
    expect(mocks.updateCanonicalPreferences).not.toHaveBeenCalled();
    expect(mocks.rememberFact).not.toHaveBeenCalled();
  });

  it("creates an unpresented approval instead of persisting a sensitive fact", async () => {
    mocks.extractMemoryCandidates.mockResolvedValue([
      candidate({
        key: "knee_injury",
        value: "Dolore persistente al ginocchio",
        category: "health",
        sensitivity: "HIGH",
        evidence: "dolore persistente al ginocchio",
      }),
    ]);

    await expect(
      consolidateTurnMemory({
        ...input,
        userText: "Ho un dolore persistente al ginocchio.",
      }),
    ).resolves.toEqual({
      considered: 1,
      persisted: 0,
      approvalsCreated: 1,
      rejected: 0,
    });
    expect(mocks.createMemoryApproval).toHaveBeenCalledWith({
      userId: "user-1",
      sourceInboundMessageId: "inbound-1",
      key: "knee_injury",
      value: "Dolore persistente al ginocchio",
      category: "health",
      confidence: 0.94,
    });
    expect(mocks.rememberFact).not.toHaveBeenCalled();
  });

  it("treats a duplicate source mutation as idempotent", async () => {
    mocks.extractMemoryCandidates.mockResolvedValue([candidate()]);
    mocks.rememberFact.mockResolvedValue({
      status: "duplicate",
      factId: "memory-1",
    });

    await expect(consolidateTurnMemory(input)).resolves.toEqual({
      considered: 1,
      persisted: 0,
      approvalsCreated: 0,
      rejected: 0,
    });
  });
});
