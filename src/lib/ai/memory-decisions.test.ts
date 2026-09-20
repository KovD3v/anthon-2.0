import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type MemoryReviewFact,
  type ReviewableMemory,
  reviewMemoryCandidates,
} from "./memory-decisions";
import { requestTypedDecisions } from "./typed-decisions";
import { scheduleTypedDecisionUsage } from "./usage-meter";

const reviewLog = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ info: reviewLog }) }));

vi.mock("./typed-decisions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./typed-decisions")>()),
  requestTypedDecisions: vi.fn(),
}));
vi.mock("./usage-meter", () => ({ scheduleTypedDecisionUsage: vi.fn() }));

const observedAt = new Date("2026-09-19T10:00:00Z");
const memory: ReviewableMemory = {
  candidate: {
    key: "weekly_training",
    value: "Mi alleno martedì sera",
    category: "schedule",
    confidence: 0.95,
    sensitivity: "LOW",
    origin: "EXPLICIT",
    explicitSetting: false,
    durability: "DURABLE",
    evidence: "Mi alleno martedì sera",
    subject: "ACCOUNT_HOLDER",
    subjectName: null,
    subjectRelationship: null,
  },
  canonical: {
    destination: "memory",
    key: "weekly_training",
    value: "Mi alleno martedì sera",
    category: "schedule",
  },
  expiresAt: null,
};
const existing: MemoryReviewFact = {
  id: "fact-1",
  key: "training_schedule",
  content: "Allenamento ogni martedì sera",
  category: "schedule",
  sensitivity: "LOW",
  observedAt: new Date("2026-09-01T10:00:00Z"),
  updatedAt: new Date("2026-09-01T10:00:00Z"),
  expiresAt: null,
};
const input = {
  userId: "user-1",
  userText: memory.candidate.evidence,
  observedAt,
  candidates: [memory],
  existingFacts: [existing],
};

function respond(
  overrides: Record<string, string> = {},
  probability = 0.99,
  confidence = 0.99,
) {
  vi.mocked(requestTypedDecisions).mockImplementation(
    async ({ questions }) => ({
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
            confidence,
            probability,
          },
        ]),
      ),
    }),
  );
}

