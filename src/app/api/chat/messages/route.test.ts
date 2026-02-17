import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  userFindUnique: vi.fn(),
  messageFindMany: vi.fn(),
  messageFindUnique: vi.fn(),
  messageDeleteMany: vi.fn(),
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

import { DELETE, GET, PATCH } from "./route";

describe("/api/chat/messages route", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.userFindUnique.mockReset();
    mocks.messageFindMany.mockReset();
    mocks.messageFindUnique.mockReset();
    mocks.messageDeleteMany.mockReset();

    mocks.auth.mockResolvedValue({ userId: "clerk_1" });
    mocks.userFindUnique.mockResolvedValue({ id: "user-1" });
    mocks.messageDeleteMany.mockResolvedValue({ count: 2 });
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
      orderBy: { createdAt: "asc" },
      take: 100,
      select: {
        id: true,
        role: true,
        content: true,
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
      orderBy: { createdAt: "asc" },
      take: 100,
      select: {
        id: true,
        role: true,
        content: true,
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
      content: "original",
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
