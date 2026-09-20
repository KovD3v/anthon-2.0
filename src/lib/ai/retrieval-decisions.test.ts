import type { ModelMessage } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planRecall } from "./recall-planner";
import { rankRetrievedItems, refineRecallPlan } from "./retrieval-decisions";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  usage: vi.fn(),
  info: vi.fn(),
}));
vi.mock("./typed-decisions", async (original) => ({
  ...(await original<typeof import("./typed-decisions")>()),
  requestTypedDecisions: mocks.request,
}));
vi.mock("./usage-meter", () => ({ scheduleTypedDecisionUsage: mocks.usage }));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ info: mocks.info }) }));

const active = { mode: "active" as const, reason: "configured" };
const message = "That approach you suggested made it worse";
const recentMessages: ModelMessage[] = [
  { role: "user", content: "I froze during yesterday's presentation." },
  { role: "assistant", content: "How did the preparation exercise feel?" },
];
const metadata = {
  modelId: "typesafe/jev-1.13",
  durationMs: 10,
  attempted: true,
};
const result = (
  answers: Record<
    string,
    { choice: string; confidence: number; probability?: number }
  >,
) => ({
  ...metadata,
  ok: true,
  answers,
});
const recallInput = () => ({
  userId: "user-1",
  message,
  recentMessages,
  plan: planRecall({ message, decision: active, isGuest: false }),
  decision: active,
});
const items = [
  "wrong person",
  "uncertain context",
  "useful",
  "low confidence",
  "also useful",
];
const rankingInput = () => ({
  userId: "user-1",
  query: "help with my presentation",
  source: "memory" as const,
  items,
  describe: (item: string) => item,
  recentMessages,
});

