import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  messageFindMany: vi.fn(),
  messageDeleteMany: vi.fn(),
  memoryFindMany: vi.fn(),
  memoryDeleteMany: vi.fn(),
  memoryRevisionFindMany: vi.fn(),
  memoryRevisionDeleteMany: vi.fn(),
  memoryApprovalDeleteMany: vi.fn(),
  chunkFindMany: vi.fn(),
  chunkDeleteMany: vi.fn(),
  summaryDeleteMany: vi.fn(),
  chatDelete: vi.fn(),
  invalidateFactCache: vi.fn(),
  invalidatePromptCaches: vi.fn(),
  invalidateRecallEvidence: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

vi.mock("./memory-facts", () => ({
  invalidateFactCache: mocks.invalidateFactCache,
}));

vi.mock("./coaching-context-cache", () => ({
  invalidateCoachingContextPromptCaches: mocks.invalidatePromptCaches,
}));

vi.mock("./conversation-recall", () => ({
  invalidateConversationRecallEvidence: mocks.invalidateRecallEvidence,
}));

import {
  cleanupDerivedDataForMessagesInTransaction,
  deleteMessagesWithDerivedData,
  invalidateAllDerivedCachesForUser,
} from "./deletion-lifecycle";

describe("deletion lifecycle", () => {
  const targetWhere = {
    userId: "user-1",
    chatId: "chat-1",
    OR: [
      { createdAt: { gt: new Date("2026-08-11T10:00:00.000Z") } },
      {
        createdAt: new Date("2026-08-11T10:00:00.000Z"),
        id: { gte: "message-1" },
      },
    ],
  };

  const transaction = {
    $queryRaw: mocks.queryRaw,
    message: {
      findMany: mocks.messageFindMany,
      deleteMany: mocks.messageDeleteMany,
    },
    memory: {
      findMany: mocks.memoryFindMany,
      deleteMany: mocks.memoryDeleteMany,
    },
    memoryRevision: {
      findMany: mocks.memoryRevisionFindMany,
      deleteMany: mocks.memoryRevisionDeleteMany,
    },
    memoryApproval: { deleteMany: mocks.memoryApprovalDeleteMany },
    conversationRecallChunk: {
      findMany: mocks.chunkFindMany,
      deleteMany: mocks.chunkDeleteMany,
    },
    conversationThreadSummary: { deleteMany: mocks.summaryDeleteMany },
    chat: { delete: mocks.chatDelete },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.messageFindMany.mockResolvedValue([
      {
        id: "message-1",
        userId: "user-1",
        conversationThreadId: "thread-1",
      },
      {
        id: "message-2",
        userId: "user-1",
        conversationThreadId: "thread-1",
      },
    ]);
    mocks.queryRaw.mockResolvedValue([]);
    mocks.memoryFindMany.mockResolvedValue([
      {
        id: "memory-1",
        sourceMessageId: "message-1",
        sourceThreadId: "thread-1",
      },
      {
        id: "memory-3",
        sourceMessageId: null,
        sourceThreadId: "thread-1",
      },
    ]);
    mocks.memoryRevisionFindMany.mockResolvedValue([{ id: "revision-1" }]);
    mocks.chunkFindMany.mockResolvedValue([{ id: "chunk-1" }]);
    mocks.memoryDeleteMany.mockResolvedValue({ count: 2 });
    mocks.memoryRevisionDeleteMany.mockResolvedValue({ count: 1 });
    mocks.memoryApprovalDeleteMany.mockResolvedValue({ count: 1 });
    mocks.chunkDeleteMany.mockResolvedValue({ count: 1 });
    mocks.summaryDeleteMany.mockResolvedValue({ count: 1 });
    mocks.messageDeleteMany.mockResolvedValue({ count: 2 });
    mocks.transaction.mockImplementation(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
  });

  it("cleans derived records before deleting the source messages atomically", async () => {
    const result = await deleteMessagesWithDerivedData(targetWhere);

    expect(result.count).toBe(2);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    // Thread lock first, matching the summary commit's lock order, then the
    // message rows; both before any derived record is read.
    expect(mocks.queryRaw).toHaveBeenCalledTimes(2);
    const [[threadLock], [messageLock]] = mocks.queryRaw.mock.calls;
    expect(threadLock.sql).toContain('FROM "ConversationThread"');
    expect(threadLock.values).toEqual(["thread-1"]);
    expect(messageLock.sql).toContain('FROM "Message"');
    expect(mocks.queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.memoryFindMany.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    );
    expect(mocks.memoryFindMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { sourceMessageId: { in: ["message-1", "message-2"] } },
          {
            sourceMessageId: null,
            sourceThreadId: { in: ["thread-1"] },
          },
        ],
      },
      select: {
        id: true,
        sourceMessageId: true,
        sourceThreadId: true,
      },
    });
    expect(mocks.memoryDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["memory-1", "memory-3"] } },
    });
    expect(mocks.memoryRevisionDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["revision-1"] } },
    });
    expect(mocks.chunkDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["chunk-1"] } },
    });
    expect(mocks.summaryDeleteMany).toHaveBeenCalledWith({
      where: { conversationThreadId: { in: ["thread-1"] } },
    });
    expect(mocks.messageDeleteMany).toHaveBeenCalledWith({
      where: targetWhere,
    });
    expect(mocks.invalidateFactCache).toHaveBeenCalledWith("user-1");
    expect(mocks.invalidatePromptCaches).toHaveBeenCalledWith("user-1");
    expect(mocks.invalidateRecallEvidence).toHaveBeenCalledWith({
      userId: "user-1",
      chunkIds: ["chunk-1"],
    });
  });

  it("invalidates every derived cache after account deletion", () => {
    invalidateAllDerivedCachesForUser("user-1");

    expect(mocks.invalidateFactCache).toHaveBeenCalledWith("user-1");
    expect(mocks.invalidatePromptCaches).toHaveBeenCalledWith("user-1");
    expect(mocks.invalidateRecallEvidence).toHaveBeenCalledWith({
      userId: "user-1",
    });
  });

  it("can clean a transaction before a caller performs a different source delete", async () => {
    const result = await cleanupDerivedDataForMessagesInTransaction(
      transaction as never,
      { chatId: "chat-1" },
    );

    expect(result).toMatchObject({
      messageCount: 2,
      userIds: ["user-1"],
      threadIds: ["thread-1"],
    });
    expect(mocks.messageDeleteMany).not.toHaveBeenCalled();
  });
});
