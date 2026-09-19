import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/generated/prisma";

const mocks = vi.hoisted(() => ({
  threadFindFirst: vi.fn(),
  summaryFindUnique: vi.fn(),
  messageFindMany: vi.fn(),
  messageFindFirst: vi.fn(),
  transaction: vi.fn(),
  txThreadFindFirst: vi.fn(),
  txSummaryFindUnique: vi.fn(),
  txSummaryCreate: vi.fn(),
  txSummaryUpdateMany: vi.fn(),
  txMessageCount: vi.fn(),
  queryRaw: vi.fn(),
  generateText: vi.fn(),
  recordAiOperationFailure: vi.fn(),
  trackSupportAiUsage: vi.fn(),
  publishToQueue: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/ai/cost-attribution", () => ({
  recordAiOperationFailure: mocks.recordAiOperationFailure,
}));
vi.mock("ai", () => ({ generateText: mocks.generateText }));
vi.mock("@/lib/db", () => ({
  prisma: {
    conversationThread: { findFirst: mocks.threadFindFirst },
    conversationThreadSummary: { findUnique: mocks.summaryFindUnique },
    message: {
      findMany: mocks.messageFindMany,
      findFirst: mocks.messageFindFirst,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/ai/providers/openrouter", () => ({
  SUB_AGENT_MODEL_ID: "sub-agent-model",
  subAgentModel: "sub-agent",
}));
vi.mock("@/lib/ai/providers/openrouter-routing", () => ({
  getOpenRouterProviderOptionsForModel: vi.fn(() => ({})),
}));
vi.mock("@/lib/ai/usage-meter", () => ({
  trackSupportAiUsage: mocks.trackSupportAiUsage,
}));
vi.mock("@/lib/qstash", () => ({ publishToQueue: mocks.publishToQueue }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: mocks.logError }),
}));

import {
  buildThreadContext,
  processThreadSummaryJob,
  safelyRefreshConversationThreadSummary,
  type ThreadSummaryJob,
} from "./thread-context";

type Row = Pick<Message, "id" | "role" | "parts" | "createdAt">;
type Snapshot = {
  id: string;
  version: number;
  summary: string;
  throughMessageId: string | null;
  throughMessageCreatedAt: Date | null;
};
const job = { conversationThreadId: "thread-1", userId: "user-1" };
const date = new Date("2026-08-14T10:00:00.000Z");
function row(
  index: number,
  role: Row["role"] = index % 2 ? "ASSISTANT" : "USER",
  text = `message ${index}`,
): Row {
  return {
    id: `m-${String(index).padStart(3, "0")}`,
    role,
    parts: [{ type: "text", text }],
    createdAt: date,
  };
}
function rows(count: number, start = 0) {
  return Array.from({ length: count }, (_, index) => row(index + start));
}
function snapshot(message = row(1), version = 3): Snapshot {
  return {
    id: "summary-1",
    version,
    summary: "Existing summary",
    throughMessageId: message.id,
    throughMessageCreatedAt: message.createdAt,
  };
}
const tx = {
  $queryRaw: mocks.queryRaw,
  conversationThread: { findFirst: mocks.txThreadFindFirst },
  conversationThreadSummary: {
    findUnique: mocks.txSummaryFindUnique,
    create: mocks.txSummaryCreate,
    updateMany: mocks.txSummaryUpdateMany,
  },
  message: { count: mocks.txMessageCount },
};

// Stateful timeline for multi-delivery tests. Every invocation still exercises
// the production cursor, budget, complete-turn selection, and queue payload.
function timeline(messages: Row[], initial: Snapshot | null = null) {
  let current = initial;
  mocks.summaryFindUnique.mockImplementation(async () => current);
  mocks.txSummaryFindUnique.mockImplementation(async () => current);
  mocks.messageFindFirst.mockImplementation(
    async ({ where }) =>
      messages.find((message) => message.id === where.id) ?? null,
  );
  mocks.messageFindMany.mockImplementation(async ({ where, take }) => {
    const cursor = where.OR?.[1];
    return messages
      .filter(
        (message) =>
          !cursor ||
          message.createdAt > cursor.createdAt ||
          (message.createdAt.getTime() === cursor.createdAt.getTime() &&
            message.id > cursor.id.gt),
      )
      .slice(0, take);
  });
  mocks.txSummaryCreate.mockImplementation(async ({ data }) => {
    const created: Snapshot = { ...data, id: "summary-1", version: 1 };
    current = created;
    return { id: created.id, version: created.version };
  });
  mocks.txSummaryUpdateMany.mockImplementation(async ({ where, data }) => {
    if (
      !current ||
      current.id !== where.id ||
      current.version !== where.version
    )
      return { count: 0 };
    current = { ...current, ...data, version: current.version + 1 };
    return { count: 1 };
  });
  mocks.generateText.mockImplementation(async () => ({
    text: `Summary ${mocks.generateText.mock.calls.length}`,
    usage: {},
    providerMetadata: {},
  }));
  const queued: ThreadSummaryJob[] = [];
  mocks.publishToQueue.mockImplementation(async (_endpoint, payload) => {
    queued.push(payload);
  });
  return {
    get summary() {
      return current;
    },
    queued,
  };
}

