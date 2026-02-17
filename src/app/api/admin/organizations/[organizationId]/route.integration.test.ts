import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  createUser,
  resetIntegrationDb,
  toAuthUser,
} from "@/test/integration/factories";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

import { DELETE, GET, PATCH } from "./route";

let sequence = 0;
function uniqueId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

function params(organizationId: string) {
  return { params: Promise.resolve({ organizationId }) };
}

describe("integration /api/admin/organizations/[organizationId]", () => {
  let adminUserId = "";

  beforeEach(async () => {
    await resetIntegrationDb();
    mocks.requireAdmin.mockReset();

    const admin = await createUser({ role: "ADMIN" });
    adminUserId = admin.id;

    mocks.requireAdmin.mockResolvedValue({
      user: toAuthUser(admin),
      errorResponse: null,
    });
  });

  it("GET returns organization detail with activeMembers count", async () => {
    const owner = await createUser();
    const activeMember = await createUser();
    const removedMember = await createUser();

    const organization = await prisma.organization.create({
      data: {
        clerkOrganizationId: uniqueId("clerk-org"),
        name: "Detail Org",
        slug: uniqueId("detail-org"),
        createdByUserId: adminUserId,
        ownerUserId: owner.id,
        contract: {
          create: {
            basePlan: "BASIC_PLUS",
            seatLimit: 12,
            planLabel: "Detail Plan",
            modelTier: "BASIC_PLUS",
            maxRequestsPerDay: 200,
            maxInputTokensPerDay: 20_000,
            maxOutputTokensPerDay: 24_000,
            maxCostPerDay: 50,
            maxContextMessages: 30,
          },
        },
      },
    });

    await prisma.organizationMembership.createMany({
      data: [
        {
          organizationId: organization.id,
          userId: owner.id,
          clerkMembershipId: uniqueId("owner-membership"),
          role: "OWNER",
          status: "ACTIVE",
          joinedAt: new Date("2026-02-17T10:00:00.000Z"),
        },
        {
          organizationId: organization.id,
          userId: activeMember.id,
          clerkMembershipId: uniqueId("active-membership"),
          role: "MEMBER",
          status: "ACTIVE",
          joinedAt: new Date("2026-02-17T10:01:00.000Z"),
        },
        {
          organizationId: organization.id,
          userId: removedMember.id,
          clerkMembershipId: uniqueId("removed-membership"),
          role: "MEMBER",
          status: "REMOVED",
          joinedAt: new Date("2026-02-17T10:02:00.000Z"),
          leftAt: new Date("2026-02-17T10:03:00.000Z"),
        },
      ],
    });

    const response = await GET({} as NextRequest, params(organization.id));
    const body = (await response.json()) as {
      organization: {
        id: string;
        activeMembers: number;
        owner: { id: string } | null;
        effective: { seatLimit: number } | null;
      };
    };

    expect(response.status).toBe(200);
    expect(body.organization).toMatchObject({
      id: organization.id,
      activeMembers: 2,
      owner: { id: owner.id },
      effective: { seatLimit: 12 },
    });
  });

  it("GET returns 404 when organization does not exist", async () => {
    const response = await GET({} as NextRequest, params("missing-org"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Organization not found",
    });
  });

  it("PATCH rejects empty update payloads", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/admin/organizations/org-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }) as unknown as NextRequest,
      params("org-1"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "No updates were provided",
    });
  });

  it("DELETE returns 401 when auth returns no user", async () => {
    mocks.requireAdmin.mockResolvedValueOnce({
      user: null,
      errorResponse: null,
    });

    const response = await DELETE({} as NextRequest, params("org-1"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });
});
