import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class PrismaClientKnownRequestError extends Error {
    code: string;

    constructor(message: string, code: string) {
      super(message);
      this.name = "PrismaClientKnownRequestError";
      this.code = code;
    }
  }

  return {
    requireAdmin: vi.fn(),
    applyOrgOverrides: vi.fn(),
    isOrganizationBasePlan: vi.fn(),
    backfillOrganizationsFromClerk: vi.fn(),
    createOrganizationWithContract: vi.fn(),
    listOrganizations: vi.fn(),
    PrismaClientKnownRequestError,
  };
});

vi.mock("@/generated/prisma", () => ({
  Prisma: {
    PrismaClientKnownRequestError: mocks.PrismaClientKnownRequestError,
  },
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/organizations/plan-defaults", () => ({
  applyOrgOverrides: mocks.applyOrgOverrides,
  isOrganizationBasePlan: mocks.isOrganizationBasePlan,
}));

vi.mock("@/lib/organizations/service", () => ({
  backfillOrganizationsFromClerk: mocks.backfillOrganizationsFromClerk,
  createOrganizationWithContract: mocks.createOrganizationWithContract,
  listOrganizations: mocks.listOrganizations,
}));

import { GET, POST } from "./route";

function getRequest(
  url = "http://localhost/api/admin/organizations",
): NextRequest {
  return {
    nextUrl: new URL(url),
  } as unknown as NextRequest;
}

function postRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest;
}

function validContract(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    basePlan: "BASIC",
    seatLimit: 5,
    planLabel: "Starter Team",
    modelTier: "BASIC",
    maxRequestsPerDay: 100,
    maxInputTokensPerDay: 10_000,
    maxOutputTokensPerDay: 12_000,
    maxCostPerDay: 25,
    maxContextMessages: 20,
    ...overrides,
  };
}