describe("ai/thread-context", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.threadFindFirst.mockResolvedValue({ id: job.conversationThreadId });
    mocks.txThreadFindFirst.mockResolvedValue({ id: job.conversationThreadId });
    mocks.summaryFindUnique.mockResolvedValue(null);
    mocks.txSummaryFindUnique.mockResolvedValue(null);
    mocks.messageFindFirst.mockResolvedValue(null);
    mocks.messageFindMany.mockResolvedValue(rows(12));
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    mocks.queryRaw.mockResolvedValue([]);
    mocks.txMessageCount.mockImplementation(
      async ({ where }) => where.id.in.length,
    );
    mocks.txSummaryCreate.mockResolvedValue({ id: "summary-1", version: 1 });
    mocks.txSummaryUpdateMany.mockResolvedValue({ count: 1 });
    mocks.generateText.mockResolvedValue({
      text: "New summary",
      usage: { inputTokens: 50, outputTokens: 10 },
      providerMetadata: {},
    });
  });

  it("loads only context fields and orders timestamp ties deterministically", async () => {
    mocks.messageFindMany.mockResolvedValue(rows(2).reverse());
    const result = await buildThreadContext("thread-1", {
      includeSummary: false,
      maxRawTurns: 1,
      maxRawChars: 1_000,
    });
    expect(result.includedMessageIds).toEqual(["m-000", "m-001"]);
    expect(mocks.messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, role: true, parts: true, createdAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 40,
      }),
    );
  });

  it("includes a valid summary preceding raw messages with the same timestamp", async () => {
    mocks.summaryFindUnique.mockResolvedValue(snapshot());
    mocks.messageFindMany.mockResolvedValue(rows(2, 2).reverse());
    mocks.messageFindFirst.mockResolvedValue({ id: "m-001" });
    const result = await buildThreadContext("thread-1", {
      includeSummary: true,
      maxRawTurns: 1,
      maxRawChars: 1_000,
    });
    expect(result.summaryMessageId).toBe("m-001");
    expect(mocks.messageFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "m-001",
          deletedAt: null,
          OR: [
            { createdAt: { lt: date } },
            { createdAt: date, id: { lt: "m-002" } },
          ],
        }),
      }),
    );
  });

  it("omits a summary with a deleted checkpoint", async () => {
    mocks.summaryFindUnique.mockResolvedValue(snapshot());
    mocks.messageFindMany.mockResolvedValue(rows(2, 2).reverse());
    const result = await buildThreadContext("thread-1", {
      includeSummary: true,
      maxRawTurns: 1,
      maxRawChars: 1_000,
    });
    expect(result.messages).toHaveLength(2);
    expect(result.summaryMessageId).toBeUndefined();
  });

  it("skips the checkpoint lookup when the summary overlaps visible raw turns", async () => {
    mocks.summaryFindUnique.mockResolvedValue(snapshot());
    mocks.messageFindMany.mockResolvedValue(rows(2).reverse());
    const result = await buildThreadContext("thread-1", {
      includeSummary: true,
      maxRawTurns: 1,
      maxRawChars: 1_000,
    });
    expect(result.summaryMessageId).toBeUndefined();
    expect(mocks.messageFindFirst).not.toHaveBeenCalled();
  });

  it("checks ownership and active source chat before reading or generating", async () => {
    mocks.threadFindFirst.mockResolvedValue(null);
    expect(await processThreadSummaryJob(job)).toBe("unavailable");
    expect(mocks.messageFindMany).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.threadFindFirst).toHaveBeenCalledWith({
      where: {
        id: "thread-1",
        userId: "user-1",
        user: { deletedAt: null },
        OR: [{ chatId: null }, { chat: { userId: "user-1", deletedAt: null } }],
      },
      select: { id: true },
    });
  });

  it("retains the normal small-turn threshold", async () => {
    mocks.messageFindMany.mockResolvedValue(rows(10));
    expect(await processThreadSummaryJob(job)).toBe("unchanged");
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("checkpoints only completed turns, and bounds message and output counts", async () => {
    mocks.messageFindMany.mockResolvedValue(rows(13));
    expect(await processThreadSummaryJob(job)).toBe("updated");
    expect(mocks.messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 40,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    );
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: "sub-agent", maxOutputTokens: 768 }),
    );
    expect(mocks.generateText.mock.calls[0][0].prompt).not.toContain(
      "message 12",
    );
    expect(mocks.txSummaryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          throughMessageId: "m-011",
          throughMessageCreatedAt: date,
        }),
      }),
    );
  });

  it("bounds previous summary and transcript text, preserving whole turns", async () => {
    const existing = { ...snapshot(), summary: "P".repeat(10_000) };
    mocks.summaryFindUnique.mockResolvedValue(existing);
    mocks.txSummaryFindUnique.mockResolvedValue(existing);
    mocks.messageFindFirst.mockResolvedValue(row(1));
    mocks.messageFindMany.mockResolvedValue(
      rows(40, 2).map((message) => ({
        ...message,
        parts: [{ type: "text", text: "T".repeat(10_000) }],
      })),
    );
    await processThreadSummaryJob(job);
    const { prompt } = mocks.generateText.mock.calls[0][0];
    expect(prompt.length).toBeLessThan(28_100);
    expect(prompt).not.toContain("P".repeat(4_001));
    expect(prompt.match(/Utente:/g)).toHaveLength(5);
    expect(prompt.match(/Assistente:/g)).toHaveLength(5);
    expect(mocks.txSummaryUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "summary-1", version: 3 },
        data: expect.objectContaining({
          throughMessageId: "m-011",
          version: { increment: 1 },
        }),
      }),
    );
    expect(mocks.publishToQueue).toHaveBeenCalledOnce();
  });

  it("resumes from the complete createdAt/id tuple", async () => {
    const state = timeline(rows(14), snapshot());
    expect(await processThreadSummaryJob(job)).toBe("updated");
    expect(mocks.messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { createdAt: { gt: date } },
            { createdAt: date, id: { gt: "m-001" } },
          ],
        }),
      }),
    );
    expect(mocks.generateText.mock.calls[0][0].prompt).toContain(
      "Existing summary",
    );
    expect(mocks.generateText.mock.calls[0][0].prompt).not.toContain(
      "message 0\n",
    );
    expect(state.summary).toMatchObject({
      version: 4,
      throughMessageId: "m-013",
    });
  });

  it("rebuilds without reusing a missing or legacy checkpoint", async () => {
    const existing = { ...snapshot(), throughMessageId: null };
    mocks.summaryFindUnique.mockResolvedValue(existing);
    mocks.txSummaryFindUnique.mockResolvedValue(existing);
    await processThreadSummaryJob(job);
    expect(mocks.generateText.mock.calls[0][0].prompt).toContain(
      "Riassunto precedente:\n(nessuno)",
    );
    expect(mocks.generateText.mock.calls[0][0].prompt).not.toContain(
      "Existing summary",
    );
    expect(mocks.messageFindMany.mock.calls[0][0].where.OR).toBeUndefined();
  });

  it.each([
    ["concurrent first creation", null, snapshot()],
    ["newer version", snapshot(), snapshot(row(1), 4)],
    [
      "deleted and recreated summary",
      snapshot(),
      { ...snapshot(), id: "replacement" },
    ],
  ])(
    "discards %s but accounts for the completed model call",
    async (_name, existing, current) => {
      mocks.summaryFindUnique.mockResolvedValue(existing);
      mocks.txSummaryFindUnique.mockResolvedValue(current);
      expect(await processThreadSummaryJob(job)).toBe("stale");
      expect(mocks.trackSupportAiUsage).toHaveBeenCalledOnce();
      expect(mocks.txSummaryCreate).not.toHaveBeenCalled();
      expect(mocks.txSummaryUpdateMany).not.toHaveBeenCalled();
      expect(mocks.publishToQueue).not.toHaveBeenCalled();
    },
  );

  it("rejects deleted sources or ownership changes during generation", async () => {
    mocks.txMessageCount.mockResolvedValue(0);
    expect(await processThreadSummaryJob(job)).toBe("stale");
    expect(mocks.txSummaryCreate).not.toHaveBeenCalled();
    mocks.txThreadFindFirst.mockResolvedValue(null);
    expect(await processThreadSummaryJob(job)).toBe("stale");
    expect(mocks.txSummaryCreate).not.toHaveBeenCalled();
  });

  it("drains a backlog through bounded deliveries, including a sub-threshold tail", async () => {
    const state = timeline(rows(86));
    await processThreadSummaryJob(job);
    expect(state.summary?.throughMessageId).toBe("m-039");
    let deliveries = 0;
    for (
      let next = state.queued.shift();
      next && deliveries < 5;
      next = state.queued.shift()
    ) {
      deliveries++;
      await processThreadSummaryJob(next);
    }
    expect(deliveries).toBe(2);
    expect(state.queued).toHaveLength(0);
    expect(state.summary).toMatchObject({
      version: 3,
      throughMessageId: "m-085",
    });
    expect(mocks.generateText).toHaveBeenCalledTimes(3);
    expect(mocks.generateText.mock.calls[1][0].prompt).toContain(
      "Riassunto precedente:\nSummary 1",
    );
    expect(mocks.generateText.mock.calls[2][0].prompt).toContain("message 84");
    expect(
      mocks.publishToQueue.mock.calls.every(
        (call) =>
          call[0] === "api/queues/thread-summary" && call[2].retries === 3,
      ),
    ).toBe(true);
  });

  it("crosses a full incomplete page without inventing a completed checkpoint", async () => {
    const state = timeline([
      ...rows(40).map((message) => ({ ...message, role: "USER" as const })),
      row(40, "ASSISTANT"),
    ]);
    expect(await processThreadSummaryJob(job)).toBe("continued");
    expect(state.summary).toBeNull();
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(state.queued[0].continuation).toMatchObject({
      after: { id: "m-039", createdAt: date.toISOString() },
      pendingUserId: "m-039",
    });
    expect(await processThreadSummaryJob(state.queued[0])).toBe("updated");
    expect(state.summary?.throughMessageId).toBe("m-040");
    expect(mocks.generateText.mock.calls[0][0].prompt).toContain(
      "Utente: message 39\nAssistente: message 40",
    );
  });

  it("discards a scan cursor from a superseded snapshot", async () => {
    const state = timeline(rows(14), snapshot(row(1), 4));
    await processThreadSummaryJob({
      ...job,
      continuation: {
        summaryId: "summary-1",
        version: 3,
        after: { id: "m-009", createdAt: date.toISOString() },
      },
    });
    expect(mocks.generateText.mock.calls[0][0].prompt).toContain("message 2\n");
    expect(state.summary?.throughMessageId).toBe("m-013");
  });

  it("a retry after a failed queue publish resumes the committed checkpoint", async () => {
    const state = timeline(rows(44));
    mocks.publishToQueue.mockRejectedValueOnce(new Error("queue unavailable"));
    await expect(
      processThreadSummaryJob({
        ...job,
        continuation: { summaryId: null, version: 0 },
      }),
    ).rejects.toThrow("queue unavailable");
    expect(state.summary?.throughMessageId).toBe("m-039");
    await processThreadSummaryJob({
      ...job,
      continuation: { summaryId: null, version: 0 },
    });
    expect(state.summary?.throughMessageId).toBe("m-043");
    expect(mocks.generateText.mock.calls[1][0].prompt).not.toContain(
      "message 0\n",
    );
  });

  it("accounts for provider failures without logging conversation text", async () => {
    const error = new Error("private transcript from provider response");
    mocks.generateText.mockRejectedValue(error);
    await safelyRefreshConversationThreadSummary("thread-1", "user-1");
    expect(mocks.recordAiOperationFailure).toHaveBeenCalledWith(
      "thread_summary",
      "sub-agent-model",
      error,
    );
    expect(mocks.logError).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      {
        errorName: "Error",
        conversationThreadId: "thread-1",
        userId: "user-1",
      },
    );
    expect(mocks.txSummaryCreate).not.toHaveBeenCalled();
  });
});