describe("Jev memory review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AI_MEMORY_REVIEW_MODE", "active");
    vi.stubEnv("AI_JEV_ALLOWED_USER_IDS", "user-1");
    respond();
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["", "user-1"],
    ["off", "user-1"],
    ["active", ""],
    ["active", "*"],
    ["active", "user-10"],
  ])(
    "keeps review off without explicit mode and exact cohort membership (%s, %s)",
    async (mode, cohort) => {
      vi.stubEnv("AI_MEMORY_REVIEW_MODE", mode);
      vi.stubEnv("AI_JEV_ALLOWED_USER_IDS", cohort);
      expect(await reviewMemoryCandidates(input)).toEqual([
        { reject: false, requiresApproval: false },
      ]);
      expect(requestTypedDecisions).not.toHaveBeenCalled();
    },
  );

  it("batches validation and duplicate matching, with usage recorded once", async () => {
    respond({ match_0_0: "equivalent" });
    expect(await reviewMemoryCandidates(input)).toEqual([
      {
        reject: false,
        requiresApproval: false,
        match: { kind: "equivalent", fact: existing },
      },
    ]);
    expect(requestTypedDecisions).toHaveBeenCalledOnce();
    expect(
      Object.keys(vi.mocked(requestTypedDecisions).mock.calls[0][0].questions),
    ).toEqual(["support_0", "subject_0", "sensitivity_0", "match_0_0"]);
    expect(scheduleTypedDecisionUsage).toHaveBeenCalledOnce();
  });

  it("addresses each batched candidate by an explicit ID, not array position", async () => {
    const candidates = [
      memory,
      {
        ...memory,
        candidate: { ...memory.candidate, value: "Studio venerdì sera" },
        canonical: { ...memory.canonical, value: "Studio venerdì sera" },
      },
    ];
    await reviewMemoryCandidates({ ...input, candidates });
    const { state, questions } = vi.mocked(requestTypedDecisions).mock
      .calls[0][0];
    expect(state.candidates).toEqual(
      candidates.map((candidate, index) => ({
        id: `candidate_${index}`,
        ...candidate,
      })),
    );
    for (const [questionId, question] of Object.entries(questions)) {
      const candidateId = `candidate_${questionId.split("_")[1]}`;
      expect(question.instructions.startsWith(`Review ${candidateId}.`)).toBe(
        true,
      );
    }
  });

  it.each(
    ["support_0", "subject_0"].flatMap((question) =>
      ["unsupported", "uncertain"].map((choice) => [question, choice]),
    ),
  )(
    "holds a %s %s judgment even with low confidence",
    async (question, choice) => {
      respond({ [question]: choice }, 0.33, 0.22);
      expect((await reviewMemoryCandidates(input))[0].reject).toBe(true);
    },
  );

  it("uses the chosen probability rather than confidence to authorize a supported fact", async () => {
    respond({}, 0.99, 0.33);
    expect(await reviewMemoryCandidates(input)).toEqual([
      { reject: false, requiresApproval: false },
    ]);
    respond({}, 0.57, 0.99);
    expect((await reviewMemoryCandidates(input))[0].reject).toBe(true);
  });

  it("holds facts when the provider supplies confidence without a probability", async () => {
    vi.mocked(requestTypedDecisions).mockResolvedValue({
      ok: true,
      attempted: true,
      modelId: "typesafe/jev-1.13",
      durationMs: 5,
      answers: {
        support_0: { choice: "supported", confidence: 0.99 },
        subject_0: { choice: "supported", confidence: 0.99 },
        sensitivity_0: { choice: "ordinary", confidence: 0.99 },
      },
    });
    expect(await reviewMemoryCandidates(input)).toEqual([
      { reject: true, requiresApproval: false },
    ]);
  });

  it("does not let a model-invented referenced person pass a literal subject check", async () => {
    const candidate = {
      ...memory,
      candidate: {
        ...memory.candidate,
        subject: "REFERENCED_PERSON" as const,
        subjectName: "Nicola",
      },
    };
    expect(
      (await reviewMemoryCandidates({ ...input, candidates: [candidate] }))[0]
        .reject,
    ).toBe(true);
  });

  it("never presents another person's fact as an account-holder merge target", async () => {
    await reviewMemoryCandidates({
      ...input,
      existingFacts: [
        {
          ...existing,
          key: "person_matteo_training",
          content: "Matteo: Allenamento ogni martedì sera",
        },
      ],
    });
    expect(
      Object.keys(vi.mocked(requestTypedDecisions).mock.calls[0][0].questions),
    ).not.toContain("match_0_0");
  });

  it("requires the complete referenced-person descriptor, not a partial name prefix", async () => {
    const person = {
      ...memory,
      candidate: {
        ...memory.candidate,
        subject: "REFERENCED_PERSON" as const,
        subjectName: "Anna",
        evidence: "Anna si allena martedì",
      },
      canonical: {
        ...memory.canonical,
        key: "person_anna_weekly_training",
        value: "Anna: Si allena martedì",
      },
    };
    await reviewMemoryCandidates({
      ...input,
      userText: "Anna si allena martedì",
      candidates: [person],
      existingFacts: [
        {
          ...existing,
          key: "person_anna_maria_training",
          content: "Anna Maria: Si allena martedì",
        },
      ],
    });
    expect(
      Object.keys(vi.mocked(requestTypedDecisions).mock.calls[0][0].questions),
    ).not.toContain("match_0_0");
  });

  it("requires an explicit user correction even when Jev suggests replacing a similar fact", async () => {
    respond({ match_0_0: "correction" });
    expect((await reviewMemoryCandidates(input))[0].match).toBeUndefined();
    const correction = {
      ...memory,
      candidate: {
        ...memory.candidate,
        evidence: "Correggi: mi alleno giovedì, non martedì",
      },
    };
    expect(
      (
        await reviewMemoryCandidates({
          ...input,
          userText: correction.candidate.evidence,
          candidates: [correction],
        })
      )[0].match,
    ).toEqual({ kind: "correction", fact: existing });
    correction.candidate.origin = "INFERRED";
    expect(
      (
        await reviewMemoryCandidates({
          ...input,
          userText: correction.candidate.evidence,
          candidates: [correction],
        })
      )[0].match,
    ).toBeUndefined();
  });

  it("retains distinct facts when confidence or the target is ambiguous", async () => {
    respond({ match_0_0: "equivalent" }, 0.97);
    expect((await reviewMemoryCandidates(input))[0].match).toBeUndefined();
    respond({ match_0_0: "equivalent", match_0_1: "equivalent" });
    expect(
      (
        await reviewMemoryCandidates({
          ...input,
          existingFacts: [
            existing,
            { ...existing, id: "fact-2", key: "another_schedule" },
          ],
        })
      )[0].match,
    ).toBeUndefined();
  });

  it("does not overwrite an uncertain same-key collision", async () => {
    expect(
      (
        await reviewMemoryCandidates({
          ...input,
          existingFacts: [{ ...existing, key: memory.canonical.key }],
        })
      )[0].reject,
    ).toBe(true);
  });

  it("requires confirmed subject and source support before a semantic merge", async () => {
    respond({ subject_0: "uncertain", match_0_0: "equivalent" });
    expect((await reviewMemoryCandidates(input))[0]).toEqual({
      reject: true,
      requiresApproval: false,
    });
    respond({ support_0: "uncertain", match_0_0: "equivalent" });
    expect((await reviewMemoryCandidates(input))[0].match).toBeUndefined();
  });

  it("elevates sensitivity without authorizing storage or merging sensitive facts", async () => {
    respond({ sensitivity_0: "sensitive", match_0_0: "equivalent" });
    expect(await reviewMemoryCandidates(input)).toEqual([
      { reject: false, requiresApproval: true },
    ]);
    respond({ match_0_0: "equivalent" });
    expect(
      (
        await reviewMemoryCandidates({
          ...input,
          existingFacts: [
            { ...existing, key: memory.canonical.key, sensitivity: "HIGH" },
          ],
        })
      )[0],
    ).toEqual({ reject: false, requiresApproval: true });
  });

  it("requires consent for uncertain sensitivity without accepting unsupported facts", async () => {
    respond({ sensitivity_0: "uncertain", match_0_0: "equivalent" });
    expect(await reviewMemoryCandidates(input)).toEqual([
      { reject: false, requiresApproval: true },
    ]);
    respond({ sensitivity_0: "sensitive", support_0: "uncertain" });
    expect(await reviewMemoryCandidates(input)).toEqual([
      { reject: true, requiresApproval: false },
    ]);
  });

  it("does not collapse different expiries or retarget a newer source fact", async () => {
    respond({ match_0_0: "equivalent" });
    expect(
      (
        await reviewMemoryCandidates({
          ...input,
          candidates: [
            { ...memory, expiresAt: new Date("2099-10-01T00:00:00Z") },
          ],
        })
      )[0].match,
    ).toBeUndefined();
    expect(
      (
        await reviewMemoryCandidates({
          ...input,
          existingFacts: [
            { ...existing, observedAt: new Date("2026-09-20T00:00:00Z") },
          ],
        })
      )[0].match,
    ).toBeUndefined();
  });

  it.each(["timeout", "invalid_output"] as const)(
    "holds unreviewed facts when active review returns %s",
    async (failureCode) => {
      vi.mocked(requestTypedDecisions).mockResolvedValue({
        ok: false,
        attempted: true,
        failureCode,
        modelId: "typesafe/jev-1.13",
        durationMs: 5,
      });
      expect(await reviewMemoryCandidates(input)).toEqual([
        { reject: true, requiresApproval: false },
      ]);
      vi.stubEnv("AI_MEMORY_REVIEW_MODE", "shadow");
      expect(await reviewMemoryCandidates(input)).toEqual([
        { reject: false, requiresApproval: false },
      ]);
    },
  );

  it("logs content-free shadow outcomes without applying any decisions", async () => {
    vi.stubEnv("AI_MEMORY_REVIEW_MODE", "shadow");
    respond({
      subject_0: "unsupported",
      sensitivity_1: "sensitive",
      match_2_0: "equivalent",
      match_3_0: "correction",
    });
    const correction = {
      ...memory,
      candidate: {
        ...memory.candidate,
        evidence: "Correggi: mi alleno giovedì",
      },
    };
    expect(
      await reviewMemoryCandidates({
        ...input,
        userText: `${input.userText}. ${correction.candidate.evidence}`,
        candidates: [memory, memory, memory, correction],
      }),
    ).toEqual(
      Array.from({ length: 4 }, () => ({
        reject: false,
        requiresApproval: false,
      })),
    );
    expect(reviewLog).toHaveBeenCalledExactlyOnceWith(
      "ai.memory.review",
      "Memory review decisions",
      {
        mode: "shadow",
        candidateCount: 4,
        rejectCount: 1,
        equivalentCount: 1,
        correctionCount: 1,
        approvalCount: 1,
        durationMs: 5,
        failureCode: null,
      },
    );
    expect(scheduleTypedDecisionUsage).toHaveBeenCalledOnce();
  });

  it("bounds one batch to 8 candidates and 3 comparison targets each", async () => {
    await reviewMemoryCandidates({
      ...input,
      candidates: Array.from({ length: 8 }, () => memory),
      existingFacts: Array.from({ length: 64 }, (_, index) => ({
        ...existing,
        id: `fact-${index}`,
      })),
    });
    expect(
      Object.keys(vi.mocked(requestTypedDecisions).mock.calls[0][0].questions),
    ).toHaveLength(48);
    vi.mocked(requestTypedDecisions).mockClear();
    expect(
      await reviewMemoryCandidates({
        ...input,
        userText: "x".repeat(12_001),
      }),
    ).toEqual([{ reject: true, requiresApproval: false }]);
    expect(
      await reviewMemoryCandidates({
        ...input,
        candidates: Array.from({ length: 9 }, () => memory),
      }),
    ).toEqual(
      Array.from({ length: 9 }, () => ({
        reject: true,
        requiresApproval: false,
      })),
    );
    expect(requestTypedDecisions).not.toHaveBeenCalled();
  });
});
