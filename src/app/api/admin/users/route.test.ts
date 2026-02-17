import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  requireSuperAdmin: vi.fn(),
  updateUserRole: vi.fn(),
  userFindMany: vi.fn(),
  userCount: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
  requireSuperAdmin: mocks.requireSuperAdmin,
  updateUserRole: mocks.updateUserRole,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findMany: mocks.userFindMany,
      count: mocks.userCount,
    },
  },
}));

import { GET, PATCH } from "./route";

function getRequest(url = "http://localhost/api/admin/users"): NextRequest {
  return { url } as NextRequest;
}

function patchRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest;
}

describe("/api/admin/users route", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
    mocks.requireSuperAdmin.mockReset();
    mocks.updateUserRole.mockReset();
    mocks.userFindMany.mockReset();
    mocks.userCount.mockReset();

    mocks.requireAdmin.mockResolvedValue({ errorResponse: null });
    mocks.requireSuperAdmin.mockResolvedValue({
      user: { id: "super-admin-1", role: "SUPER_ADMIN" },
      errorResponse: null,
    });

    mocks.userFindMany.mockResolvedValue([
      {
        id: "user-1",
        clerkId: "clerk-1",
        email: "one@example.com",
        role: "USER",
        createdAt: new Date("2026-02-16T10:00:00.000Z"),
        profile: { name: "One", sport: "running" },
        subscription: { status: "ACTIVE", planName: "Basic" },
        _count: { messages: 12 },
      },
      {
        id: "user-2",
        clerkId: "clerk-2",
        email: "two@example.com",
        role: "ADMIN",
        createdAt: new Date("2026-02-15T10:00:00.000Z"),
        profile: null,
        subscription: null,
        _count: { messages: 0 },
      },
    ]);
    mocks.userCount.mockResolvedValue(42);
    mocks.updateUserRole.mockResolvedValue({ success: true });
  });

  it("GET returns requireAdmin error response as-is", async () => {
    const forbidden = Response.json({ error: "Forbidden" }, { status: 403 });
    mocks.requireAdmin.mockResolvedValue({ errorResponse: forbidden });

    const response = await GET(getRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("GET returns paginated users with filters", async () => {
    const response = await GET(
      getRequest(
        "http://localhost/api/admin/users?page=2&limit=10&search=example&role=ADMIN",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.userFindMany).toHaveBeenCalledWith({
      where: {
        email: {
          contains: "example",
          mode: "insensitive",
        },
        role: "ADMIN",
      },
      skip: 10,
      take: 10,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        clerkId: true,
        email: true,
        role: true,
        createdAt: true,
        profile: {
          select: {
            name: true,
            sport: true,
          },
        },
        subscription: {
          select: {
            status: true,
            planName: true,
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });
    expect(mocks.userCount).toHaveBeenCalledWith({
      where: {
        email: {
          contains: "example",
          mode: "insensitive",
        },
        role: "ADMIN",
      },
    });

    await expect(response.json()).resolves.toEqual({
      users: [
        {
          id: "user-1",
          email: "one@example.com",
          role: "USER",
          name: "One",
          sport: "running",
          subscriptionStatus: "ACTIVE",
          planName: "Basic",
          messageCount: 12,
          createdAt: "2026-02-16T10:00:00.000Z",
        },
        {
          id: "user-2",
          email: "two@example.com",
          role: "ADMIN",
          name: undefined,
          sport: undefined,
          subscriptionStatus: undefined,
          planName: undefined,
          messageCount: 0,
          createdAt: "2026-02-15T10:00:00.000Z",
        },
      ],
      pagination: {
        page: 2,
        limit: 10,
        total: 42,
        totalPages: 5,
      },
    });
  });

  it("GET returns 500 when user query fails", async () => {
    mocks.userFindMany.mockRejectedValue(new Error("db failed"));

    const response = await GET(getRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch users",
    });
  });

  it("PATCH returns requireSuperAdmin error response as-is", async () => {
    const forbidden = Response.json({ error: "Forbidden" }, { status: 403 });
    mocks.requireSuperAdmin.mockResolvedValue({
      user: null,
      errorResponse: forbidden,
    });

    const response = await PATCH(patchRequest({ userId: "user-1", role: "ADMIN" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("PATCH returns 401 when super admin user is missing", async () => {
    mocks.requireSuperAdmin.mockResolvedValue({ user: null, errorResponse: null });

    const response = await PATCH(patchRequest({ userId: "user-1", role: "ADMIN" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("PATCH validates required fields", async () => {
    const response = await PATCH(patchRequest({ userId: "", role: "ADMIN" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "userId and role are required",
    });
  });

  it("PATCH validates accepted role values", async () => {
    const response = await PATCH(
      patchRequest({ userId: "user-1", role: "ROOT" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid role" });
  });

  it("PATCH returns 400 when updateUserRole rejects request", async () => {
    mocks.updateUserRole.mockResolvedValue({
      success: false,
      error: "Cannot modify yourself",
    });

    const response = await PATCH(
      patchRequest({ userId: "user-1", role: "ADMIN" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Cannot modify yourself",
    });
  });

  it("PATCH updates role successfully", async () => {
    const actor = { id: "super-admin-1", role: "SUPER_ADMIN" };
    mocks.requireSuperAdmin.mockResolvedValue({ user: actor, errorResponse: null });

    const response = await PATCH(
      patchRequest({ userId: "user-9", role: "ADMIN" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateUserRole).toHaveBeenCalledWith("user-9", "ADMIN", actor);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("PATCH returns 500 on unexpected errors", async () => {
    mocks.updateUserRole.mockRejectedValue(new Error("db failed"));

    const response = await PATCH(
      patchRequest({ userId: "user-9", role: "ADMIN" }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to update role",
    });
  });
});
