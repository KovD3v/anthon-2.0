import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  userFindUnique: vi.fn(),
  chatFindFirst: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    chat: {
      findFirst: mocks.chatFindFirst,
    },
  },
}));

import { GET } from "./route";

function params(id = "chat-1") {
  return Promise.resolve({ id });
}

describe("GET /api/chats/[id]/export", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.userFindUnique.mockReset();
    mocks.chatFindFirst.mockReset();

    mocks.auth.mockResolvedValue({ userId: "clerk-1" });
    mocks.userFindUnique.mockResolvedValue({ id: "user-1" });
    mocks.chatFindFirst.mockResolvedValue({
      id: "chat-1",
      title: "My Test / Chat!!!",
      createdAt: new Date("2026-02-10T12:00:00.000Z"),
      messages: [
        {
          role: "USER",
          content: "First question",
          createdAt: new Date("2026-02-10T12:01:00.000Z"),
        },
        {
          role: "ASSISTANT",
          content: "First answer",
          createdAt: new Date("2026-02-10T12:02:00.000Z"),
        },
      ],
    });

    vi.spyOn(Date.prototype, "toLocaleDateString").mockReturnValue("2/16/2026");
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await GET(new Request("http://localhost/api/chats/chat-1/export"), {
      params: params(),
    });

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
  });

  it("returns 404 when user is not found", async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/chats/chat-1/export"), {
      params: params(),
    });

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toBe("User not found");
  });

  it("returns 404 when chat is not found", async () => {
    mocks.chatFindFirst.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/chats/chat-404/export"), {
      params: params("chat-404"),
    });

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toBe("Chat not found");
  });

  it("returns markdown export with expected headers and body", async () => {
    const response = await GET(new Request("http://localhost/api/chats/chat-1/export"), {
      params: params("chat-1"),
    });

    expect(response.status).toBe(200);
    expect(mocks.chatFindFirst).toHaveBeenCalledWith({
      where: { id: "chat-1", userId: "user-1" },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          select: {
            role: true,
            content: true,
            createdAt: true,
          },
        },
      },
    });

    expect(response.headers.get("Content-Type")).toContain("text/markdown");
    const disposition = response.headers.get("Content-Disposition");
    expect(disposition).toContain("attachment; filename=");
    expect(disposition).toContain("anthon-chat-my-test-chat-");
    expect(disposition).toContain("-2026-02-10.md");

    const text = await response.text();
    expect(text).toContain("# My Test / Chat!!!");
    expect(text).toContain("*Exported on 2/16/2026*");
    expect(text).toContain("### **You** (");
    expect(text).toContain("### **Anthon** (");
    expect(text).toContain("First question");
    expect(text).toContain("First answer");
  });

  it("falls back to Untitled Chat when chat has no title", async () => {
    mocks.chatFindFirst.mockResolvedValue({
      id: "chat-1",
      title: null,
      createdAt: new Date("2026-02-10T12:00:00.000Z"),
      messages: [],
    });

    const response = await GET(new Request("http://localhost/api/chats/chat-1/export"), {
      params: params("chat-1"),
    });

    expect(response.status).toBe(200);
    const disposition = response.headers.get("Content-Disposition");
    expect(disposition).toContain("anthon-chat-untitled-chat-2026-02-10.md");
    await expect(response.text()).resolves.toContain("# Untitled Chat");
  });
});
