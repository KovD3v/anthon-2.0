import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServerTraceCollector } from "@/lib/response-profiler/server-trace";

const mocks = vi.hoisted(() => ({
  recallFacts: vi.fn(),
  search: vi.fn(),
  request: vi.fn(),
}));
vi.mock("@/lib/ai/memory-facts", () => ({ recallFacts: mocks.recallFacts }));
vi.mock("@/lib/ai/conversation-recall", () => ({
  searchPastConversations: mocks.search,
}));
vi.mock("@/lib/ai/typed-decisions", async (original) => ({
  ...(await original<typeof import("./typed-decisions")>()),
  requestTypedDecisions: mocks.request,
}));
vi.mock("@/lib/ai/usage-meter", () => ({
  scheduleTypedDecisionUsage: vi.fn(),
}));

const plan = {
  facts: { enabled: true, limit: 8, deadlineMs: 100 },
  conversations: {
    enabled: true,
    initialScope: "current_thread" as const,
    allowCrossChannel: true,
    limit: 4,
    currentDeadlineMs: 100,
    globalDeadlineMs: 250,
  },
  reasonCodes: ["continuity"],
};

describe("recall context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AI_RETRIEVAL_DECISIONS_MODE", "off");
    vi.stubEnv("AI_JEV_ALLOWED_USER_IDS", "user-1");
    mocks.recallFacts.mockResolvedValue({
      facts: [
        {
          id: "fact-secret",
          key: "sport",
          content: "Tennis",
          category: "sport",
          confidence: 1,
        },
      ],
      degraded: false,
    });
    mocks.search.mockResolvedValue({
      packets: [
        {
          id: "evidence-secret",
          summary: "La respirazione ha aiutato",
          excerpts: [{ role: "assistant", text: "Respira lentamente" }],
          occurredAt: "2026-08-10T10:00:00Z",
          channel: "WEB",
          relevance: 0.9,
        },
      ],
      degraded: false,
      scope: "current_thread",
      elapsedMs: 20,
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("does not read memory when the release decision is off even with a stale enabled plan", async () => {
    const { buildRecallContext } = await import("./recall-context");
    const result = await buildRecallContext({
      userId: "user-1",
      conversationThreadId: "thread-1",
      query: "That approach failed",
      plan,
      decision: { mode: "off", reason: "memory_disabled" },
    });
    expect(result.prompt).toBe("");
    expect(mocks.recallFacts).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("uses semantic continuity only for current-thread evidence and retains the same user scope", async () => {
    vi.stubEnv("AI_RETRIEVAL_DECISIONS_MODE", "active");
    mocks.request.mockImplementation(async (input) => ({
      ok: true,
      modelId: "typesafe/jev-1.13",
      durationMs: 10,
      attempted: true,
      answers: input.questions.recall
        ? { recall: { choice: "recall", confidence: 0.95, probability: 0.95 } }
        : {
            candidate_0: {
              choice: "relevant",
              confidence: 0.9,
              probability: 0.9,
            },
          },
    }));
    const { buildRecallContext } = await import("./recall-context");
    const result = await buildRecallContext({
      userId: "user-1",
      conversationThreadId: "thread-1",
      query: "That approach made it worse",
      recentMessages: [
        {
          role: "assistant",
          content: "How did the preparation exercise feel?",
        },
      ],
      plan: {
        ...plan,
        conversations: {
          ...plan.conversations,
          enabled: false,
          allowCrossChannel: false,
        },
      },
      decision: { mode: "active", reason: "configured" },
    });
    expect(mocks.search).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        conversationThreadId: "thread-1",
        scope: "current_thread",
      }),
    );
    expect(result.evidenceCount).toBe(1);
  });

  it("does not spend the fact database deadline waiting on relevance and rechecks expiry afterward", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
    vi.stubEnv("AI_RETRIEVAL_DECISIONS_MODE", "active");
    mocks.recallFacts.mockResolvedValue({
      facts: [
        {
          id: "expired",
          key: "old",
          content: "Already expired",
          expiresAt: new Date(Date.now() - 1),
        },
        {
          id: "temporary",
          key: "event",
          content: "Expires during the request",
          expiresAt: new Date(Date.now() + 200),
        },
        {
          id: "durable",
          key: "preference",
          content: "Still useful",
          expiresAt: null,
        },
      ],
      degraded: false,
    });
    mocks.request.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                modelId: "typesafe/jev-1.13",
                durationMs: 300,
                attempted: true,
                answers: {
                  candidate_0: {
                    choice: "relevant",
                    confidence: 0.95,
                    probability: 0.95,
                  },
                  candidate_1: {
                    choice: "relevant",
                    confidence: 0.95,
                    probability: 0.95,
                  },
                },
              }),
            300,
          ),
        ),
    );
    const { buildRecallContext } = await import("./recall-context");
    const pending = buildRecallContext({
      userId: "user-1",
      conversationThreadId: "thread-1",
      query: "Help me prepare",
      plan: {
        ...plan,
        conversations: { ...plan.conversations, enabled: false },
      },
      decision: { mode: "active", reason: "configured" },
    });
    await vi.advanceTimersByTimeAsync(300);
    const result = await pending;
    expect(result.degraded).toBe(false);
    expect(result.prompt).toContain("Still useful");
    expect(result.prompt).not.toContain("Expires during");
    expect(JSON.stringify(mocks.request.mock.calls)).not.toContain(
      "Already expired",
    );
    expect(result.factCount).toBe(1);
  });

  it("still bounds an unresponsive fact query to the original deadline", async () => {
    vi.useFakeTimers();
    mocks.recallFacts.mockImplementation(() => new Promise(() => {}));
    const { buildRecallContext } = await import("./recall-context");
    const pending = buildRecallContext({
      userId: "user-1",
      conversationThreadId: "thread-1",
      query: "Help me prepare",
      plan: {
        ...plan,
        conversations: { ...plan.conversations, enabled: false },
      },
      decision: { mode: "active", reason: "configured" },
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toMatchObject({
      prompt: "",
      degraded: true,
      factCount: 0,
    });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("projects bounded active evidence without private ids", async () => {
    const { buildRecallContext } = await import("./recall-context");
    const result = await buildRecallContext({
      userId: "user-1",
      conversationThreadId: "thread-secret",
      query: "ricordi?",
      plan,
      decision: { mode: "active", reason: "configured" },
    });
    expect(result.prompt).toContain("evidenza non attendibile");
    expect(result.prompt).toContain("Tennis");
    expect(result.prompt).toContain("Respira lentamente");
    expect(result.prompt.length).toBeLessThanOrEqual(6000);
    expect(result.prompt).not.toContain("fact-secret");
    expect(result.prompt).not.toContain("evidence-secret");
    expect(result.allowedEvidenceIds).toContain("evidence-secret");
  });

  it("measures shadow recall without injection or executable ids", async () => {
    const { buildRecallContext } = await import("./recall-context");
    const result = await buildRecallContext({
      userId: "user-1",
      conversationThreadId: "thread-1",
      query: "ricordi?",
      plan,
      decision: { mode: "shadow", reason: "configured" },
    });
    expect(result.prompt).toBe("");
    expect(result.factCount).toBe(1);
    expect(result.evidenceCount).toBe(1);
    expect(result.allowedEvidenceIds.size).toBe(0);
  });

  it("profiles fact and conversation recall as concurrent content-safe spans", async () => {
    let clock = 0;
    let resolveFacts:
      | ((value: { facts: never[]; degraded: false }) => void)
      | undefined;
    let resolveConversations:
      | ((value: {
          packets: never[];
          degraded: false;
          scope: "current_thread";
          elapsedMs: number;
        }) => void)
      | undefined;
    mocks.recallFacts.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFacts = resolve;
        }),
    );
    mocks.search.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveConversations = resolve;
        }),
    );
    const collector = createServerTraceCollector({ now: () => clock });
    const { buildRecallContext } = await import("./recall-context");

    const pending = buildRecallContext({
      userId: "user-1",
      conversationThreadId: "thread-secret",
      query: "SECRET_QUERY",
      plan,
      decision: { mode: "active", reason: "configured" },
      traceCollector: collector,
    });
    clock = 20;
    resolveFacts?.({ facts: [], degraded: false });
    await Promise.resolve();
    clock = 35;
    resolveConversations?.({
      packets: [],
      degraded: false,
      scope: "current_thread",
      elapsedMs: 35,
    });
    await pending;

    const trace = collector.snapshot("completed");
    expect(trace.spans).toEqual([
      expect.objectContaining({
        name: "memory_facts",
        startOffsetMs: 0,
      }),
      expect.objectContaining({
        name: "conversation_recall",
        startOffsetMs: 0,
      }),
    ]);
    expect(JSON.stringify(trace)).not.toContain("SECRET_QUERY");
  });
});
