import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  clerkClient: vi.fn(),
  clerkDeleteUser: vi.fn(),
  userDelete: vi.fn(),
  deletePrivateVoiceBlobsForMessages: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getAuthUser: mocks.getAuthUser,
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: mocks.clerkClient,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      delete: mocks.userDelete,
    },
  },
}));

vi.mock("@/lib/voice/attachment-cleanup", () => ({
  deletePrivateVoiceBlobsForMessages: mocks.deletePrivateVoiceBlobsForMessages,
}));

import { DELETE } from "./route";

const authUser = {
  id: "user-1",
  clerkId: "clerk-user-1",
  email: null,
  role: "USER" as const,
  createdAt: new Date("2026-07-11T00:00:00.000Z"),
};

describe("DELETE /api/user/me", () => {
  beforeEach(() => {
    mocks.getAuthUser.mockReset();
    mocks.clerkClient.mockReset();
    mocks.clerkDeleteUser.mockReset();
    mocks.userDelete.mockReset();
    mocks.deletePrivateVoiceBlobsForMessages.mockReset();

    mocks.getAuthUser.mockResolvedValue({ user: authUser, error: null });
    mocks.clerkClient.mockResolvedValue({
      users: {
        deleteUser: mocks.clerkDeleteUser,
      },
    });
    mocks.clerkDeleteUser.mockResolvedValue(undefined);
    mocks.deletePrivateVoiceBlobsForMessages.mockResolvedValue(0);
    mocks.userDelete.mockResolvedValue({ id: authUser.id });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 without calling Clerk or Prisma when unauthenticated", async () => {
    mocks.getAuthUser.mockResolvedValue({
      user: null,
      error: "Not authenticated",
    });

    const response = await DELETE();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Not authenticated",
    });
    expect(mocks.clerkClient).not.toHaveBeenCalled();
    expect(mocks.clerkDeleteUser).not.toHaveBeenCalled();
    expect(mocks.userDelete).not.toHaveBeenCalled();
  });

  it("deletes private voice blobs after Clerk and before the local user cascade", async () => {
    const deletionOrder: string[] = [];
    mocks.clerkDeleteUser.mockImplementation(async () => {
      deletionOrder.push("clerk");
    });
    mocks.deletePrivateVoiceBlobsForMessages.mockImplementation(async () => {
      deletionOrder.push("voice-blobs");
    });
    mocks.userDelete.mockImplementation(async () => {
      deletionOrder.push("database");
      return { id: authUser.id };
    });

    const response = await DELETE();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });
    expect(mocks.clerkDeleteUser).toHaveBeenCalledWith(authUser.clerkId);
    expect(mocks.deletePrivateVoiceBlobsForMessages).toHaveBeenCalledWith({
      userId: authUser.id,
    });
    expect(mocks.userDelete).toHaveBeenCalledWith({
      where: { id: authUser.id },
    });
    expect(deletionOrder).toEqual(["clerk", "voice-blobs", "database"]);
  });

  it("returns 500 and does not delete the local user when Clerk deletion fails", async () => {
    mocks.clerkDeleteUser.mockRejectedValue(new Error("Clerk deletion failed"));

    const response = await DELETE();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to delete account",
    });
    expect(mocks.userDelete).not.toHaveBeenCalled();
  });

  it("returns 500 after Clerk succeeds but local deletion fails, leaving the local record undeleted", async () => {
    mocks.userDelete.mockRejectedValue(new Error("Database deletion failed"));

    const response = await DELETE();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to delete account",
    });
    expect(mocks.clerkDeleteUser).toHaveBeenCalledWith(authUser.clerkId);
    expect(mocks.userDelete).toHaveBeenCalledWith({
      where: { id: authUser.id },
    });
  });

  it("keeps the local account when private voice cleanup fails", async () => {
    mocks.deletePrivateVoiceBlobsForMessages.mockRejectedValue(
      new Error("Blob storage unavailable"),
    );

    const response = await DELETE();

    expect(response.status).toBe(500);
    expect(mocks.clerkDeleteUser).toHaveBeenCalledWith(authUser.clerkId);
    expect(mocks.userDelete).not.toHaveBeenCalled();
  });

  it("redacts Clerk identifiers from deletion failure logs", async () => {
    const clerkIdentifier = "clerk-sensitive-reference";
    const deletionError = Object.assign(new Error("Clerk deletion failed"), {
      clerkId: clerkIdentifier,
    });
    mocks.clerkDeleteUser.mockRejectedValue(deletionError);
    vi.stubEnv("APP_LOG_LEVEL", "error");
    vi.stubEnv("APP_LOG_FORMAT", "json");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await DELETE();

    expect(response.status).toBe(500);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    const logLine = String(errorSpy.mock.calls[0]?.[0]);
    const logPayload = JSON.parse(logLine) as {
      event: string;
      data?: { err?: Record<string, unknown> };
    };

    expect(logPayload.event).toBe("user.delete.error");
    expect(logPayload.data?.err).not.toHaveProperty("clerkId");
    expect(logLine).not.toContain(clerkIdentifier);
  });
});
