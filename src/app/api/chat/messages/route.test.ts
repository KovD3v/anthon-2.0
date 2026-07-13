import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  userFindUnique: vi.fn(),
  messageFindMany: vi.fn(),
  messageFindUnique: vi.fn(),
  messageDeleteMany: vi.fn(),
  deletePrivateVoiceBlobsForMessages: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    message: {
      findMany: mocks.messageFindMany,
      findUnique: mocks.messageFindUnique,
      deleteMany: mocks.messageDeleteMany,
    },
  },
}));

vi.mock("@/lib/voice/attachment-cleanup", () => ({
  deletePrivateVoiceBlobsForMessages: mocks.deletePrivateVoiceBlobsForMessages,
}));

import { DELETE, GET, PATCH } from "./route";

describe("/api/chat/messages route", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.userFindUnique.mockReset();
    mocks.messageFindMany.mockReset();
    mocks.messageFindUnique.mockReset();
    mocks.messageDeleteMany.mockReset();
    mocks.deletePrivateVoiceBlobsForMessages.mockReset();

    mocks.auth.mockResolvedValue({ userId: "clerk_1" });
    mocks.userFindUnique.mockResolvedValue({ id: "user-1" });
    mocks.messageDeleteMany.mockResolvedValue({ count: 2 });
    mocks.deletePrivateVoiceBlobsForMessages.mockResolvedValue(0);
  });

  it("GET returns 401 when Clerk auth has no userId", async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await GET(
      new Request("http://localhost/api/chat/messages?chatId=chat-1"),
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
  });

  it("GET returns empty messages when user record does not exist", async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/chat/messages?chatId=chat-1"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ messages: [] });
  });

  it("GET fetches chat-specific messages when chatId is provided", async () => {
    mocks.messageFindMany.mockResolvedValue([
      {
        id: "m1",
        role: "USER",
        content: "hello",
        parts: [{ type: "text", text: "hello" }],
        createdAt: new Date("2026-02-16T10:00:00.000Z"),
        model: null,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        generationTimeMs: null,
      },
      {
        id: "m2",
        role: "ASSISTANT",
        content: "hi",
        parts: [{ type: "text", text: "hi" }],
        createdAt: new Date("2026-02-16T10:00:01.000Z"),
        model: "gpt-4o-mini",
        inputTokens: 10,
        outputTokens: 25,
        costUsd: 0.02,
        generationTimeMs: 180,
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/chat/messages?chatId=chat-1"),
    );

    expect(response.status).toBe(200);
    expect(mocks.messageFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        chatId: "chat-1",
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      select: {
        id: true,
        role: true,
        parts: true,
        createdAt: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        costUsd: true,
        generationTimeMs: true,
      },
    });
    await expect(response.json()).resolves.toEqual({
      messages: [
        {
          id: "m1",
          role: "user",
          content: "hello",
          parts: [{ type: "text", text: "hello" }],
          createdAt: "2026-02-16T10:00:00.000Z",
          model: null,
          usage: undefined,
        },
        {
          id: "m2",
          role: "assistant",
          content: "hi",
          parts: [{ type: "text", text: "hi" }],
          createdAt: "2026-02-16T10:00:01.000Z",
          model: "gpt-4o-mini",
          usage: {
            inputTokens: 10,
            outputTokens: 25,
            cost: 0.02,
            generationTimeMs: 180,
          },
        },
      ],
    });
  });

  it("GET returns the newest 100 messages in chronological order", async () => {
    const allMessages = Array.from({ length: 101 }, (_, index) => ({
      id: `m${index}`,
      role: "USER",
      parts: [{ type: "text", text: `message ${index}` }],
      createdAt: new Date(Date.UTC(2026, 1, 16, 10, 0, index)),
      model: null,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      generationTimeMs: null,
    }));

    // Prisma returns the selected newest window in the requested descending order.
    mocks.messageFindMany.mockResolvedValue(
      [...allMessages].slice(1).reverse(),
    );

    const response = await GET(
      new Request("http://localhost/api/chat/messages?chatId=chat-1"),
    );

    expect(response.status).toBe(200);
    expect(mocks.messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 100,
      }),
    );

    const { messages } = (await response.json()) as {
      messages: Array<{ createdAt: string; id: string }>;
    };

    expect(messages).toHaveLength(100);
    expect(messages.map((message) => message.id)).toEqual(
      allMessages.slice(1).map((message) => message.id),
    );
    expect(messages.map((message) => message.createdAt)).toEqual(
      allMessages.slice(1).map((message) => message.createdAt.toISOString()),
    );
  });

  it("GET falls back to WEB/TEXT query when chatId is absent", async () => {
    mocks.messageFindMany.mockResolvedValue([]);

    const response = await GET(
      new Request("http://localhost/api/chat/messages"),
    );

    expect(response.status).toBe(200);
    expect(mocks.messageFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        channel: "WEB",
        type: "TEXT",
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      select: {
        id: true,
        role: true,
        parts: true,
        createdAt: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        costUsd: true,
        generationTimeMs: true,
      },
    });
    await expect(response.json()).resolves.toEqual({ messages: [] });
  });

  it("GET derives content from the first text part and skips non-text parts", async () => {
    mocks.messageFindMany.mockResolvedValue([
      {
        id: "m1",
        role: "USER",
        parts: [
          { type: "text", text: "Guarda questa immagine" },
          {
            type: "file",
            mimeType: "image/png",
            url: "https://blob.example/photo.png",
          },
          { type: "text", text: " e dimmi cosa correggere" },
        ],
        createdAt: new Date("2026-02-16T10:00:00.000Z"),
        model: null,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        generationTimeMs: null,
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/chat/messages?chatId=chat-1"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      messages: [
        {
          id: "m1",
          role: "user",
          content: "Guarda questa immagine",
          parts: [
            { type: "text", text: "Guarda questa immagine" },
            {
              type: "file",
              mimeType: "image/png",
              url: "https://blob.example/photo.png",
            },
            { type: "text", text: " e dimmi cosa correggere" },
          ],
          createdAt: "2026-02-16T10:00:00.000Z",
          model: null,
        },
      ],
    });
  });

  it("GET returns 500 on unexpected errors", async () => {
    mocks.userFindUnique.mockRejectedValue(new Error("db failure"));

    const response = await GET(
      new Request("http://localhost/api/chat/messages?chatId=chat-1"),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });

  it("DELETE returns 401 when Clerk auth has no userId", async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await DELETE(
      new Request("http://localhost/api/chat/messages?id=m1", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("DELETE returns 400 when message ID is missing", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/chat/messages", { method: "DELETE" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Message ID is required",
    });
  });

  it("DELETE returns 404 when user is not found", async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    const response = await DELETE(
      new Request("http://localhost/api/chat/messages?id=m1", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "User not found" });
  });

  it("DELETE returns 404 when message is not found", async () => {
    mocks.messageFindUnique.mockResolvedValue(null);

    const response = await DELETE(
      new Request("http://localhost/api/chat/messages?id=m1", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Message not found",
    });
  });

  it("DELETE returns 403 when message does not belong to user", async () => {
    mocks.messageFindUnique.mockResolvedValue({
      id: "m1",
      userId: "user-2",
      role: "USER",
      chatId: "chat-1",
      createdAt: new Date("2026-02-16T10:00:00.000Z"),
    });

    const response = await DELETE(
      new Request("http://localhost/api/chat/messages?id=m1", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("DELETE returns 400 when role is not USER", async () => {
    mocks.messageFindUnique.mockResolvedValue({
      id: "m1",
      userId: "user-1",
      role: "ASSISTANT",
      chatId: "chat-1",
      createdAt: new Date("2026-02-16T10:00:00.000Z"),
    });

    const response = await DELETE(
      new Request("http://localhost/api/chat/messages?id=m1", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Only user messages can be deleted",
    });
  });

  it("DELETE cascades from selected message onward", async () => {
    const createdAt = new Date("2026-02-16T10:00:00.000Z");
    mocks.messageFindUnique.mockResolvedValue({
      id: "m1",
      userId: "user-1",
      role: "USER",
      chatId: "chat-1",
      createdAt,
    });

    const response = await DELETE(
      new Request("http://localhost/api/chat/messages?id=m1", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.deletePrivateVoiceBlobsForMessages).toHaveBeenCalledWith({
      userId: "user-1",
      chatId: "chat-1",
      createdAt: { gte: createdAt },
    });
    expect(mocks.messageDeleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        chatId: "chat-1",
        createdAt: {
          gte: createdAt,
        },
      },
    });
    await expect(response.json()).resolves.toEqual({
      success: true,
      deletedCount: 2,
    });
  });

  it("DELETE returns 500 when delete fails", async () => {
    mocks.messageFindUnique.mockResolvedValue({
      id: "m1",
      userId: "user-1",
      role: "USER",
      chatId: "chat-1",
      createdAt: new Date("2026-02-16T10:00:00.000Z"),
    });
    mocks.messageDeleteMany.mockRejectedValue(new Error("delete failed"));

    const response = await DELETE(
      new Request("http://localhost/api/chat/messages?id=m1", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });

  it("DELETE keeps messages when private voice cleanup fails", async () => {
    const createdAt = new Date("2026-02-16T10:00:00.000Z");
    mocks.messageFindUnique.mockResolvedValue({
      id: "m1",
      userId: "user-1",
      role: "USER",
      chatId: "chat-1",
      createdAt,
    });
    mocks.deletePrivateVoiceBlobsForMessages.mockRejectedValue(
      new Error("blob cleanup failed"),
    );

    const response = await DELETE(
      new Request("http://localhost/api/chat/messages?id=m1", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(500);
    expect(mocks.messageDeleteMany).not.toHaveBeenCalled();
  });

  it("PATCH returns 401 when Clerk auth has no userId", async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await PATCH(
      new Request("http://localhost/api/chat/messages", {
        method: "PATCH",
        body: JSON.stringify({ messageId: "m1", content: "edited" }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("PATCH returns 400 when messageId is missing", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/chat/messages", {
        method: "PATCH",
        body: JSON.stringify({ content: "edited" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Message ID is required",
    });
  });

  it("PATCH returns 400 when request body is malformed JSON", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/chat/messages", {
        method: "PATCH",
        body: "{",
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid request body",
    });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.messageFindUnique).not.toHaveBeenCalled();
    expect(mocks.messageDeleteMany).not.toHaveBeenCalled();
  });

  it("PATCH returns 400 when content is not a string", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/chat/messages", {
        method: "PATCH",
        body: JSON.stringify({ messageId: "m1", content: { text: "edited" } }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "content must be a string",
    });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.messageFindUnique).not.toHaveBeenCalled();
    expect(mocks.messageDeleteMany).not.toHaveBeenCalled();
  });

  it("PATCH returns 404 when message is not found", async () => {
    mocks.messageFindUnique.mockResolvedValue(null);

    const response = await PATCH(
      new Request("http://localhost/api/chat/messages", {
        method: "PATCH",
        body: JSON.stringify({ messageId: "m1", content: "edited" }),
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Message not found",
    });
  });

  it("PATCH returns 403 for non-owned messages", async () => {
    mocks.messageFindUnique.mockResolvedValue({
      id: "m1",
      userId: "user-2",
      role: "USER",
      chatId: "chat-1",
      createdAt: new Date("2026-02-16T10:00:00.000Z"),
      content: "original",
    });

    const response = await PATCH(
      new Request("http://localhost/api/chat/messages", {
        method: "PATCH",
        body: JSON.stringify({ messageId: "m1", content: "edited" }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("PATCH returns 400 when role is not USER", async () => {
    mocks.messageFindUnique.mockResolvedValue({
      id: "m1",
      userId: "user-1",
      role: "ASSISTANT",
      chatId: "chat-1",
      createdAt: new Date("2026-02-16T10:00:00.000Z"),
      content: "assistant",
    });

    const response = await PATCH(
      new Request("http://localhost/api/chat/messages", {
        method: "PATCH",
        body: JSON.stringify({ messageId: "m1", content: "edited" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Only user messages can be edited",
    });
  });

  it("PATCH cascades delete and returns supplied content", async () => {
    const createdAt = new Date("2026-02-16T10:00:00.000Z");
    mocks.messageFindUnique.mockResolvedValue({
      id: "m1",
      userId: "user-1",
      role: "USER",
      chatId: "chat-1",
      createdAt,
      content: "original",
    });

    const response = await PATCH(
      new Request("http://localhost/api/chat/messages", {
        method: "PATCH",
        body: JSON.stringify({ messageId: "m1", content: "edited text" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.deletePrivateVoiceBlobsForMessages).toHaveBeenCalledWith({
      userId: "user-1",
      chatId: "chat-1",
      createdAt: { gte: createdAt },
    });
    expect(mocks.messageDeleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        chatId: "chat-1",
        createdAt: {
          gte: createdAt,
        },
      },
    });
    await expect(response.json()).resolves.toEqual({
      success: true,
      deletedCount: 2,
      chatId: "chat-1",
      newContent: "edited text",
    });
  });

  it("PATCH falls back to original content when new content is not provided", async () => {
    mocks.messageFindUnique.mockResolvedValue({
      id: "m1",
      userId: "user-1",
      role: "USER",
      chatId: "chat-1",
      createdAt: new Date("2026-02-16T10:00:00.000Z"),
      parts: [{ type: "text", text: "original" }],
    });

    const response = await PATCH(
      new Request("http://localhost/api/chat/messages", {
        method: "PATCH",
        body: JSON.stringify({ messageId: "m1" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      chatId: "chat-1",
      newContent: "original",
    });
  });

  it("PATCH returns 500 when delete fails", async () => {
    mocks.messageFindUnique.mockResolvedValue({
      id: "m1",
      userId: "user-1",
      role: "USER",
      chatId: "chat-1",
      createdAt: new Date("2026-02-16T10:00:00.000Z"),
      content: "original",
    });
    mocks.messageDeleteMany.mockRejectedValue(new Error("delete failed"));

    const response = await PATCH(
      new Request("http://localhost/api/chat/messages", {
        method: "PATCH",
        body: JSON.stringify({ messageId: "m1", content: "edited" }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });
});
