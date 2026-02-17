import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
  waitUntil: vi.fn(),
  revalidateTag: vi.fn(),
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  userUpdate: vi.fn(),
  profileFindUnique: vi.fn(),
  profileUpsert: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  clerkClient: mocks.clerkClient,
}));

vi.mock("@vercel/functions", () => ({
  waitUntil: mocks.waitUntil,
}));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: mocks.revalidateTag,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      create: mocks.userCreate,
      update: mocks.userUpdate,
    },
    profile: {
      findUnique: mocks.profileFindUnique,
      upsert: mocks.profileUpsert,
    },
  },
}));

import {
  getAuthUser,
  getFullUser,
  requireAdmin,
  requireSuperAdmin,
  updateUserRole,
} from "./auth";

describe("lib/auth", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.clerkClient.mockReset();
    mocks.waitUntil.mockReset();
    mocks.revalidateTag.mockReset();
    mocks.userFindUnique.mockReset();
    mocks.userCreate.mockReset();
    mocks.userUpdate.mockReset();
    mocks.profileFindUnique.mockReset();
    mocks.profileUpsert.mockReset();

    mocks.auth.mockResolvedValue({ userId: "clerk-1" });
    mocks.waitUntil.mockImplementation(() => {});
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      clerkId: "clerk-1",
      email: "user@example.com",
      role: "USER",
      createdAt: "2026-02-16T10:00:00.000Z",
    });
    mocks.userCreate.mockResolvedValue({
      id: "user-1",
      clerkId: "clerk-1",
      email: null,
      role: "USER",
      createdAt: "2026-02-16T10:00:00.000Z",
    });
    mocks.userUpdate.mockResolvedValue({});
    mocks.profileFindUnique.mockResolvedValue({ name: "Existing Name" });
    mocks.profileUpsert.mockResolvedValue({});
    mocks.clerkClient.mockResolvedValue({
      users: {
        getUser: vi.fn().mockResolvedValue({
          firstName: "John",
          lastName: "Doe",
        }),
      },
    });
  });

  it("returns not authenticated when Clerk userId is missing", async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const result = await getAuthUser();

    expect(result).toEqual({ user: null, error: "Not authenticated" });
  });

  it("returns authenticated user from cached lookup", async () => {
    const result = await getAuthUser();

    expect(result.error).toBeNull();
    expect(result.user).toMatchObject({
      id: "user-1",
      clerkId: "clerk-1",
      email: "user@example.com",
      role: "USER",
    });
    expect(result.user?.createdAt).toBeInstanceOf(Date);
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it("falls back to direct lookup when cached lookup misses", async () => {
    mocks.userFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "user-1",
      clerkId: "clerk-1",
      email: "second@example.com",
      role: "ADMIN",
      createdAt: "2026-02-16T11:00:00.000Z",
    });

    const result = await getAuthUser();

    expect(mocks.userFindUnique).toHaveBeenCalledTimes(2);
    expect(result.user).toMatchObject({
      id: "user-1",
      email: "second@example.com",
      role: "ADMIN",
    });
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it("creates a user when none exists and schedules profile sync", async () => {
    mocks.userFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mocks.userCreate.mockResolvedValue({
      id: "user-new",
      clerkId: "clerk-1",
      email: null,
      role: "USER",
      createdAt: "2026-02-16T12:00:00.000Z",
    });

    const result = await getAuthUser();

    expect(mocks.userCreate).toHaveBeenCalledWith({
      data: { clerkId: "clerk-1" },
      select: {
        id: true,
        clerkId: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });
    expect(mocks.waitUntil).toHaveBeenCalledTimes(1);
    expect(result.user?.id).toBe("user-new");
  });

  it("handles dynamic server usage errors without failing auth", async () => {
    const dynamicError = new Error("Dynamic server usage");
    (dynamicError as Error & { digest: string }).digest =
      "DYNAMIC_SERVER_USAGE";
    mocks.auth.mockRejectedValue(dynamicError);

    const result = await getAuthUser();

    expect(result).toEqual({ user: null, error: null });
  });

  it("returns generic auth error on unexpected exceptions", async () => {
    mocks.auth.mockRejectedValue(new Error("unexpected"));

    const result = await getAuthUser();

    expect(result).toEqual({ user: null, error: "Authentication error" });
  });

  it("getFullUser forwards DB include query", async () => {
    await getFullUser("user-1");

    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      include: {
        profile: true,
        preferences: true,
        subscription: true,
      },
    });
  });

  it("requireAdmin returns 401 when user is missing", async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const result = await requireAdmin();

    expect(result.user).toBeNull();
    expect(result.errorResponse?.status).toBe(401);
  });

  it("requireAdmin returns 403 for non-admin roles", async () => {
    const result = await requireAdmin();

    expect(result.user).toBeNull();
    expect(result.errorResponse?.status).toBe(403);
    await expect(result.errorResponse?.json()).resolves.toEqual({
      error: "Forbidden: Admin access required",
    });
  });

  it("requireAdmin returns user for admin role", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "user-admin",
      clerkId: "clerk-1",
      email: "admin@example.com",
      role: "ADMIN",
      createdAt: "2026-02-16T10:00:00.000Z",
    });

    const result = await requireAdmin();

    expect(result.errorResponse).toBeNull();
    expect(result.user?.role).toBe("ADMIN");
  });

  it("requireSuperAdmin returns 403 for admin role", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "user-admin",
      clerkId: "clerk-1",
      email: "admin@example.com",
      role: "ADMIN",
      createdAt: "2026-02-16T10:00:00.000Z",
    });

    const result = await requireSuperAdmin();

    expect(result.user).toBeNull();
    expect(result.errorResponse?.status).toBe(403);
    await expect(result.errorResponse?.json()).resolves.toEqual({
      error: "Forbidden: Super admin access required",
    });
  });

  it("requireSuperAdmin returns user for super admin", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "user-super",
      clerkId: "clerk-1",
      email: "super@example.com",
      role: "SUPER_ADMIN",
      createdAt: "2026-02-16T10:00:00.000Z",
    });

    const result = await requireSuperAdmin();

    expect(result.errorResponse).toBeNull();
    expect(result.user?.role).toBe("SUPER_ADMIN");
  });

  it("updateUserRole blocks non-super-admin actor", async () => {
    const result = await updateUserRole("target", "ADMIN", {
      id: "actor",
      clerkId: "clerk",
      email: null,
      role: "ADMIN",
      createdAt: new Date(),
    });

    expect(result).toEqual({
      success: false,
      error: "Only super admins can change user roles",
    });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("updateUserRole blocks self demotion", async () => {
    const result = await updateUserRole("actor", "ADMIN", {
      id: "actor",
      clerkId: "clerk",
      email: null,
      role: "SUPER_ADMIN",
      createdAt: new Date(),
    });

    expect(result).toEqual({
      success: false,
      error: "Cannot demote yourself",
    });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("updateUserRole updates DB and invalidates auth cache", async () => {
    const result = await updateUserRole("target", "ADMIN", {
      id: "actor",
      clerkId: "clerk",
      email: null,
      role: "SUPER_ADMIN",
      createdAt: new Date(),
    });

    expect(result).toEqual({ success: true });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "target" },
      data: { role: "ADMIN" },
    });
    expect(mocks.revalidateTag).toHaveBeenCalledWith("user-auth", "page");
  });

  it("updateUserRole returns failure when DB update throws", async () => {
    mocks.userUpdate.mockRejectedValue(new Error("update failed"));

    const result = await updateUserRole("target", "ADMIN", {
      id: "actor",
      clerkId: "clerk",
      email: null,
      role: "SUPER_ADMIN",
      createdAt: new Date(),
    });

    expect(result).toEqual({ success: false, error: "Failed to update role" });
  });
});
