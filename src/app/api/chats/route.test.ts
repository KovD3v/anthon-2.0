import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  getAuthUser: vi.fn(),
  chatFindMany: vi.fn(),
  chatCreate: vi.fn(),
  convertGuestForAuthenticatedUser: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
}));

vi.mock("@/lib/auth", () => ({
  getAuthUser: mocks.getAuthUser,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    chat: {
      findMany: mocks.chatFindMany,
      create: mocks.chatCreate,
    },
  },
}));

vi.mock("@/lib/guest-conversion", () => ({
  convertGuestForAuthenticatedUser: mocks.convertGuestForAuthenticatedUser,
}));

import { GET, POST } from "./route";

function postRequest(body?: unknown): Request {
  if (body === undefined) {
    return new Request("http://localhost/api/chats", { method: "POST" });
  }
  return new Request("http://localhost/api/chats", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/chats route", () => {
  beforeEach(() => {
    mocks.revalidateTag.mockReset();
    mocks.getAuthUser.mockReset();
    mocks.chatFindMany.mockReset();
    mocks.chatCreate.mockReset();
    mocks.convertGuestForAuthenticatedUser.mockReset();

    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", role: "USER" },
      error: null,
    });
    mocks.convertGuestForAuthenticatedUser.mockResolvedValue("no_cookie");
    mocks.chatFindMany.mockResolvedValue([
      {
        id: "chat-1",
        title: null,
        icon: "TARGET",
        visibility: "PRIVATE",
        createdAt: new Date("2026-02-16T10:00:00.000Z"),
        updatedAt: new Date("2026-02-16T11:00:00.000Z"),
        _count: { messages: 3 },
      },
    ]);
    mocks.chatCreate.mockResolvedValue({
      id: "chat-2",
      title: "My chat",
      icon: "TROPHY",
      visibility: "PUBLIC",
      createdAt: new Date("2026-02-16T12:00:00.000Z"),
      updatedAt: new Date("2026-02-16T12:00:00.000Z"),
    });
  });

  it("GET returns 401 when auth fails", async () => {
    mocks.getAuthUser.mockResolvedValue({ user: null, error: "Unauthorized" });

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("GET returns chats list with mapped fields", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      chats: [
        {
          id: "chat-1",
          title: "Nuova Chat",
          icon: "TARGET",
          visibility: "PRIVATE",
          createdAt: "2026-02-16T10:00:00.000Z",
          updatedAt: "2026-02-16T11:00:00.000Z",
          messageCount: 3,
        },
      ],
    });
    expect(mocks.chatFindMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        icon: true,
        visibility: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { messages: true },
        },
      },
    });
    expect(mocks.convertGuestForAuthenticatedUser).toHaveBeenCalledWith(
      "user-1",
    );
  });

  it("GET delegates guest conversion before reading chats", async () => {
    const order: string[] = [];
    mocks.convertGuestForAuthenticatedUser.mockImplementation(async () => {
      order.push("convert");
      return "migrated";
    });
    mocks.chatFindMany.mockImplementation(async () => {
      order.push("read");
      return [];
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(order).toEqual(["convert", "read"]);
  });

  it("GET returns 500 on unexpected error", async () => {
    mocks.chatFindMany.mockRejectedValue(new Error("db failed"));

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch chats",
    });
  });

  it("POST returns 401 when auth fails", async () => {
    mocks.getAuthUser.mockResolvedValue({ user: null, error: "Unauthorized" });

    const response = await POST(postRequest({ title: "A" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("POST creates chat with defaults when body is empty", async () => {
    mocks.chatCreate.mockResolvedValue({
      id: "chat-3",
      title: null,
      icon: "MESSAGE_SQUARE",
      visibility: "PRIVATE",
      createdAt: new Date("2026-02-16T12:00:00.000Z"),
      updatedAt: new Date("2026-02-16T12:00:00.000Z"),
    });

    const response = await POST(postRequest());

    expect(response.status).toBe(201);
    expect(mocks.chatCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        title: undefined,
        customTitle: false,
        visibility: "PRIVATE",
      },
      select: {
        id: true,
        title: true,
        icon: true,
        visibility: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(mocks.revalidateTag).toHaveBeenCalledWith("chats-user-1", "max");
    await expect(response.json()).resolves.toEqual({
      id: "chat-3",
      title: "Nuova Chat",
      icon: "MESSAGE_SQUARE",
      visibility: "PRIVATE",
      createdAt: "2026-02-16T12:00:00.000Z",
      updatedAt: "2026-02-16T12:00:00.000Z",
    });
  });

  it("POST accepts explicit title and visibility", async () => {
    const response = await POST(
      postRequest({ title: "My chat", visibility: "PUBLIC" }),
    );

    expect(response.status).toBe(201);
    expect(mocks.chatCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        title: "My chat",
        customTitle: true,
        visibility: "PUBLIC",
      },
      select: {
        id: true,
        title: true,
        icon: true,
        visibility: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it("POST returns 400 when title is not a string", async () => {
    const response = await POST(postRequest({ title: { text: "My chat" } }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "title must be a string",
    });
    expect(mocks.chatCreate).not.toHaveBeenCalled();
  });

  it("POST falls back to PRIVATE for invalid visibility", async () => {
    await POST(postRequest({ title: "x", visibility: "INVALID" }));

    expect(mocks.chatCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        title: "x",
        customTitle: true,
        visibility: "PRIVATE",
      },
      select: {
        id: true,
        title: true,
        icon: true,
        visibility: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it("POST returns 500 on create failure", async () => {
    mocks.chatCreate.mockRejectedValue(new Error("create failed"));

    const response = await POST(postRequest({ title: "x" }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to create chat",
    });
  });
});