describe("Jev retrieval decisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AI_RETRIEVAL_DECISIONS_MODE", "active");
    vi.stubEnv("AI_JEV_ALLOWED_USER_IDS", "user-1");
    mocks.request.mockResolvedValue(
      result({
        recall: { choice: "recall", confidence: 0.95, probability: 0.95 },
      }),
    );
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["", "user-1", "user-1"],
    ["off", "user-1", "user-1"],
    ["active", "*", "user-1"],
    ["active", "user-12", "user-1"],
    ["active", "user-1", undefined],
  ])(
    "keeps %s / cohort %s / user %s outside new decisions",
    async (mode, allowed, userId) => {
      vi.stubEnv("AI_RETRIEVAL_DECISIONS_MODE", mode);
      vi.stubEnv("AI_JEV_ALLOWED_USER_IDS", allowed);
      const input = { ...recallInput(), userId };
      expect(await refineRecallPlan(input)).toBe(input.plan);
      expect(await rankRetrievedItems({ ...rankingInput(), userId })).toBe(
        items,
      );
      expect(mocks.request).not.toHaveBeenCalled();
    },
  );

  it("adds bounded current-thread recall for a paraphrased continuation", async () => {
    const input = recallInput();
    expect(input.plan.conversations.enabled).toBe(false);
    const refined = await refineRecallPlan(input);
    expect(refined.conversations).toEqual({
      ...input.plan.conversations,
      enabled: true,
      allowCrossChannel: false,
    });
    expect(refined.facts).toBe(input.plan.facts);
    expect(refined.reasonCodes).toContain("semantic_continuity");
    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 750 }),
    );
    expect(mocks.usage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        operation: "retrieval_planning",
        userId: "user-1",
      }),
    );
  });

  it("keeps deterministic paths, guests and disabled memory out of semantic planning", async () => {
    const cases = [
      { message: "Ne avevamo parlato", decision: active, isGuest: false },
      { message: "calcola 3 + 4", decision: active, isGuest: false },
      { message, decision: active, isGuest: true },
      {
        message,
        decision: { mode: "off" as const, reason: "memory_disabled" },
        isGuest: false,
      },
    ];
    for (const entry of cases) {
      const plan = planRecall(entry);
      expect(await refineRecallPlan({ ...recallInput(), ...entry, plan })).toBe(
        plan,
      );
    }
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it.each([
    "The cue you suggested feels too complicated during my performance.",
    "La sequenza che avevi consigliato aumenta la confusione.",
    "The layout you proposed needs a shorter introduction.",
    "L’apertura che avevi indicato per il seminario è troppo formale.",
    "Vorrei adattare quegli esercizi al mio laboratorio.",
  ])(
    "checks a past-advice or plural reference: %s",
    async (message) => {
      const input = {
        ...recallInput(),
        message,
        plan: planRecall({ message, decision: active, isGuest: false }),
      };
      expect(input.plan.conversations.enabled).toBe(false);
      expect((await refineRecallPlan(input)).conversations).toMatchObject({
        enabled: true,
        allowCrossChannel: false,
      });
      mocks.request.mockResolvedValue(
        result({
          recall: {
            choice: "self_contained",
            confidence: 0.99,
            probability: 0.99,
          },
        }),
      );
      expect(await refineRecallPlan(input)).toBe(input.plan);
      expect(mocks.request).toHaveBeenCalledTimes(2);
    },
  );

  it("requires recent textual evidence and skips self-contained requests", async () => {
    await refineRecallPlan({ ...recallInput(), recentMessages: [] });
    await refineRecallPlan({
      ...recallInput(),
      message: "Help me prepare an exam",
    });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it.each([
    result({ recall: { choice: "recall", confidence: 0.6, probability: 0.6 } }),
    result({
      recall: { choice: "uncertain", confidence: 0.99, probability: 0.99 },
    }),
    { ...metadata, ok: false, failureCode: "timeout" },
  ])(
    "preserves the deterministic plan on uncertainty or timeout",
    async (response) => {
      mocks.request.mockResolvedValue(response);
      const input = recallInput();
      expect(await refineRecallPlan(input)).toBe(input.plan);
    },
  );

  it("batches candidates and retains uncertain evidence in its original relative order", async () => {
    mocks.request.mockResolvedValue(
      result({
        candidate_0: {
          choice: "irrelevant",
          confidence: 0.99,
          probability: 0.99,
        },
        candidate_1: {
          choice: "uncertain",
          confidence: 0.99,
          probability: 0.99,
        },
        candidate_2: {
          choice: "relevant",
          confidence: 0.92,
          probability: 0.92,
        },
        candidate_3: {
          choice: "irrelevant",
          confidence: 0.4,
          probability: 0.4,
        },
        candidate_4: {
          choice: "relevant",
          confidence: 0.96,
          probability: 0.96,
        },
      }),
    );
    expect(await rankRetrievedItems(rankingInput())).toEqual([
      items[2],
      items[4],
      items[1],
      items[3],
    ]);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutMs: 600,
        state: expect.objectContaining({ source: "memory" }),
        questions: expect.objectContaining({
          candidate_0: expect.anything(),
          candidate_4: expect.anything(),
        }),
      }),
    );
    expect(mocks.usage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ operation: "retrieval_ranking" }),
    );
  });

  it("uses probability with a stricter gate for removing evidence", async () => {
    mocks.request.mockResolvedValue(
      result({
        recall: { choice: "recall", confidence: 0.4, probability: 0.82 },
      }),
    );
    expect((await refineRecallPlan(recallInput())).conversations.enabled).toBe(
      true,
    );
    mocks.request.mockResolvedValue(
      result({
        candidate_0: { choice: "irrelevant", confidence: 1, probability: 0.89 },
        candidate_1: { choice: "irrelevant", confidence: 1 },
        candidate_2: { choice: "relevant", confidence: 0.4, probability: 0.82 },
        candidate_3: {
          choice: "irrelevant",
          confidence: 0.6,
          probability: 0.95,
        },
        candidate_4: { choice: "relevant", confidence: 1, probability: 0.79 },
      }),
    );
    expect(await rankRetrievedItems(rankingInput())).toEqual([
      items[2],
      items[0],
      items[1],
      items[4],
    ]);
    mocks.request.mockResolvedValue(
      result({
        recall: { choice: "recall", confidence: 1 },
      }),
    );
    const input = recallInput();
    expect(await refineRecallPlan(input)).toBe(input.plan);
  });

  it("bounds transmitted data without discarding unassessed candidates", async () => {
    const many = Array.from({ length: 20 }, (_, i) => `item${i}`);
    mocks.request.mockResolvedValue(result({}));
    expect(
      await rankRetrievedItems({
        ...rankingInput(),
        items: many,
        describe: () => "x".repeat(5_000),
        query: "q".repeat(5_000),
        recentMessages: [
          { role: "system", content: "SYSTEM_SECRET" },
          ...Array.from(
            { length: 20 },
            (): ModelMessage => ({ role: "user", content: "c".repeat(5_000) }),
          ),
        ],
      }),
    ).toEqual(many);
    const request = mocks.request.mock.calls[0][0];
    expect(Object.keys(request.questions)).toHaveLength(12);
    expect(request.state.candidates).toHaveLength(12);
    expect(request.state.candidates[0].text).toHaveLength(1_200);
    expect(request.state.query).toHaveLength(2_000);
    expect(request.state.recentMessages).toHaveLength(4);
    expect(request.state.recentMessages[0].text).toHaveLength(800);
    expect(JSON.stringify(request)).not.toContain("SYSTEM_SECRET");
  });

  it.each(["timeout", "invalid_output", "provider_error"])(
    "preserves original evidence after %s",
    async (failureCode) => {
      mocks.request.mockResolvedValue({ ...metadata, ok: false, failureCode });
      expect(await rankRetrievedItems(rankingInput())).toBe(items);
    },
  );

  it("keeps shadow output unchanged and logs no conversation or fact text", async () => {
    vi.stubEnv("AI_RETRIEVAL_DECISIONS_MODE", "shadow");
    const input = recallInput();
    expect(await refineRecallPlan(input)).toBe(input.plan);
    mocks.request.mockResolvedValue(
      result({
        candidate_0: {
          choice: "irrelevant",
          confidence: 0.99,
          probability: 0.99,
        },
      }),
    );
    expect(await rankRetrievedItems(rankingInput())).toBe(items);
    const logs = JSON.stringify(mocks.info.mock.calls);
    expect(logs).not.toContain(message);
    expect(logs).not.toContain(items[0]);
    expect(logs).toContain('"mode":"shadow"');
  });

  it("propagates cancellation before and after the request", async () => {
    const before = new AbortController();
    before.abort();
    await expect(
      rankRetrievedItems({ ...rankingInput(), abortSignal: before.signal }),
    ).rejects.toThrow();
    expect(mocks.request).not.toHaveBeenCalled();
    const during = new AbortController();
    mocks.request.mockImplementation(async () => {
      during.abort();
      return { ...metadata, ok: false, failureCode: "timeout" };
    });
    await expect(
      refineRecallPlan({ ...recallInput(), abortSignal: during.signal }),
    ).rejects.toThrow();
    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: during.signal }),
    );
  });
});
