import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  userFindUnique: vi.fn(),
  messageFindMany: vi.fn(),
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
    },
  },
}));

import { GET } from "./route";

describe("GET /api/chats/search", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.userFindUnique.mockReset();
    mocks.messageFindMany.mockReset();

    mocks.auth.mockResolvedValue({ userId: "clerk_1" });
    mocks.userFindUnique.mockResolvedValue({ id: "user-1" });
    mocks.messageFindMany.mockResolvedValue([
      {
        id: "msg-1",
        content:
          "This is a long test message about deployment workflows and production diagnostics.",
        role: "USER",
        createdAt: new Date("2026-02-16T10:00:00.000Z"),
        chatId: "chat-1",
        chat: {
          id: "chat-1",
          title: "Deploy Notes",
        },
      },
      {
        id: "msg-2",
        content: "No matching term here, but still return snippet fallback.",
        role: "ASSISTANT",
        createdAt: new Date("2026-02-16T09:00:00.000Z"),
        chatId: "chat-2",
        chat: {
          id: "chat-2",
          title: null,
        },
      },
    ]);
  });

  it("returns 401 when Clerk auth has no userId", async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await GET(
      new Request("http://localhost/api/chats/search?q=deploy"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when user record does not exist", async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/chats/search?q=deploy"),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "User not found" });
  });

  it("returns 400 for query shorter than 2 characters", async () => {
    const response = await GET(
      new Request("http://localhost/api/chats/search?q=d"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Search query must be at least 2 characters",
    });
  });

  it("returns 400 for missing query", async () => {
    const response = await GET(
      new Request("http://localhost/api/chats/search"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Search query must be at least 2 characters",
    });
  });

  it("searches messages with trimmed query and maps result payload", async () => {
    const response = await GET(
      new Request("http://localhost/api/chats/search?q=%20deploy%20"),
    );

    expect(response.status).toBe(200);
    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { clerkId: "clerk_1" },
      select: { id: true },
    });
    expect(mocks.messageFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        content: {
          contains: "deploy",
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        content: true,
        role: true,
        createdAt: true,
        chatId: true,
        chat: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const json = await response.json();
    expect(json.query).toBe("deploy");
    expect(json.results).toHaveLength(2);
    expect(json.results[0]).toMatchObject({
      id: "msg-1",
      content:
        "This is a long test message about deployment workflows and production diagnostics.",
      role: "USER",
      chatId: "chat-1",
      chatTitle: "Deploy Notes",
      createdAt: "2026-02-16T10:00:00.000Z",
    });
    expect(json.results[0].snippet.toLowerCase()).toContain("deploy");
    expect(json.results[1]).toMatchObject({
      id: "msg-2",
      chatTitle: "Untitled",
    });
    expect(json.results[1].snippet).toContain("No matching term here");
  });

  it("propagates dependency errors", async () => {
    mocks.messageFindMany.mockRejectedValue(new Error("db unavailable"));

    await expect(
      GET(new Request("http://localhost/api/chats/search?q=deploy")),
    ).rejects.toThrow("db unavailable");
  });
});
