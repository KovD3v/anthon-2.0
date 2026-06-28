import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateGuest: vi.fn(),
  createGuestChatForSession: vi.fn(),
  chatFindMany: vi.fn(),
  chatCreate: vi.fn(),
  latencyMeasure: vi.fn(),
}));

vi.mock("@/lib/guest-auth", () => ({
  authenticateGuest: mocks.authenticateGuest,
  createGuestChatForSession: mocks.createGuestChatForSession,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    chat: {
      findMany: mocks.chatFindMany,
      create: mocks.chatCreate,
    },
  },
}));

vi.mock("@/lib/latency-logger", () => ({
  LatencyLogger: {
    measure: mocks.latencyMeasure,
  },
}));

import { GET, POST } from "./route";

describe("/api/guest/chats route", () => {
  beforeEach(() => {
    mocks.authenticateGuest.mockReset();
    mocks.createGuestChatForSession.mockReset();
    mocks.chatFindMany.mockReset();
    mocks.chatCreate.mockReset();
    mocks.latencyMeasure.mockReset();

    mocks.authenticateGuest.mockResolvedValue({
      user: { id: "guest-1", isGuest: true },
    });
    mocks.createGuestChatForSession.mockResolvedValue({
      user: { id: "guest-1", isGuest: true },
      token: "guest-token",
      isNew: false,
      chat: {
        id: "chat-new",
        title: "Hello",
        visibility: "PRIVATE",
        createdAt: new Date("2026-02-16T12:00:00.000Z"),
        updatedAt: new Date("2026-02-16T12:00:00.000Z"),
      },
    });
    mocks.latencyMeasure.mockImplementation(
      async (_name: string, fn: () => Promise<unknown>) => await fn(),
    );

    mocks.chatFindMany.mockResolvedValue([
      {
        id: "chat-1",
        title: null,
        visibility: "PRIVATE",
        createdAt: new Date("2026-02-16T10:00:00.000Z"),
        updatedAt: new Date("2026-02-16T11:00:00.000Z"),
        _count: { messages: 2 },
      },
      {
        id: "chat-2",
        title: "Trip plan",
        visibility: "PRIVATE",
        createdAt: new Date("2026-02-15T10:00:00.000Z"),
        updatedAt: new Date("2026-02-15T11:00:00.000Z"),
        _count: { messages: 5 },
      },
    ]);

    mocks.chatCreate.mockResolvedValue({
      id: "chat-new",
      title: "Hello",
      visibility: "PRIVATE",
      createdAt: new Date("2026-02-16T12:00:00.000Z"),
      updatedAt: new Date("2026-02-16T12:00:00.000Z"),
    });
  });

  it("GET returns mapped guest chats", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.chatFindMany).toHaveBeenCalledWith({
      where: { userId: "guest-1" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        visibility: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { messages: true },
        },
      },
    });

    await expect(response.json()).resolves.toEqual({
      chats: [
        {
          id: "chat-1",
          title: "Nuova Chat",
          visibility: "PRIVATE",
          createdAt: "2026-02-16T10:00:00.000Z",
          updatedAt: "2026-02-16T11:00:00.000Z",
          messageCount: 2,
        },
        {
          id: "chat-2",
          title: "Trip plan",
          visibility: "PRIVATE",
          createdAt: "2026-02-15T10:00:00.000Z",
          updatedAt: "2026-02-15T11:00:00.000Z",
          messageCount: 5,
        },
      ],
      isGuest: true,
    });
  });

  it("GET returns 500 on authentication errors", async () => {
    mocks.authenticateGuest.mockRejectedValue(new Error("bad token"));

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch chats",
    });
  });

  it("POST creates a private guest chat with explicit title", async () => {
    const response = await POST(
      new Request("http://localhost/api/guest/chats", {
        method: "POST",
        body: JSON.stringify({ title: "Planning" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.createGuestChatForSession).toHaveBeenCalledWith({
      title: "Planning",
    });
    expect(mocks.chatCreate).not.toHaveBeenCalled();
  });

  it("POST returns 400 when title is not a string", async () => {
    const response = await POST(
      new Request("http://localhost/api/guest/chats", {
        method: "POST",
        body: JSON.stringify({ title: { text: "Planning" } }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "title must be a string",
    });
    expect(mocks.authenticateGuest).not.toHaveBeenCalled();
    expect(mocks.createGuestChatForSession).not.toHaveBeenCalled();
    expect(mocks.chatCreate).not.toHaveBeenCalled();
  });

  it("POST allows empty body and falls back to default title", async () => {
    mocks.createGuestChatForSession.mockResolvedValue({
      user: { id: "guest-1", isGuest: true },
      token: "guest-token",
      isNew: false,
      chat: {
        id: "chat-new",
        title: null,
        visibility: "PRIVATE",
        createdAt: new Date("2026-02-16T12:00:00.000Z"),
        updatedAt: new Date("2026-02-16T12:00:00.000Z"),
      },
    });

    const response = await POST(
      new Request("http://localhost/api/guest/chats", { method: "POST" }),
    );

    expect(response.status).toBe(201);
    expect(mocks.createGuestChatForSession).toHaveBeenCalledWith({
      title: undefined,
    });
    await expect(response.json()).resolves.toEqual({
      id: "chat-new",
      title: "Nuova Chat",
      visibility: "PRIVATE",
      createdAt: "2026-02-16T12:00:00.000Z",
      updatedAt: "2026-02-16T12:00:00.000Z",
      isGuest: true,
    });
  });

  it("POST returns 500 on create errors", async () => {
    mocks.createGuestChatForSession.mockRejectedValue(new Error("db failed"));

    const response = await POST(
      new Request("http://localhost/api/guest/chats", {
        method: "POST",
        body: JSON.stringify({ title: "Planning" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to create chat",
    });
  });
});
