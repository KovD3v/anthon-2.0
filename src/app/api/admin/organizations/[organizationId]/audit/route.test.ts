import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  listOrganizationAuditLogs: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/organizations/service", () => ({
  listOrganizationAuditLogs: mocks.listOrganizationAuditLogs,
}));

import { GET } from "./route";

function request(
  url = "http://localhost/api/admin/organizations/org-1/audit",
): NextRequest {
  return {
    nextUrl: new URL(url),
  } as unknown as NextRequest;
}

function params(organizationId = "org-1") {
  return Promise.resolve({ organizationId });
}

describe("GET /api/admin/organizations/[organizationId]/audit", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
    mocks.listOrganizationAuditLogs.mockReset();

    mocks.requireAdmin.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
      errorResponse: null,
    });

    mocks.listOrganizationAuditLogs.mockResolvedValue([
      {
        id: "log-1",
        action: "ORGANIZATION_CREATED",
      },
      {
        id: "log-2",
        action: "CONTRACT_UPDATED",
      },
    ]);
  });

  it("returns requireAdmin error response as-is", async () => {
    const forbidden = Response.json({ error: "Forbidden" }, { status: 403 });
    mocks.requireAdmin.mockResolvedValue({
      user: null,
      errorResponse: forbidden,
    });

    const response = await GET(request(), { params: params() });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("uses default pagination and returns hasMore=false", async () => {
    const response = await GET(request(), { params: params("org-1") });

    expect(response.status).toBe(200);
    expect(mocks.listOrganizationAuditLogs).toHaveBeenCalledWith("org-1", {
      take: 51,
      skip: 0,
    });

    await expect(response.json()).resolves.toEqual({
      logs: [
        {
          id: "log-1",
          action: "ORGANIZATION_CREATED",
        },
        {
          id: "log-2",
          action: "CONTRACT_UPDATED",
        },
      ],
      pagination: {
        page: 1,
        limit: 50,
        hasMore: false,
      },
    });
  });

  it("applies page/limit bounds and computes skip", async () => {
    const response = await GET(
      request(
        "http://localhost/api/admin/organizations/org-1/audit?page=0&limit=999",
      ),
      {
        params: params("org-1"),
      },
    );

    expect(response.status).toBe(200);
    expect(mocks.listOrganizationAuditLogs).toHaveBeenCalledWith("org-1", {
      take: 101,
      skip: 0,
    });

    const json = await response.json();
    expect(json.pagination).toEqual({
      page: 1,
      limit: 100,
      hasMore: false,
    });
  });

  it("returns hasMore=true and slices results to requested limit", async () => {
    mocks.listOrganizationAuditLogs.mockResolvedValue([
      { id: "log-1" },
      { id: "log-2" },
      { id: "log-3" },
    ]);

    const response = await GET(
      request(
        "http://localhost/api/admin/organizations/org-1/audit?page=2&limit=2",
      ),
      {
        params: params("org-1"),
      },
    );

    expect(response.status).toBe(200);
    expect(mocks.listOrganizationAuditLogs).toHaveBeenCalledWith("org-1", {
      take: 3,
      skip: 2,
    });

    await expect(response.json()).resolves.toEqual({
      logs: [{ id: "log-1" }, { id: "log-2" }],
      pagination: {
        page: 2,
        limit: 2,
        hasMore: true,
      },
    });
  });

  it("returns 500 on service errors", async () => {
    mocks.listOrganizationAuditLogs.mockRejectedValue(new Error("db failed"));

    const response = await GET(request(), { params: params("org-1") });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch audit logs",
    });
  });
});
