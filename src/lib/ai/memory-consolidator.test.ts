import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  extractMemoryCandidates: vi.fn(),
  rememberFact: vi.fn(),
  createMemoryApproval: vi.fn(),
  updateCanonicalProfile: vi.fn(),
  updateCanonicalPreferences: vi.fn(),
  messageFindFirst: vi.fn(),
  memoryFindFirst: vi.fn(),
  memoryFindMany: vi.fn(),
  requestTypedDecisions: vi.fn(),
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
    memory: {
      findFirst: mocks.memoryFindFirst,
      findMany: mocks.memoryFindMany,
    },
  },
}));
vi.mock("@/lib/ai/typed-decisions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/typed-decisions")>()),
  requestTypedDecisions: mocks.requestTypedDecisions,
}));
vi.mock("@/lib/ai/usage-meter", () => ({
  scheduleTypedDecisionUsage: vi.fn(),
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
    vi.stubEnv("AI_MEMORY_REVIEW_MODE", "off");
    vi.stubEnv("AI_JEV_ALLOWED_USER_IDS", "user-1");
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
    mocks.memoryFindMany.mockResolvedValue([]);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
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
      observedAt: sourceCreatedAt,
      expiresAt: null,
    });
    expect(mocks.memoryFindMany).not.toHaveBeenCalled();
    expect(mocks.requestTypedDecisions).not.toHaveBeenCalled();
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

  function enableReview(overrides: Record<string, string> = {}) {
    vi.stubEnv("AI_MEMORY_REVIEW_MODE", "active");
    mocks.requestTypedDecisions.mockImplementation(async ({ questions }) => ({
      ok: true,
      attempted: true,
      modelId: "typesafe/jev-1.13",
      durationMs: 5,
      answers: Object.fromEntries(
        Object.keys(questions).map((key) => [
          key,
          {
            choice:
              overrides[key] ??
              (key.startsWith("sensitivity_")
                ? "ordinary"
                : key.startsWith("match_")
                  ? "distinct"
                  : "supported"),
            confidence: 0.99,
          },
        ]),
      ),
    }));
  }

  it.each(["support_0", "subject_0"])(
    "rejects a reviewed %s failure before any profile or memory write",
    async (key) => {
      enableReview({ [key]: "unsupported" });
      mocks.extractMemoryCandidates.mockResolvedValue([candidate()]);
      expect((await consolidateTurnMemory(input)).rejected).toBe(1);
      expect(mocks.rememberFact).not.toHaveBeenCalled();
      expect(mocks.createMemoryApproval).not.toHaveBeenCalled();
    },
  );

  it("retains exact source-evidence safeguards before making a review request", async () => {
    enableReview();
    mocks.extractMemoryCandidates.mockResolvedValue([
      candidate({ evidence: "The assistant invented this" }),
    ]);
    expect((await consolidateTurnMemory(input)).rejected).toBe(1);
    expect(mocks.requestTypedDecisions).not.toHaveBeenCalled();
  });

  it("requires confirmation and preserves expiry when review elevates sensitivity", async () => {
    enableReview({ sensitivity_0: "sensitive" });
    mocks.extractMemoryCandidates.mockResolvedValue([
      candidate({
        key: "financial_deadline",
        category: "other",
        value: "Pagamento domani",
        evidence: "devo pagare domani",
        durability: "TEMPORARY",
        expiry: { expression: "domani" },
      }),
    ]);
    expect(
      (
        await consolidateTurnMemory({
          ...input,
          userText: "Devo pagare domani.",
        })
      ).approvalsCreated,
    ).toBe(1);
    expect(mocks.createMemoryApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "financial_deadline",
        observedAt: sourceCreatedAt,
        memoryExpiresAt: new Date("2026-09-19T22:00:00Z"),
      }),
    );
    expect(mocks.rememberFact).not.toHaveBeenCalled();
  });

  it("never lowers an extracted HIGH sensitivity when the reviewer says ordinary", async () => {
    enableReview();
    mocks.extractMemoryCandidates.mockResolvedValue([
      candidate({ sensitivity: "HIGH" }),
    ]);
    expect((await consolidateTurnMemory(input)).approvalsCreated).toBe(1);
    expect(mocks.rememberFact).not.toHaveBeenCalled();
  });

  it("passes only a version-guarded explicit correction to the original stable fact key", async () => {
    enableReview({ match_0_0: "correction" });
    const updatedAt = new Date("2026-09-01T00:00:00Z");
    mocks.memoryFindMany.mockResolvedValue([
      {
        id: "old-fact",
        key: "weekly_schedule",
        value: { content: "Mi alleno giovedì" },
        category: "schedule",
        sensitivity: "LOW",
        observedAt: updatedAt,
        updatedAt,
        expiresAt: null,
      },
    ]);
    const evidence = "Correggi: mi alleno ogni martedì sera";
    mocks.extractMemoryCandidates.mockResolvedValue([candidate({ evidence })]);
    mocks.rememberFact.mockResolvedValue({ status: "rejected" });
    expect(
      (await consolidateTurnMemory({ ...input, userText: evidence })).rejected,
    ).toBe(1);
    expect(mocks.rememberFact).toHaveBeenCalledOnce();
    expect(mocks.rememberFact).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "weekly_schedule",
        semanticMatch: { kind: "correction", id: "old-fact", updatedAt },
        observedAt: sourceCreatedAt,
      }),
    );
    expect(mocks.memoryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-1", status: "ACTIVE" }),
        take: 32,
      }),
    );
  });

  it.each(["timeout", "invalid_output"])(
    "keeps the extraction path working after a review %s",
    async (failureCode) => {
      enableReview();
      mocks.requestTypedDecisions.mockResolvedValue({
        ok: false,
        attempted: true,
        failureCode,
        modelId: "typesafe/jev-1.13",
        durationMs: 5,
      });
      mocks.extractMemoryCandidates.mockResolvedValue([candidate()]);
      expect((await consolidateTurnMemory(input)).persisted).toBe(1);
      expect(mocks.rememberFact).toHaveBeenCalledWith(
        expect.objectContaining({ key: "training_schedule" }),
      );
    },
  );
});
