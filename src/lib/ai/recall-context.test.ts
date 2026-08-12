import { beforeEach, describe, expect, it, vi } from "vitest";
import { createServerTraceCollector } from "@/lib/response-profiler/server-trace";

const mocks = vi.hoisted(() => ({ recallFacts: vi.fn(), search: vi.fn() }));
vi.mock("@/lib/ai/memory-facts", () => ({ recallFacts: mocks.recallFacts }));
vi.mock("@/lib/ai/conversation-recall", () => ({
  searchPastConversations: mocks.search,
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