describe("/api/admin/organizations route", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
    mocks.applyOrgOverrides.mockReset();
    mocks.isOrganizationBasePlan.mockReset();
    mocks.backfillOrganizationsFromClerk.mockReset();
    mocks.createOrganizationWithContract.mockReset();
    mocks.listOrganizations.mockReset();

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

    mocks.backfillOrganizationsFromClerk.mockResolvedValue(1);

    mocks.listOrganizations.mockResolvedValue([
      {
        id: "org-1",
        clerkOrganizationId: "clerk-org-1",
        name: "Org One",
        slug: "org-one",
        status: "ACTIVE",
        pendingOwnerEmail: null,
        owner: { id: "owner-1", email: "owner@example.com" },
        contract: validContract(),
        activeMembers: 3,
        createdAt: new Date("2026-02-16T10:00:00.000Z"),
        updatedAt: new Date("2026-02-16T11:00:00.000Z"),
      },
      {
        id: "org-2",
        clerkOrganizationId: "clerk-org-2",
        name: "Org Two",
        slug: "org-two",
        status: "SUSPENDED",
        pendingOwnerEmail: "pending@example.com",
        owner: null,
        contract: null,
        activeMembers: 0,
        createdAt: new Date("2026-02-16T10:00:00.000Z"),
        updatedAt: new Date("2026-02-16T11:00:00.000Z"),
      },
    ]);

    mocks.createOrganizationWithContract.mockResolvedValue({
      id: "org-new",
      name: "New Org",
      slug: "new-org",
      status: "ACTIVE",
      contract: validContract(),
      owner: { id: "owner-1", email: "owner@example.com" },
    });
  });

  it("GET returns requireAdmin error response as-is", async () => {
    const forbidden = Response.json({ error: "Forbidden" }, { status: 403 });
    mocks.requireAdmin.mockResolvedValue({
      user: null,
      errorResponse: forbidden,
    });

    const response = await GET(getRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("GET syncs from Clerk when sync=1 and returns mapped organizations", async () => {
    const response = await GET(
      getRequest("http://localhost/api/admin/organizations?sync=1"),
    );

    expect(response.status).toBe(200);
    expect(mocks.backfillOrganizationsFromClerk).toHaveBeenCalledWith(
      "admin-1",
    );
    expect(mocks.listOrganizations).toHaveBeenCalledTimes(1);
    expect(mocks.applyOrgOverrides).toHaveBeenCalledTimes(1);

    const json = await response.json();
    expect(json.organizations).toHaveLength(2);
    expect(json.organizations[0]).toMatchObject({
      id: "org-1",
      effective: {
        maxRequestsPerDay: 999,
        maxInputTokensPerDay: 999_999,
      },
    });
    expect(json.organizations[1]).toMatchObject({
      id: "org-2",
      effective: null,
    });
  });

  it("GET does not sync from Clerk when sync flag is absent", async () => {
    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    expect(mocks.backfillOrganizationsFromClerk).not.toHaveBeenCalled();
  });

  it("GET returns empty organizations for schema-not-ready Prisma errors", async () => {
    mocks.listOrganizations.mockRejectedValue(
      new mocks.PrismaClientKnownRequestError("missing table", "P2021"),
    );

    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ organizations: [] });
  });

  it("GET returns 500 with details for unexpected errors", async () => {
    mocks.listOrganizations.mockRejectedValue(new Error("boom"));

    const response = await GET(getRequest());

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe("Failed to fetch organizations");
    expect(json.details).toMatchObject({
      name: "Error",
      message: "boom",
    });
  });

  it("POST returns requireAdmin error response as-is", async () => {
    const forbidden = Response.json({ error: "Forbidden" }, { status: 403 });
    mocks.requireAdmin.mockResolvedValue({
      user: null,
      errorResponse: forbidden,
    });

    const response = await POST(postRequest({}));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("POST returns 401 when user is missing", async () => {
    mocks.requireAdmin.mockResolvedValue({ user: null, errorResponse: null });

    const response = await POST(postRequest({}));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("POST validates required name", async () => {
    const response = await POST(
      postRequest({
        ownerEmail: "owner@example.com",
        contract: validContract(),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "name is required",
    });
  });

  it("POST validates owner email", async () => {
    const response = await POST(
      postRequest({
        name: "Org",
        ownerEmail: "not-an-email",
        contract: validContract(),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "ownerEmail must be a valid email",
    });
  });

  it("POST validates contract presence", async () => {
    const response = await POST(
      postRequest({
        name: "Org",
        ownerEmail: "owner@example.com",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "contract is required",
    });
  });

  it("POST validates contract basePlan", async () => {
    const response = await POST(
      postRequest({
        name: "Org",
        ownerEmail: "owner@example.com",
        contract: validContract({ basePlan: "TRIAL" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid basePlan",
    });
  });

  it("POST validates contract modelTier", async () => {
    const response = await POST(
      postRequest({
        name: "Org",
        ownerEmail: "owner@example.com",
        contract: validContract({ modelTier: "INVALID" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid modelTier",
    });
  });

  it("POST creates organization with normalized inputs and effective limits", async () => {
    const response = await POST(
      postRequest({
        name: "  New Org  ",
        ownerEmail: "  OWNER@EXAMPLE.COM ",
        slug: "new-org",
        contract: validContract({ planLabel: " Team Basic " }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.createOrganizationWithContract).toHaveBeenCalledWith({
      name: "New Org",
      slug: "new-org",
      ownerEmail: "owner@example.com",
      contract: {
        basePlan: "BASIC",
        seatLimit: 5,
        planLabel: " Team Basic ",
        modelTier: "BASIC",
        maxRequestsPerDay: 100,
        maxInputTokensPerDay: 10_000,
        maxOutputTokensPerDay: 12_000,
        maxCostPerDay: 25,
        maxContextMessages: 20,
      },
      createdByUserId: "admin-1",
    });

    const json = await response.json();
    expect(json.organization).toMatchObject({
      id: "org-new",
      name: "New Org",
      effective: {
        maxRequestsPerDay: 999,
        maxInputTokensPerDay: 999_999,
      },
    });
  });

  it("POST returns 500 on service errors", async () => {
    mocks.createOrganizationWithContract.mockRejectedValue(
      new Error("service down"),
    );

    const response = await POST(
      postRequest({
        name: "Org",
        ownerEmail: "owner@example.com",
        contract: validContract(),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to create organization",
    });
  });
});
