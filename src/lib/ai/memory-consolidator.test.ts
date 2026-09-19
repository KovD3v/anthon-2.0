import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  extractMemoryCandidates: vi.fn(),
  rememberFact: vi.fn(),
  createMemoryApproval: vi.fn(),
  updateCanonicalProfile: vi.fn(),
  updateCanonicalPreferences: vi.fn(),
  messageFindFirst: vi.fn(),
  memoryFindFirst: vi.fn(),
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
  prisma: {
    message: { findFirst: mocks.messageFindFirst },
    memory: { findFirst: mocks.memoryFindFirst },
  },
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
    subject: "ACCOUNT_HOLDER",
    subjectName: null,
    subjectRelationship: null,
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
const sourceCreatedAt = new Date("2026-09-18T10:00:00Z");

describe("ai/memory-consolidator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
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
      createdAt: sourceCreatedAt,
      metadata: { timeZone: "Europe/Rome" },
    });
    mocks.memoryFindFirst.mockResolvedValue(null);
  });
  afterEach(() => vi.useRealTimers());

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
      observedAt: sourceCreatedAt,
      expiresAt: null,
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
      select: { id: true, createdAt: true, metadata: true },
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

  it("stores facts about referenced people in the account memory without changing its profile", async () => {
    mocks.extractMemoryCandidates.mockResolvedValue([
      candidate({
        key: "user_sport",
        value: "Basket",
        category: "sport",
        evidence: "Matteo gioca a basket",
        subject: "REFERENCED_PERSON",
        subjectName: "Matteo",
        subjectRelationship: "figlio",
      }),
      candidate({
        key: "user_sport",
        value: "Calcio",
        category: "sport",
        evidence: "Nicola gioca a calcio",
        subject: "REFERENCED_PERSON",
        subjectName: "Nicola",
        subjectRelationship: "figlio",
      }),
    ]);

    await expect(
      consolidateTurnMemory({
        ...input,
        userText:
          "Ho due figli: Matteo gioca a basket e Nicola gioca a calcio.",
      }),
    ).resolves.toEqual({
      considered: 2,
      persisted: 2,
      approvalsCreated: 0,
      rejected: 0,
    });
    expect(mocks.updateCanonicalProfile).not.toHaveBeenCalled();
    expect(mocks.updateCanonicalPreferences).not.toHaveBeenCalled();
    expect(mocks.rememberFact).toHaveBeenNthCalledWith(1, {
      userId: "user-1",
      key: "person_matteo_user_sport",
      value: "Matteo (figlio): Basket",
      category: "sport",
      confidence: 0.94,
      sensitivity: "LOW",
      origin: "EXPLICIT",
      sourceMessageId: "inbound-1",
      sourceThreadId: "thread-1",
      dedupeKey: "memory:inbound-1:person_matteo_user_sport",
      observedAt: sourceCreatedAt,
      expiresAt: null,
    });
    expect(mocks.rememberFact).toHaveBeenNthCalledWith(2, {
      userId: "user-1",
      key: "person_nicola_user_sport",
      value: "Nicola (figlio): Calcio",
      category: "sport",
      confidence: 0.94,
      sensitivity: "LOW",
      origin: "EXPLICIT",
      sourceMessageId: "inbound-1",
      sourceThreadId: "thread-1",
      dedupeKey: "memory:inbound-1:person_nicola_user_sport",
      observedAt: sourceCreatedAt,
      expiresAt: null,
    });
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
      observedAt: sourceCreatedAt,
      memoryExpiresAt: null,
    });
    expect(mocks.rememberFact).not.toHaveBeenCalled();
  });

  it("saves a temporary study deadline using the source day even when extraction runs later", async () => {
    mocks.extractMemoryCandidates.mockResolvedValue([
      candidate({
        key: "study_exam",
        value: "Esame domani",
        category: "schedule",
        durability: "TEMPORARY",
        expiry: { expression: "domani" },
        evidence: "esame domani",
      }),
    ]);
    const report = await consolidateTurnMemory({
      ...input,
      userText: "Ho un esame domani.",
    });
    expect(report.persisted).toBe(1);
    expect(mocks.rememberFact).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "study_exam",
        observedAt: sourceCreatedAt,
        expiresAt: new Date("2026-09-19T22:00:00Z"),
      }),
    );
  });

  it("preserves referenced-person attribution and expiry while requesting sensitive confirmation", async () => {
    mocks.extractMemoryCandidates.mockResolvedValue([
      candidate({
        key: "medical_review",
        value: "Visita di controllo domani",
        category: "health",
        sensitivity: "HIGH",
        subject: "REFERENCED_PERSON",
        subjectName: "Matteo",
        subjectRelationship: "figlio",
        durability: "TEMPORARY",
        expiry: { expression: "domani" },
        evidence: "Matteo ha una visita domani",
      }),
    ]);
    const report = await consolidateTurnMemory({
      ...input,
      userText: "Matteo ha una visita domani.",
    });
    expect(report.approvalsCreated).toBe(1);
    expect(mocks.createMemoryApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "person_matteo_medical_review",
        value: "Matteo (figlio): Visita di controllo domani",
        observedAt: sourceCreatedAt,
        memoryExpiresAt: new Date("2026-09-19T22:00:00Z"),
      }),
    );
    expect(mocks.rememberFact).not.toHaveBeenCalled();
    expect(mocks.updateCanonicalProfile).not.toHaveBeenCalled();
  });

  it("skips temporary facts with unknown timezone, ambiguous dates or profile destinations", async () => {
    mocks.messageFindFirst.mockResolvedValue({
      id: "inbound-1",
      createdAt: sourceCreatedAt,
      metadata: {},
    });
    mocks.extractMemoryCandidates.mockResolvedValue([
      candidate({
        durability: "TEMPORARY",
        expiry: { expression: "domani" },
        evidence: "esame domani",
      }),
      candidate({
        durability: "TEMPORARY",
        expiry: null,
        evidence: "esame domani",
      }),
      candidate({
        key: "user_goal",
        durability: "TEMPORARY",
        expiry: { expression: "domani" },
        evidence: "esame domani",
      }),
    ]);
    expect(
      await consolidateTurnMemory({
        ...input,
        userText: "Ho un esame domani.",
      }),
    ).toEqual({
      considered: 3,
      persisted: 0,
      approvalsCreated: 0,
      rejected: 3,
    });
    expect(mocks.rememberFact).not.toHaveBeenCalled();
  });

  it("does not turn an old event into future memory during a history backfill", async () => {
    vi.setSystemTime(new Date("2026-09-21T12:00:00Z"));
    mocks.extractMemoryCandidates.mockResolvedValue([
      candidate({
        durability: "TEMPORARY",
        expiry: { expression: "domani" },
        evidence: "esame domani",
      }),
    ]);
    expect(
      (
        await consolidateTurnMemory({
          ...input,
          userText: "Ho un esame domani.",
          memoryOnly: true,
        })
      ).rejected,
    ).toBe(1);
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

  it("limits candidates for bounded history backfills", async () => {
    mocks.extractMemoryCandidates.mockResolvedValue([
      candidate(),
      candidate({ key: "second_fact" }),
    ]);

    await expect(
      consolidateTurnMemory({ ...input, maxCandidates: 1 }),
    ).resolves.toEqual({
      considered: 1,
      persisted: 1,
      approvalsCreated: 0,
      rejected: 0,
    });
    expect(mocks.rememberFact).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite profile fields during a history backfill", async () => {
    mocks.extractMemoryCandidates.mockResolvedValue([
      candidate({
        key: "user_sport",
        value: "Tennis",
        category: "sport",
        evidence: "gioco a tennis",
      }),
    ]);

    await expect(
      consolidateTurnMemory({
        ...input,
        userText: "Da molti anni gioco a tennis.",
        memoryOnly: true,
      }),
    ).resolves.toEqual({
      considered: 1,
      persisted: 0,
      approvalsCreated: 0,
      rejected: 1,
    });
    expect(mocks.updateCanonicalProfile).not.toHaveBeenCalled();
  });
});
