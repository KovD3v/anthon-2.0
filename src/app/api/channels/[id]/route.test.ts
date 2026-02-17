import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  channelIdentityFindUnique: vi.fn(),
  channelIdentityDelete: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getAuthUser: mocks.getAuthUser,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    channelIdentity: {
      findUnique: mocks.channelIdentityFindUnique,
      delete: mocks.channelIdentityDelete,
    },
  },
}));

import { DELETE } from "./route";

function params(id = "channel-1") {
  return Promise.resolve({ id });
}

describe("DELETE /api/channels/[id]", () => {
  beforeEach(() => {
    mocks.getAuthUser.mockReset();
    mocks.channelIdentityFindUnique.mockReset();
    mocks.channelIdentityDelete.mockReset();

    mocks.getAuthUser.mockResolvedValue({ user: { id: "user-1" }, error: null });
    mocks.channelIdentityFindUnique.mockResolvedValue({
      id: "channel-1",
      channel: "TELEGRAM",
      externalId: "tg-111",
      userId: "user-1",
    });
    mocks.channelIdentityDelete.mockResolvedValue({ id: "channel-1" });
  });

  it("returns 401 when auth fails", async () => {
    mocks.getAuthUser.mockResolvedValue({ user: null, error: "Unauthorized" });

    const response = await DELETE({} as NextRequest, { params: params() });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when channel id is missing", async () => {
    const response = await DELETE({} as NextRequest, { params: params("") });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Channel identity ID is required",
    });
  });

  it("returns 404 when channel identity is not found", async () => {
    mocks.channelIdentityFindUnique.mockResolvedValue(null);

    const response = await DELETE({} as NextRequest, { params: params("missing") });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Channel identity not found",
    });
  });

  it("returns 403 when channel identity belongs to another user", async () => {
    mocks.channelIdentityFindUnique.mockResolvedValue({
      id: "channel-1",
      channel: "WHATSAPP",
      externalId: "wa-1",
      userId: "user-2",
    });

    const response = await DELETE({} as NextRequest, { params: params("channel-1") });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Access denied" });
  });

  it("deletes owned channel identity and returns success payload", async () => {
    const response = await DELETE({} as NextRequest, { params: params("channel-1") });

    expect(response.status).toBe(200);
    expect(mocks.channelIdentityFindUnique).toHaveBeenCalledWith({
      where: { id: "channel-1" },
      select: {
        id: true,
        channel: true,
        externalId: true,
        userId: true,
      },
    });
    expect(mocks.channelIdentityDelete).toHaveBeenCalledWith({
      where: { id: "channel-1" },
    });
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "TELEGRAM disconnected successfully",
    });
  });

  it("returns 500 on delete failures", async () => {
    mocks.channelIdentityDelete.mockRejectedValue(new Error("db failed"));

    const response = await DELETE({} as NextRequest, { params: params("channel-1") });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to disconnect channel",
    });
  });
});
