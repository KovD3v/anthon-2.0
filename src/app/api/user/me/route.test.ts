import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  clerkClient: vi.fn(),
  deleteClerkUser: vi.fn(),
  organizationCount: vi.fn(),
  attachmentFindMany: vi.fn(),
  artifactVersionFindMany: vi.fn(),
  userDelete: vi.fn(),
  del: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getAuthUser: mocks.getAuthUser }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: mocks.clerkClient,
}));
vi.mock("@vercel/blob", () => ({ del: mocks.del }));
vi.mock("@/lib/db", () => ({
  prisma: {
    organization: { count: mocks.organizationCount },
    attachment: { findMany: mocks.attachmentFindMany },
    artifactVersion: { findMany: mocks.artifactVersionFindMany },
    user: { delete: mocks.userDelete },
  },
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: mocks.loggerInfo,
    error: mocks.loggerError,
  }),
}));

import { DELETE } from "./route";

describe("DELETE /api/user/me", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();

    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", clerkId: "clerk-1" },
      error: null,
    });
    mocks.organizationCount.mockResolvedValue(0);
    mocks.attachmentFindMany.mockResolvedValue([]);
    mocks.artifactVersionFindMany.mockResolvedValue([]);
    mocks.clerkClient.mockResolvedValue({
      users: { deleteUser: mocks.deleteClerkUser },
    });
    mocks.deleteClerkUser.mockResolvedValue(undefined);
    mocks.userDelete.mockResolvedValue({ id: "user-1" });
    mocks.del.mockResolvedValue(undefined);
  });

  it("requires authentication", async () => {
    mocks.getAuthUser.mockResolvedValue({
      user: null,
      error: "Not authenticated",
    });

    const response = await DELETE();

    expect(response.status).toBe(401);
    expect(mocks.organizationCount).not.toHaveBeenCalled();
  });

  it("blocks deletion while the user is an organization creator", async () => {
    mocks.organizationCount.mockResolvedValue(1);

    const response = await DELETE();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        "Delete organizations created by this account or contact support before deleting it",
      code: "ORGANIZATION_CREATOR_DELETION_BLOCKED",
    });
    expect(mocks.del).not.toHaveBeenCalled();
    expect(mocks.deleteClerkUser).not.toHaveBeenCalled();
  });

  it("deletes owned blobs before Clerk and database records", async () => {
    mocks.attachmentFindMany.mockResolvedValue([
      { blobUrl: "https://blob.example/a" },
      { blobUrl: "https://blob.example/a" },
    ]);
    mocks.artifactVersionFindMany.mockResolvedValue([
      { blobUrl: "https://blob.example/b" },
      { blobUrl: null },
    ]);

    const response = await DELETE();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });
    expect(mocks.del).toHaveBeenCalledWith([
      "https://blob.example/a",
      "https://blob.example/b",
    ]);
    expect(mocks.deleteClerkUser).toHaveBeenCalledWith("clerk-1");
    expect(mocks.userDelete).toHaveBeenCalledWith({ where: { id: "user-1" } });
    expect(mocks.del.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteClerkUser.mock.invocationCallOrder[0],
    );
  });

  it("keeps the account retryable when Blob cleanup fails", async () => {
    mocks.attachmentFindMany.mockResolvedValue([
      { blobUrl: "https://blob.example/a" },
    ]);
    mocks.del.mockRejectedValue(new Error("blob unavailable"));

    const response = await DELETE();

    expect(response.status).toBe(500);
    expect(mocks.deleteClerkUser).not.toHaveBeenCalled();
    expect(mocks.userDelete).not.toHaveBeenCalled();
  });
});
