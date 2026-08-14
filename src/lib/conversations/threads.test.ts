import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  threadFindUnique: vi.fn(),
  threadUpdate: vi.fn(),
  threadUpsert: vi.fn(),
  traceUpdateMany: vi.fn(),
  chatFindFirst: vi.fn(),
  transaction: vi.fn(),
  txThreadFindUnique: vi.fn(),
  txThreadUpdate: vi.fn(),
  txTraceUpdateMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    conversationThread: {
      findUnique: mocks.threadFindUnique,
      update: mocks.threadUpdate,
      upsert: mocks.threadUpsert,
    },
    aiTurnTrace: { updateMany: mocks.traceUpdateMany },
    chat: { findFirst: mocks.chatFindFirst },
    $transaction: mocks.transaction,
  },
}));

import { ensureConversationThread } from "./threads";

describe("ensureConversationThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.threadFindUnique.mockResolvedValue(null);
    mocks.threadUpsert.mockResolvedValue({
      id: "thread-1",
      userId: "user-1",
      channel: "WEB",
      chatId: "chat-1",
    });
    mocks.transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          conversationThread: {
            findUnique: mocks.txThreadFindUnique,
            update: mocks.txThreadUpdate,
          },
          aiTurnTrace: { updateMany: mocks.txTraceUpdateMany },
        }),
    );
  });

  it("repairs a web thread left under the converted guest owner", async () => {
    mocks.threadUpsert.mockRejectedValue(
      Object.assign(new Error("chatId already used"), { code: "P2002" }),
    );
    mocks.threadFindUnique.mockResolvedValue({
      id: "thread-legacy",
      userId: "guest-1",
      channel: "WEB",
      externalThreadId: "chat-1",
      chatId: "chat-1",
    });
    mocks.chatFindFirst.mockResolvedValue({ id: "chat-1" });
    mocks.txThreadFindUnique
      .mockResolvedValueOnce({
        id: "thread-legacy",
        userId: "guest-1",
        channel: "WEB",
        chatId: "chat-1",
      })
      .mockResolvedValueOnce(null);
    mocks.txThreadUpdate.mockResolvedValue({
      id: "thread-legacy",
      userId: "user-1",
      channel: "WEB",
      chatId: "chat-1",
    });

    await expect(
      ensureConversationThread({
        userId: "user-1",
        channel: "WEB",
        externalThreadId: "chat-1",
        chatId: "chat-1",
      }),
    ).resolves.toEqual({
      id: "thread-legacy",
      userId: "user-1",
      channel: "WEB",
      chatId: "chat-1",
    });

    expect(mocks.chatFindFirst).toHaveBeenCalledWith({
      where: { id: "chat-1", userId: "user-1" },
      select: { id: true },
    });
    expect(mocks.txThreadUpdate).toHaveBeenCalledWith({
      where: { id: "thread-legacy" },
      data: { userId: "user-1", updatedAt: expect.any(Date) },
      select: {
        id: true,
        userId: true,
        channel: true,
        chatId: true,
      },
    });
    expect(mocks.txTraceUpdateMany).toHaveBeenCalledWith({
      where: { conversationThreadId: "thread-legacy" },
      data: { userId: "user-1" },
    });
    expect(mocks.threadUpsert).toHaveBeenCalledTimes(1);
  });

  it("uses the normal upsert when no legacy web thread exists", async () => {
    await expect(
      ensureConversationThread({
        userId: "user-1",
        channel: "WEB",
        externalThreadId: "chat-1",
        chatId: "chat-1",
      }),
    ).resolves.toEqual({
      id: "thread-1",
      userId: "user-1",
      channel: "WEB",
      chatId: "chat-1",
    });

    expect(mocks.threadUpsert).toHaveBeenCalledWith({
      where: {
        userId_channel_externalThreadId: {
          userId: "user-1",
          channel: "WEB",
          externalThreadId: "chat-1",
        },
      },
      update: { updatedAt: expect.any(Date) },
      create: {
        userId: "user-1",
        channel: "WEB",
        externalThreadId: "chat-1",
        chatId: "chat-1",
      },
      select: { id: true, userId: true, channel: true, chatId: true },
    });
    expect(mocks.threadFindUnique).not.toHaveBeenCalled();
  });
});
