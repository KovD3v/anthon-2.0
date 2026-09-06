import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  messageFindMany: vi.fn(),
  messageFindFirst: vi.fn(),
  threadFindFirst: vi.fn(),
  generateEmbedding: vi.fn(),
}));

const transaction = {
  $queryRaw: mocks.queryRaw,
  $executeRaw: mocks.executeRaw,
};

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
    $executeRaw: mocks.executeRaw,
    message: {
      findMany: mocks.messageFindMany,
      findFirst: mocks.messageFindFirst,
    },
    conversationThread: { findFirst: mocks.threadFindFirst },
  },
}));

vi.mock("@/lib/ai/embeddings", () => ({
  generateEmbedding: mocks.generateEmbedding,
}));

describe("conversation index", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    mocks.queryRaw.mockResolvedValue([{ id: "message-4" }]);
    mocks.threadFindFirst.mockResolvedValue({ id: "thread-1", channel: "WEB" });
    mocks.messageFindFirst.mockResolvedValue({
      createdAt: new Date("2026-08-11T10:00:00Z"),
    });
    mocks.messageFindMany.mockResolvedValue([
      {
        id: "message-4",
        role: "USER",
        parts: [{ type: "text", text: "La finale mi mette pressione" }],
        mediaType: null,
        createdAt: new Date("2026-08-11T10:00:00Z"),
      },
    ]);
    mocks.generateEmbedding.mockResolvedValue(
      Array.from({ length: 1536 }, () => 0.1),
    );
    mocks.executeRaw.mockResolvedValue(1);
  });

  it("upserts one idempotent chunk for a validated source window", async () => {
    const { indexConversationWindow } = await import("./conversation-index");

    const result = await indexConversationWindow({
      userId: "user-1",
      conversationThreadId: "thread-1",
      throughMessageId: "message-4",
    });

    expect(result.status).toBe("indexed");
    expect(mocks.threadFindFirst).toHaveBeenCalledWith({
      where: { id: "thread-1", userId: "user-1" },
      select: { id: true, channel: true },
    });
    expect(mocks.executeRaw).toHaveBeenCalledOnce();
    expect(mocks.executeRaw.mock.calls[0]?.[0].strings.join(" ")).toContain(
      'INSERT INTO "ConversationRecallChunk"',
    );
  });

  it("skips the write when a source message disappears during embedding", async () => {
    mocks.queryRaw.mockResolvedValue([]);

    const { indexConversationWindow } = await import("./conversation-index");
    const result = await indexConversationWindow({
      userId: "user-1",
      conversationThreadId: "thread-1",
      throughMessageId: "message-4",
    });

    expect(result).toEqual({ status: "skipped" });
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
    expect(mocks.queryRaw.mock.calls[0]?.[0].strings.join(" ")).toContain(
      "FOR KEY SHARE",
    );
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });
});
