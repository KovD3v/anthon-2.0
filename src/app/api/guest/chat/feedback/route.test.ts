import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getExistingGuestUser: vi.fn(),
  messageFindFirst: vi.fn(),
  messageUpdate: vi.fn(),
}));

vi.mock("@/lib/guest-auth", () => ({
  getExistingGuestUser: mocks.getExistingGuestUser,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    message: {
      findFirst: mocks.messageFindFirst,
      update: mocks.messageUpdate,
    },
  },
}));

import { POST } from "./route";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/guest/chat/feedback", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/guest/chat/feedback", () => {
  beforeEach(() => {
    mocks.getExistingGuestUser.mockReset();
    mocks.messageFindFirst.mockReset();
    mocks.messageUpdate.mockReset();

    mocks.getExistingGuestUser.mockResolvedValue({
      id: "guest-1",
      isGuest: true,
    });
    mocks.messageFindFirst.mockResolvedValue({
      id: "msg-1",
      userId: "guest-1",
      role: "ASSISTANT",
      metadata: {},
    });
    mocks.messageUpdate.mockResolvedValue({ id: "msg-1", feedback: 1 });
  });

  it("returns 401 without an existing guest session", async () => {
    mocks.getExistingGuestUser.mockResolvedValue(null);

    const response = await POST(
      buildRequest({ messageId: "msg-1", feedback: 1 }),
    );

    expect(response.status).toBe(401);
    expect(mocks.messageFindFirst).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for invalid feedback", async () => {
    const response = await POST(
      buildRequest({ messageId: "msg-1", feedback: 7 }),
    );

    expect(response.status).toBe(400);
    expect(mocks.messageFindFirst).not.toHaveBeenCalled();
  });

  it("rejects assistant messages not owned by the guest", async () => {
    mocks.messageFindFirst.mockResolvedValue(null);

    const response = await POST(
      buildRequest({ messageId: "msg-other", feedback: -1 }),
    );

    expect(response.status).toBe(404);
    expect(mocks.messageFindFirst).toHaveBeenCalledWith({
      where: {
        id: "msg-other",
        userId: "guest-1",
        role: "ASSISTANT",
      },
    });
  });

  it("stores guest feedback and its optional reason", async () => {
    const response = await POST(
      buildRequest({
        messageId: "msg-1",
        feedback: -1,
        reason: "context_missed",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.messageUpdate).toHaveBeenCalledWith({
      where: { id: "msg-1" },
      data: {
        feedback: -1,
        metadata: { feedback: { reason: "context_missed" } },
      },
    });
    await expect(response.json()).resolves.toEqual({
      success: true,
      messageId: "msg-1",
      feedback: -1,
      reason: "context_missed",
    });
  });
});
