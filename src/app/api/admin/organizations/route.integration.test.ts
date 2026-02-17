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

import { GET, POST } from "./route";

let sequence = 0;
function uniqueId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

function getRequest(
  url = "http://localhost/api/admin/organizations",
): NextRequest {
  return {
    nextUrl: new URL(url),
  } as unknown as NextRequest;
}

describe("integration /api/admin/organizations", () => {
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

  it("GET returns organizations with active seat usage and effective limits", async () => {
    const owner = await createUser();
    const member = await createUser();

    const organization = await prisma.organization.create({
      data: {
        clerkOrganizationId: uniqueId("clerk-org"),
        name: "Runner Team",
        slug: uniqueId("runner-team"),
        status: "ACTIVE",
        createdByUserId: adminUserId,
        ownerUserId: owner.id,
        contract: {
          create: {
            basePlan: "BASIC",
            seatLimit: 5,
            planLabel: "Starter Team",
            modelTier: "BASIC",
            maxRequestsPerDay: 100,
            maxInputTokensPerDay: 10_000,
            maxOutputTokensPerDay: 12_000,
            maxCostPerDay: 25,
            maxContextMessages: 20,
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
          userId: member.id,
          clerkMembershipId: uniqueId("member-membership"),
          role: "MEMBER",
          status: "REMOVED",
          joinedAt: new Date("2026-02-17T10:00:00.000Z"),
          leftAt: new Date("2026-02-17T11:00:00.000Z"),
        },
      ],
    });

    const response = await GET(getRequest());
    const body = (await response.json()) as {
      organizations: Array<{
        id: string;
        activeMembers: number;
        effective: {
          seatLimit: number;
          limits: {
            maxRequestsPerDay: number;
          };
        } | null;
      }>;
    };

    expect(response.status).toBe(200);
    expect(body.organizations).toHaveLength(1);
    expect(body.organizations[0]).toMatchObject({
      id: organization.id,
      activeMembers: 1,
      effective: {
        seatLimit: 5,
        limits: {
          maxRequestsPerDay: 100,
        },
      },
    });
  });

  it("POST validates contract presence before calling service layer", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "No Contract Org",
          ownerEmail: "owner@example.com",
        }),
      }) as unknown as NextRequest,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "contract is required",
    });
  });

  it("POST validates owner email format", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Owner Validation Org",
          ownerEmail: "not-an-email",
          contract: {
            basePlan: "BASIC",
            seatLimit: 5,
            planLabel: "Starter Team",
            modelTier: "BASIC",
            maxRequestsPerDay: 100,
            maxInputTokensPerDay: 10_000,
            maxOutputTokensPerDay: 12_000,
            maxCostPerDay: 25,
            maxContextMessages: 20,
          },
        }),
      }) as unknown as NextRequest,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "ownerEmail must be a valid email",
    });
  });
});
