import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  applyOrgOverrides: vi.fn(),
  isOrganizationBasePlan: vi.fn(),
  getOrganizationById: vi.fn(),
  updateOrganization: vi.fn(),
  deleteOrganization: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/organizations/plan-defaults", () => ({
  applyOrgOverrides: mocks.applyOrgOverrides,
  isOrganizationBasePlan: mocks.isOrganizationBasePlan,
}));

vi.mock("@/lib/organizations/service", () => ({
  getOrganizationById: mocks.getOrganizationById,
  updateOrganization: mocks.updateOrganization,
  deleteOrganization: mocks.deleteOrganization,
}));

import { DELETE, GET, PATCH } from "./route";

function params(organizationId = "org-1") {
  return Promise.resolve({ organizationId });
}

function patchRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest;
}

function contract(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    basePlan: "BASIC",
    seatLimit: 10,
    planLabel: "Starter",
    modelTier: "BASIC",
    maxRequestsPerDay: 100,
    maxInputTokensPerDay: 50_000,
    maxOutputTokensPerDay: 60_000,
    maxCostPerDay: 25,
    maxContextMessages: 20,
    ...overrides,
  };
}

describe("/api/admin/organizations/[organizationId] route", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
    mocks.applyOrgOverrides.mockReset();
    mocks.isOrganizationBasePlan.mockReset();
    mocks.getOrganizationById.mockReset();
    mocks.updateOrganization.mockReset();
    mocks.deleteOrganization.mockReset();

    mocks.requireAdmin.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
      errorResponse: null,
    });

    mocks.isOrganizationBasePlan.mockImplementation(
      (value: unknown) =>
        value === "BASIC" || value === "BASIC_PLUS" || value === "PRO",
    );

    mocks.applyOrgOverrides.mockReturnValue({
      effective: {
        maxRequestsPerDay: 999,
        maxInputTokensPerDay: 999_999,
      },
    });

    mocks.getOrganizationById.mockResolvedValue({
      id: "org-1",
      clerkOrganizationId: "clerk-org-1",
      name: "Alpha Org",
      slug: "alpha-org",
      status: "ACTIVE",
      pendingOwnerEmail: null,
      ownerUser: { id: "owner-1", email: "owner@example.com" },
      createdByUser: { id: "admin-1", email: "admin@example.com" },
      contract: contract(),
      memberships: [
        { id: "m-1", status: "ACTIVE", user: { id: "u-1" } },
        { id: "m-2", status: "SUSPENDED", user: { id: "u-2" } },
        { id: "m-3", status: "ACTIVE", user: { id: "u-3" } },
      ],
      createdAt: new Date("2026-02-16T10:00:00.000Z"),
      updatedAt: new Date("2026-02-16T11:00:00.000Z"),
    });

    mocks.updateOrganization.mockResolvedValue({
      id: "org-1",
      name: "Renamed Org",
      slug: "renamed-org",
      status: "SUSPENDED",
      contract: contract({ planLabel: "Pro Team", seatLimit: 20 }),
    });

    mocks.deleteOrganization.mockResolvedValue({
      id: "org-1",
      name: "Alpha Org",
    });
  });

  it("GET returns requireAdmin error response as-is", async () => {
    const forbidden = Response.json({ error: "Forbidden" }, { status: 403 });
    mocks.requireAdmin.mockResolvedValue({
      user: null,
      errorResponse: forbidden,
    });

    const response = await GET({} as NextRequest, { params: params() });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("GET returns 404 when organization is not found", async () => {
    mocks.getOrganizationById.mockResolvedValue(null);

    const response = await GET({} as NextRequest, { params: params() });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Organization not found",
    });
  });

  it("GET returns organization detail with active member count", async () => {
    const response = await GET({} as NextRequest, { params: params("org-1") });

    expect(response.status).toBe(200);
    expect(mocks.getOrganizationById).toHaveBeenCalledWith("org-1");
    expect(mocks.applyOrgOverrides).toHaveBeenCalledTimes(1);

    const json = await response.json();
    expect(json.organization).toMatchObject({
      id: "org-1",
      owner: {
        id: "owner-1",
        email: "owner@example.com",
      },
      activeMembers: 2,
      effective: {
        maxRequestsPerDay: 999,
        maxInputTokensPerDay: 999_999,
      },
    });
    expect(json.organization.ownerUser).toBeUndefined();
  });

  it("GET returns 500 on service errors", async () => {
    mocks.getOrganizationById.mockRejectedValue(new Error("db failed"));

    const response = await GET({} as NextRequest, { params: params() });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch organization",
    });
  });

  it("PATCH returns requireAdmin error response as-is", async () => {
    const forbidden = Response.json({ error: "Forbidden" }, { status: 403 });
    mocks.requireAdmin.mockResolvedValue({
      user: null,
      errorResponse: forbidden,
    });

    const response = await PATCH(patchRequest({ name: "x" }), {
      params: params(),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("PATCH returns 401 when user is missing", async () => {
    mocks.requireAdmin.mockResolvedValue({ user: null, errorResponse: null });

    const response = await PATCH(patchRequest({ name: "x" }), {
      params: params(),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("PATCH validates empty name", async () => {
    const response = await PATCH(patchRequest({ name: "   " }), {
      params: params(),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "name cannot be empty",
    });
  });

  it("PATCH validates empty slug", async () => {
    const response = await PATCH(patchRequest({ slug: "   " }), {
      params: params(),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "slug cannot be empty",
    });
  });

  it("PATCH requires at least one update", async () => {
    const response = await PATCH(patchRequest({}), { params: params() });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "No updates were provided",
    });
  });

  it("PATCH validates owner email", async () => {
    const response = await PATCH(patchRequest({ ownerEmail: "invalid" }), {
      params: params(),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "ownerEmail must be a valid email",
    });
  });

  it("PATCH validates status", async () => {
    const response = await PATCH(
      patchRequest({ status: "PAUSED" as unknown as "ACTIVE" }),
      {
        params: params(),
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid status" });
  });

  it("PATCH validates unknown contract fields", async () => {
    const response = await PATCH(
      patchRequest({
        contract: {
          unknownField: 1,
        },
      }),
      { params: params() },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Unknown contract field: unknownField",
    });
  });

  it("PATCH validates numeric contract bounds", async () => {
    const response = await PATCH(
      patchRequest({
        contract: {
          seatLimit: 0,
        },
      }),
      { params: params() },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "seatLimit must be a number >= 1",
    });
  });

  it("PATCH validates basePlan values", async () => {
    const response = await PATCH(
      patchRequest({
        contract: {
          basePlan: "TRIAL",
        },
      }),
      { params: params() },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "basePlan must be BASIC, BASIC_PLUS, or PRO",
    });
  });

  it("PATCH updates organization with normalized fields", async () => {
    const response = await PATCH(
      patchRequest({
        name: "  Renamed Org  ",
        slug: "  renamed-org  ",
        ownerEmail: "new-owner@example.com",
        status: "SUSPENDED",
        contract: {
          basePlan: "BASIC_PLUS",
          seatLimit: "25",
          maxRequestsPerDay: "1000",
          maxInputTokensPerDay: "300000",
          maxOutputTokensPerDay: "350000",
          maxCostPerDay: "75",
          maxContextMessages: "40",
          planLabel: "  Pro Team  ",
          modelTier: "PRO",
        },
      }),
      { params: params("org-1") },
    );

    expect(response.status).toBe(200);
    expect(mocks.updateOrganization).toHaveBeenCalledWith({
      organizationId: "org-1",
      actorUserId: "admin-1",
      name: "Renamed Org",
      slug: "renamed-org",
      ownerEmail: "new-owner@example.com",
      status: "SUSPENDED",
      contract: {
        basePlan: "BASIC_PLUS",
        seatLimit: 25,
        maxRequestsPerDay: 1000,
        maxInputTokensPerDay: 300000,
        maxOutputTokensPerDay: 350000,
        maxCostPerDay: 75,
        maxContextMessages: 40,
        planLabel: "Pro Team",
        modelTier: "PRO",
      },
    });

    const json = await response.json();
    expect(json.organization).toMatchObject({
      id: "org-1",
      name: "Renamed Org",
      effective: {
        maxRequestsPerDay: 999,
        maxInputTokensPerDay: 999_999,
      },
    });
  });

  it("PATCH returns 500 on update failures", async () => {
    mocks.updateOrganization.mockRejectedValue(new Error("update failed"));

    const response = await PATCH(patchRequest({ status: "ACTIVE" }), {
      params: params(),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to update organization",
    });
  });

  it("DELETE returns requireAdmin error response as-is", async () => {
    const forbidden = Response.json({ error: "Forbidden" }, { status: 403 });
    mocks.requireAdmin.mockResolvedValue({
      user: null,
      errorResponse: forbidden,
    });

    const response = await DELETE({} as NextRequest, { params: params() });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("DELETE returns 401 when user is missing", async () => {
    mocks.requireAdmin.mockResolvedValue({ user: null, errorResponse: null });

    const response = await DELETE({} as NextRequest, { params: params() });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("DELETE returns 404 when service reports not found", async () => {
    mocks.deleteOrganization.mockRejectedValue(
      new Error("Organization not found"),
    );

    const response = await DELETE({} as NextRequest, {
      params: params("org-404"),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Organization not found",
    });
  });

  it("DELETE removes organization and returns deletion payload", async () => {
    const response = await DELETE({} as NextRequest, {
      params: params("org-1"),
    });

    expect(response.status).toBe(200);
    expect(mocks.deleteOrganization).toHaveBeenCalledWith({
      organizationId: "org-1",
      actorUserId: "admin-1",
    });
    await expect(response.json()).resolves.toEqual({
      deleted: true,
      organizationId: "org-1",
      name: "Alpha Org",
    });
  });

  it("DELETE returns 500 on unexpected errors", async () => {
    mocks.deleteOrganization.mockRejectedValue(new Error("db failed"));

    const response = await DELETE({} as NextRequest, {
      params: params("org-1"),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to delete organization",
    });
  });
});
