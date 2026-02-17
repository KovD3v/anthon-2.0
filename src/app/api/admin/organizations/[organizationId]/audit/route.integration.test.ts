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

import { GET } from "./route";

let sequence = 0;
function uniqueId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

function request(
  url = "http://localhost/api/admin/organizations/org-1/audit?page=1&limit=2",
): NextRequest {
  return {
    nextUrl: new URL(url),
  } as unknown as NextRequest;
}

function params(organizationId: string) {
  return { params: Promise.resolve({ organizationId }) };
}

describe("integration /api/admin/organizations/[organizationId]/audit", () => {
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

  it("returns paginated audit logs ordered by createdAt desc", async () => {
    const organization = await prisma.organization.create({
      data: {
        clerkOrganizationId: uniqueId("clerk-org"),
        name: "Audit Org",
        slug: uniqueId("audit-org"),
        createdByUserId: adminUserId,
      },
    });

    await prisma.organizationAuditLog.createMany({
      data: [
        {
          organizationId: organization.id,
          actorUserId: adminUserId,
          actorType: "ADMIN",
          action: "ORGANIZATION_CREATED",
          createdAt: new Date("2026-02-17T10:00:00.000Z"),
        },
        {
          organizationId: organization.id,
          actorUserId: adminUserId,
          actorType: "ADMIN",
          action: "CONTRACT_UPDATED",
          createdAt: new Date("2026-02-17T10:01:00.000Z"),
        },
        {
          organizationId: organization.id,
          actorUserId: adminUserId,
          actorType: "ADMIN",
          action: "OWNER_ASSIGNED",
          createdAt: new Date("2026-02-17T10:02:00.000Z"),
        },
      ],
    });

    const response = await GET(
      request(
        "http://localhost/api/admin/organizations/org-1/audit?page=1&limit=2",
      ),
      params(organization.id),
    );
    const body = (await response.json()) as {
      logs: Array<{ action: string }>;
      pagination: {
        page: number;
        limit: number;
        hasMore: boolean;
      };
    };

    expect(response.status).toBe(200);
    expect(body.pagination).toEqual({
      page: 1,
      limit: 2,
      hasMore: true,
    });
    expect(body.logs).toHaveLength(2);
    expect(body.logs.map((log) => log.action)).toEqual([
      "OWNER_ASSIGNED",
      "CONTRACT_UPDATED",
    ]);
  });

  it("returns requireAdmin error response as-is", async () => {
    mocks.requireAdmin.mockResolvedValueOnce({
      user: null,
      errorResponse: Response.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await GET(request(), params("org-1"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });
});
