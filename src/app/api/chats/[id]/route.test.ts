import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  generateChatTitle: vi.fn(),
  getAuthUser: vi.fn(),
  chatFindFirst: vi.fn(),
  chatUpdate: vi.fn(),
  chatDelete: vi.fn(),
  messageFindMany: vi.fn(),
  messageFindFirst: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
}));

vi.mock("@/lib/ai/chat-title", () => ({
  generateChatTitle: mocks.generateChatTitle,
}));

vi.mock("@/lib/auth", () => ({
  getAuthUser: mocks.getAuthUser,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    chat: {
      findFirst: mocks.chatFindFirst,
      update: mocks.chatUpdate,
      delete: mocks.chatDelete,
    },
    message: {
      findMany: mocks.messageFindMany,
      findFirst: mocks.messageFindFirst,
    },
  },
}));

import { DELETE, GET, PATCH } from "./route";

function params(id = "chat-1"): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

describe("/api/chats/[id] route", () => {
  beforeEach(() => {
    mocks.revalidateTag.mockReset();
    mocks.generateChatTitle.mockReset();
    mocks.getAuthUser.mockReset();
    mocks.chatFindFirst.mockReset();
    mocks.chatUpdate.mockReset();
    mocks.chatDelete.mockReset();
    mocks.messageFindMany.mockReset();
    mocks.messageFindFirst.mockReset();

    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", role: "USER" },
      error: null,
    });

    mocks.chatFindFirst.mockResolvedValue({
      id: "chat-1",
      title: "My Chat",
      visibility: "PRIVATE",
      userId: "user-1",
      createdAt: new Date("2026-02-16T10:00:00.000Z"),
      updatedAt: new Date("2026-02-16T11:00:00.000Z"),
    });

    mocks.messageFindMany.mockResolvedValue([
      {
        id: "m3",
        role: "ASSISTANT",
        content: "third",
        parts: [{ type: "text", text: "third" }],
        createdAt: new Date("2026-02-16T11:00:03.000Z"),
        model: "gpt-4o-mini",
        inputTokens: 10,
        outputTokens: 12,
        costUsd: 0.01,
        generationTimeMs: 230,
        reasoningTimeMs: 22,
        ragUsed: true,
        toolCalls: [{ name: "tool" }],
        attachments: [
          {
            id: "att-1",
            name: "file.txt",
            contentType: "text/plain",
            size: 10,
            blobUrl: "https://example.com/file.txt",
          },
        ],
      },
      {
        id: "m2",
        role: "USER",
        content: "second",
        parts: [{ type: "text", text: "second" }],
        createdAt: new Date("2026-02-16T11:00:02.000Z"),
        model: null,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        generationTimeMs: null,
        reasoningTimeMs: null,
        ragUsed: false,
        toolCalls: null,
        attachments: [],
      },
      {
        id: "m1",
        role: "USER",
        content: "first",
        parts: [{ type: "text", text: "first" }],
        createdAt: new Date("2026-02-16T11:00:01.000Z"),
        model: null,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        generationTimeMs: null,
        reasoningTimeMs: null,
        ragUsed: false,
        toolCalls: null,
        attachments: [],
      },
    ]);

    mocks.messageFindFirst.mockResolvedValue({
      content: "How do I test this route?",
    });
    mocks.generateChatTitle.mockResolvedValue("Generated Title");
    mocks.chatUpdate.mockResolvedValue({
      id: "chat-1",
      title: "Generated Title",
      visibility: "PUBLIC",
      updatedAt: new Date("2026-02-16T12:00:00.000Z"),
    });
    mocks.chatDelete.mockResolvedValue({ id: "chat-1" });
  });

  it("GET returns 401 when auth fails", async () => {
    mocks.getAuthUser.mockResolvedValue({ user: null, error: "Unauthorized" });

    const response = await GET(
      new Request("http://localhost/api/chats/chat-1"),
      {
        params: params(),
      },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("GET returns 404 when chat is not found", async () => {
    mocks.chatFindFirst.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/chats/chat-1"),
      {
        params: params(),
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Chat not found" });
  });

  it("GET returns mapped chat payload with pagination and usage", async () => {
    const response = await GET(
      new Request("http://localhost/api/chats/chat-1?limit=2&cursor=m-cursor"),
      { params: params() },
    );

    expect(response.status).toBe(200);
    expect(mocks.chatFindFirst).toHaveBeenCalledWith({
      where: {
        id: "chat-1",
        OR: [{ userId: "user-1" }, { visibility: "PUBLIC" }],
      },
      select: {
        id: true,
        title: true,
        visibility: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(mocks.messageFindMany).toHaveBeenCalledWith({
      where: { chatId: "chat-1" },
      orderBy: { createdAt: "desc" },
      take: 3,
      cursor: { id: "m-cursor" },
      skip: 1,
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
        reasoningTimeMs: true,
        ragUsed: true,
        toolCalls: true,
        attachments: {
          select: {
            id: true,
            name: true,
            contentType: true,
            size: true,
            blobUrl: true,
          },
        },
      },
    });

    await expect(response.json()).resolves.toEqual({
      id: "chat-1",
      title: "My Chat",
      visibility: "PRIVATE",
      isOwner: true,
      createdAt: "2026-02-16T10:00:00.000Z",
      updatedAt: "2026-02-16T11:00:00.000Z",
      messages: [
        {
          id: "m2",
          role: "user",
          content: "second",
          parts: [{ type: "text", text: "second" }],
          createdAt: "2026-02-16T11:00:02.000Z",
          model: null,
          usage: undefined,
          ragUsed: false,
          toolCalls: null,
          attachments: [],
        },
        {
          id: "m3",
          role: "assistant",
          content: "third",
          parts: [{ type: "text", text: "third" }],
          createdAt: "2026-02-16T11:00:03.000Z",
          model: "gpt-4o-mini",
          usage: {
            inputTokens: 10,
            outputTokens: 12,
            cost: 0.01,
            generationTimeMs: 230,
            reasoningTimeMs: 22,
          },
          ragUsed: true,
          toolCalls: [{ name: "tool" }],
          attachments: [
            {
              id: "att-1",
              name: "file.txt",
              contentType: "text/plain",
              size: 10,
              blobUrl: "https://example.com/file.txt",
            },
          ],
        },
      ],
      pagination: {
        hasMore: true,
        nextCursor: "m2",
      },
    });
  });

  it("GET returns 500 on database errors", async () => {
    mocks.messageFindMany.mockRejectedValue(new Error("db failed"));

    const response = await GET(
      new Request("http://localhost/api/chats/chat-1"),
      {
        params: params(),
      },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch chat",
    });
  });

  it("PATCH returns 401 when auth fails", async () => {
    mocks.getAuthUser.mockResolvedValue({ user: null, error: "Unauthorized" });

    const response = await PATCH(
      new Request("http://localhost/api/chats/chat-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "hello" }),
      }),
      { params: params() },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("PATCH returns 404 when chat is not owned by user", async () => {
    mocks.chatFindFirst.mockResolvedValue(null);

    const response = await PATCH(
      new Request("http://localhost/api/chats/chat-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "hello" }),
      }),
      { params: params() },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Chat not found or access denied",
    });
  });

  it("PATCH auto-generates title from first user message", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/chats/chat-1", {
        method: "PATCH",
        body: JSON.stringify({ generateTitle: true, visibility: "PUBLIC" }),
      }),
      { params: params() },
    );

    expect(response.status).toBe(200);
    expect(mocks.messageFindFirst).toHaveBeenCalledWith({
      where: { chatId: "chat-1", role: "USER" },
      orderBy: { createdAt: "asc" },
      select: { content: true },
    });
    expect(mocks.generateChatTitle).toHaveBeenCalledWith(
      "How do I test this route?",
    );
    expect(mocks.chatUpdate).toHaveBeenCalledWith({
      where: { id: "chat-1" },
      data: {
        title: "Generated Title",
        visibility: "PUBLIC",
      },
      select: {
        id: true,
        title: true,
        visibility: true,
        updatedAt: true,
      },
    });
    expect(mocks.revalidateTag).toHaveBeenCalledWith("chat-chat-1", "page");
    expect(mocks.revalidateTag).toHaveBeenCalledWith("chats-user-1", "page");
    await expect(response.json()).resolves.toEqual({
      id: "chat-1",
      title: "Generated Title",
      visibility: "PUBLIC",
      updatedAt: "2026-02-16T12:00:00.000Z",
    });
  });

  it("PATCH marks customTitle when explicit title is provided", async () => {
    await PATCH(
      new Request("http://localhost/api/chats/chat-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "Manual title" }),
      }),
      { params: params() },
    );

    expect(mocks.generateChatTitle).not.toHaveBeenCalled();
    expect(mocks.chatUpdate).toHaveBeenCalledWith({
      where: { id: "chat-1" },
      data: {
        title: "Manual title",
        customTitle: true,
      },
      select: {
        id: true,
        title: true,
        visibility: true,
        updatedAt: true,
      },
    });
  });

  it("PATCH returns 500 when update fails", async () => {
    mocks.chatUpdate.mockRejectedValue(new Error("update failed"));

    const response = await PATCH(
      new Request("http://localhost/api/chats/chat-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "Manual title" }),
      }),
      { params: params() },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to update chat",
    });
  });

  it("DELETE returns 401 when auth fails", async () => {
    mocks.getAuthUser.mockResolvedValue({ user: null, error: "Unauthorized" });

    const response = await DELETE(
      new Request("http://localhost/api/chats/chat-1", { method: "DELETE" }),
      { params: params() },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("DELETE returns 404 when chat is not owned by user", async () => {
    mocks.chatFindFirst.mockResolvedValue(null);

    const response = await DELETE(
      new Request("http://localhost/api/chats/chat-1", { method: "DELETE" }),
      { params: params() },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Chat not found or access denied",
    });
  });

  it("DELETE removes chat and revalidates cache", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/chats/chat-1", { method: "DELETE" }),
      { params: params() },
    );

    expect(response.status).toBe(200);
    expect(mocks.chatDelete).toHaveBeenCalledWith({ where: { id: "chat-1" } });
    expect(mocks.revalidateTag).toHaveBeenCalledWith("chats-user-1", "page");
    expect(mocks.revalidateTag).toHaveBeenCalledWith("chat-chat-1", "page");
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("DELETE still succeeds when revalidateTag fails", async () => {
    mocks.revalidateTag.mockImplementationOnce(() => {
      throw new Error("revalidation failed");
    });

    const response = await DELETE(
      new Request("http://localhost/api/chats/chat-1", { method: "DELETE" }),
      { params: params() },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("DELETE returns 500 when delete fails", async () => {
    mocks.chatDelete.mockRejectedValue(new Error("delete failed"));

    const response = await DELETE(
      new Request("http://localhost/api/chats/chat-1", { method: "DELETE" }),
      { params: params() },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to delete chat",
    });
  });
});
