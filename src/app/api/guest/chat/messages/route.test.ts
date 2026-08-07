import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateGuest: vi.fn(),
  messageFindUnique: vi.fn(),
  messageDeleteMany: vi.fn(),
  deletePrivateVoiceBlobsForMessages: vi.fn(),
}));

vi.mock("@/lib/guest-auth", () => ({
  authenticateGuest: mocks.authenticateGuest,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    message: {
      findUnique: mocks.messageFindUnique,
      deleteMany: mocks.messageDeleteMany,
    },
  },
}));

vi.mock("@/lib/voice/attachment-cleanup", () => ({
  deletePrivateVoiceBlobsForMessages: mocks.deletePrivateVoiceBlobsForMessages,
}));

import { DELETE } from "./route";

describe("/api/guest/chat/messages route", () => {
  beforeEach(() => {
    mocks.authenticateGuest.mockReset();
    mocks.messageFindUnique.mockReset();
    mocks.messageDeleteMany.mockReset();
    mocks.deletePrivateVoiceBlobsForMessages.mockReset();

    mocks.authenticateGuest.mockResolvedValue({
      user: { id: "guest-1", isGuest: true },
    });
    mocks.messageDeleteMany.mockResolvedValue({ count: 2 });
    mocks.deletePrivateVoiceBlobsForMessages.mockResolvedValue(0);
  });

  it("returns 400 when message ID is missing", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/guest/chat/messages", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Message ID is required",
    });
  });

  it("returns 404 when the message is not found", async () => {
    mocks.messageFindUnique.mockResolvedValue(null);

    const response = await DELETE(
      new Request("http://localhost/api/guest/chat/messages?id=m1", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Message not found",
    });
  });

  it("rejects a message owned by another guest", async () => {
    mocks.messageFindUnique.mockResolvedValue({
      id: "m1",
      userId: "guest-2",
      chatId: "chat-1",
      role: "USER",
      createdAt: new Date("2026-02-16T10:00:00.000Z"),
    });

    const response = await DELETE(
      new Request("http://localhost/api/guest/chat/messages?id=m1", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("deletes the selected message and the rest of its chat suffix", async () => {
    const createdAt = new Date("2026-02-16T10:00:00.000Z");
    mocks.messageFindUnique.mockResolvedValue({
      id: "m1",
      userId: "guest-1",
      chatId: "chat-1",
      role: "USER",
      createdAt,
    });

    const response = await DELETE(
      new Request("http://localhost/api/guest/chat/messages?id=m1", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.deletePrivateVoiceBlobsForMessages).toHaveBeenCalledWith({
      userId: "guest-1",
      chatId: "chat-1",
      OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gte: "m1" } }],
    });
    expect(mocks.messageDeleteMany).toHaveBeenCalledWith({
      where: {
        userId: "guest-1",
        chatId: "chat-1",
        OR: [
          { createdAt: { gt: createdAt } },
          { createdAt, id: { gte: "m1" } },
        ],
      },
    });
    await expect(response.json()).resolves.toEqual({
      success: true,
      deletedCount: 2,
    });
  });
});
