import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  userFindUnique: vi.fn(),
  messageFindFirst: vi.fn(),
  messageUpdate: vi.fn(),
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
      findFirst: mocks.messageFindFirst,
      update: mocks.messageUpdate,
    },
  },
}));

import { POST } from "./route";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat/feedback", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/chat/feedback", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.userFindUnique.mockReset();
    mocks.messageFindFirst.mockReset();
    mocks.messageUpdate.mockReset();

    mocks.auth.mockResolvedValue({ userId: "clerk-1" });
    mocks.userFindUnique.mockResolvedValue({ id: "user-1" });
    mocks.messageFindFirst.mockResolvedValue({
      id: "msg-1",
      userId: "user-1",
      role: "ASSISTANT",
    });
    mocks.messageUpdate.mockResolvedValue({ id: "msg-1", feedback: 1 });
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await POST(buildRequest({ messageId: "msg-1", feedback: 1 }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when user is not found", async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    const response = await POST(buildRequest({ messageId: "msg-1", feedback: 1 }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "User not found" });
  });

  it("returns 400 for invalid request body", async () => {
    const response = await POST(buildRequest({ messageId: "", feedback: 5 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid request body",
    });
  });

  it("returns 404 when message cannot receive feedback", async () => {
    mocks.messageFindFirst.mockResolvedValue(null);

    const response = await POST(buildRequest({ messageId: "msg-1", feedback: -1 }));

    expect(response.status).toBe(404);
    expect(mocks.messageFindFirst).toHaveBeenCalledWith({
      where: {
        id: "msg-1",
        userId: "user-1",
        role: "ASSISTANT",
      },
    });
    await expect(response.json()).resolves.toEqual({
      error: "Message not found or cannot receive feedback",
    });
  });

  it("updates feedback for owned assistant messages", async () => {
    const response = await POST(buildRequest({ messageId: "msg-1", feedback: 1 }));

    expect(response.status).toBe(200);
    expect(mocks.messageUpdate).toHaveBeenCalledWith({
      where: { id: "msg-1" },
      data: { feedback: 1 },
    });
    await expect(response.json()).resolves.toEqual({
      success: true,
      messageId: "msg-1",
      feedback: 1,
    });
  });
});
