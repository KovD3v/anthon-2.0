import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  generateChatTitle: vi.fn(),
  authenticateGuest: vi.fn(),
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

vi.mock("@/lib/guest-auth", () => ({
  authenticateGuest: mocks.authenticateGuest,
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

function params(id = "chat-1") {
  return Promise.resolve({ id });
}

describe("/api/guest/chats/[id] route", () => {
  beforeEach(() => {
    mocks.revalidateTag.mockReset();
    mocks.generateChatTitle.mockReset();
    mocks.authenticateGuest.mockReset();
    mocks.chatFindFirst.mockReset();
    mocks.chatUpdate.mockReset();
    mocks.chatDelete.mockReset();
    mocks.messageFindMany.mockReset();
    mocks.messageFindFirst.mockReset();

    mocks.authenticateGuest.mockResolvedValue({
      user: { id: "guest-1", isGuest: true },
    });

    mocks.chatFindFirst.mockResolvedValue({
      id: "chat-1",
      title: "Guest Chat",
      visibility: "PRIVATE",
      userId: "guest-1",
      createdAt: new Date("2026-02-16T10:00:00.000Z"),
      updatedAt: new Date("2026-02-16T11:00:00.000Z"),
    });

    mocks.messageFindMany.mockResolvedValue([
      {
        id: "m3",
        role: "ASSISTANT",
        content: "Third",
        parts: [{ type: "text", text: "Third" }],
        createdAt: new Date("2026-02-16T11:00:03.000Z"),
        model: "gpt-4o-mini",
        inputTokens: 10,
        outputTokens: 15,
        costUsd: 0.01,
        generationTimeMs: 180,
        ragUsed: true,
        toolCalls: [{ name: "search" }],
      },
      {
        id: "m2",
        role: "USER",
        content: "Second",
        parts: [{ type: "text", text: "Second" }],
        createdAt: new Date("2026-02-16T11:00:02.000Z"),
        model: null,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        generationTimeMs: null,
        ragUsed: false,
        toolCalls: null,
      },
      {
        id: "m1",
        role: "USER",
        content: "First",
        parts: [{ type: "text", text: "First" }],
        createdAt: new Date("2026-02-16T11:00:01.000Z"),
        model: null,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        generationTimeMs: null,
        ragUsed: false,
        toolCalls: null,
      },
    ]);

    mocks.messageFindFirst.mockResolvedValue({ content: "First user prompt" });
    mocks.generateChatTitle.mockResolvedValue("Generated Guest Title");
    mocks.chatUpdate.mockResolvedValue({
      id: "chat-1",
      title: "Generated Guest Title",
      visibility: "PRIVATE",
      updatedAt: new Date("2026-02-16T12:00:00.000Z"),
    });
    mocks.chatDelete.mockResolvedValue({ id: "chat-1" });
  });

  it("GET returns 404 when chat is not found", async () => {
    mocks.chatFindFirst.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/guest/chats/chat-1"),
      { params: params() },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Chat not found" });
  });

  it("GET returns 400 when limit is not a positive integer", async () => {
    const response = await GET(
      new Request("http://localhost/api/guest/chats/chat-1?limit=oops"),
      { params: params() },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "limit must be a positive integer",
    });
    expect(mocks.chatFindFirst).not.toHaveBeenCalled();
  });

  it("GET returns mapped guest chat payload with pagination", async () => {
    const response = await GET(
      new Request("http://localhost/api/guest/chats/chat-1?limit=2&cursor=m-cursor"),
      { params: params("chat-1") },
    );

    expect(response.status).toBe(200);
    expect(mocks.chatFindFirst).toHaveBeenCalledWith({
      where: {
        id: "chat-1",
        userId: "guest-1",
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
        ragUsed: true,
        toolCalls: true,
      },
    });

    await expect(response.json()).resolves.toEqual({
      id: "chat-1",
      title: "Guest Chat",
      visibility: "PRIVATE",
      isOwner: true,
      isGuest: true,
      createdAt: "2026-02-16T10:00:00.000Z",
      updatedAt: "2026-02-16T11:00:00.000Z",
      messages: [
        {
          id: "m2",
          role: "user",
          content: "Second",
          parts: [{ type: "text", text: "Second" }],
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
          content: "Third",
          parts: [{ type: "text", text: "Third" }],
          createdAt: "2026-02-16T11:00:03.000Z",
          model: "gpt-4o-mini",
          usage: {
            inputTokens: 10,
            outputTokens: 15,
            cost: 0.01,
            generationTimeMs: 180,
          },
          ragUsed: true,
          toolCalls: [{ name: "search" }],
          attachments: [],
        },
      ],
      pagination: {
        hasMore: true,
        nextCursor: "m2",
      },
    });
  });

  it("GET returns 500 on unexpected errors", async () => {
    mocks.messageFindMany.mockRejectedValue(new Error("db failed"));

    const response = await GET(
      new Request("http://localhost/api/guest/chats/chat-1"),
      { params: params() },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch chat",
    });
  });

  it("PATCH returns 404 when guest does not own the chat", async () => {
    mocks.chatFindFirst.mockResolvedValue(null);

    const response = await PATCH(
      new Request("http://localhost/api/guest/chats/chat-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "x" }),
        headers: { "Content-Type": "application/json" },
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
      new Request("http://localhost/api/guest/chats/chat-1", {
        method: "PATCH",
        body: JSON.stringify({ generateTitle: true }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: params("chat-1") },
    );

    expect(response.status).toBe(200);
    expect(mocks.messageFindFirst).toHaveBeenCalledWith({
      where: { chatId: "chat-1", role: "USER" },
      orderBy: { createdAt: "asc" },
      select: { content: true },
    });
    expect(mocks.generateChatTitle).toHaveBeenCalledWith("First user prompt");
    expect(mocks.chatUpdate).toHaveBeenCalledWith({
      where: { id: "chat-1" },
      data: {
        title: "Generated Guest Title",
      },
      select: {
        id: true,
        title: true,
        visibility: true,
        updatedAt: true,
      },
    });
    expect(mocks.revalidateTag).toHaveBeenCalledWith("chat-chat-1", "page");
    expect(mocks.revalidateTag).toHaveBeenCalledWith("chats-guest-1", "page");
    await expect(response.json()).resolves.toEqual({
      id: "chat-1",
      title: "Generated Guest Title",
      visibility: "PRIVATE",
      updatedAt: "2026-02-16T12:00:00.000Z",
      isGuest: true,
    });
  });

  it("PATCH uses explicit title without title generation", async () => {
    await PATCH(
      new Request("http://localhost/api/guest/chats/chat-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "Manual Guest Title" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: params() },
    );

    expect(mocks.generateChatTitle).not.toHaveBeenCalled();
    expect(mocks.chatUpdate).toHaveBeenCalledWith({
      where: { id: "chat-1" },
      data: {
        title: "Manual Guest Title",
      },
      select: {
        id: true,
        title: true,
        visibility: true,
        updatedAt: true,
      },
    });
  });

  it("PATCH returns 500 on update failure", async () => {
    mocks.chatUpdate.mockRejectedValue(new Error("update failed"));

    const response = await PATCH(
      new Request("http://localhost/api/guest/chats/chat-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "x" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: params() },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to update chat",
    });
  });

  it("DELETE returns 404 when guest does not own the chat", async () => {
    mocks.chatFindFirst.mockResolvedValue(null);

    const response = await DELETE(
      new Request("http://localhost/api/guest/chats/chat-1", {
        method: "DELETE",
      }),
      { params: params() },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Chat not found or access denied",
    });
  });

  it("DELETE removes chat and revalidates guest caches", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/guest/chats/chat-1", {
        method: "DELETE",
      }),
      { params: params("chat-1") },
    );

    expect(response.status).toBe(200);
    expect(mocks.chatDelete).toHaveBeenCalledWith({ where: { id: "chat-1" } });
    expect(mocks.revalidateTag).toHaveBeenCalledWith("chats-guest-1", "page");
    expect(mocks.revalidateTag).toHaveBeenCalledWith("chat-chat-1", "page");
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("DELETE still succeeds when cache revalidation fails", async () => {
    mocks.revalidateTag.mockImplementationOnce(() => {
      throw new Error("cache failed");
    });

    const response = await DELETE(
      new Request("http://localhost/api/guest/chats/chat-1", {
        method: "DELETE",
      }),
      { params: params("chat-1") },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("DELETE returns 500 when delete fails", async () => {
    mocks.chatDelete.mockRejectedValue(new Error("delete failed"));

    const response = await DELETE(
      new Request("http://localhost/api/guest/chats/chat-1", {
        method: "DELETE",
      }),
      { params: params("chat-1") },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to delete chat",
    });
  });
});
