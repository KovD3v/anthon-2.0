import { beforeEach, describe, expect, it, vi } from "vitest";
import { PERSONAL_PLAN_LIMITS } from "@/lib/limits/personal-limits";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    organizationMembership: {
      findMany: mocks.findMany,
    },
  },
}));

import {
  compareModelTiers,
  resolveEffectiveEntitlements,
} from "./entitlements";

describe("organizations/entitlements", () => {
  beforeEach(() => {
    mocks.findMany.mockReset();
  });

  it("compares model tiers in the expected direction", () => {
    expect(compareModelTiers("PRO", "BASIC")).toBeGreaterThan(0);
    expect(compareModelTiers("BASIC", "PRO")).toBeLessThan(0);
    expect(compareModelTiers("BASIC_PLUS", "BASIC_PLUS")).toBe(0);
  });

  it("returns admin personal entitlements and skips org lookup for admin users", async () => {
    const result = await resolveEffectiveEntitlements({
      userId: "u1",
      userRole: "ADMIN",
      subscriptionStatus: "ACTIVE",
      planId: "basic",
    });

    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      limits: PERSONAL_PLAN_LIMITS.ADMIN,
      modelTier: "ADMIN",
      sources: [
        {
          type: "personal",
          sourceId: "personal-admin",
          sourceLabel: "Admin role",
          limits: PERSONAL_PLAN_LIMITS.ADMIN,
          modelTier: "ADMIN",
        },
      ],
    });
  });

  it("returns guest personal entitlements and skips org lookup for guests", async () => {
    const result = await resolveEffectiveEntitlements({
      userId: "u2",
      isGuest: true,
      subscriptionStatus: "ACTIVE",
      planId: "pro",
    });

    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      limits: PERSONAL_PLAN_LIMITS.GUEST,
      modelTier: "TRIAL",
      sources: [
        {
          type: "personal",
          sourceId: "personal-subscription",
          sourceLabel: "Guest",
          limits: PERSONAL_PLAN_LIMITS.GUEST,
          modelTier: "TRIAL",
        },
      ],
    });
  });

  it("falls back to personal subscription when no active memberships exist", async () => {
    mocks.findMany.mockResolvedValue([]);

    const result = await resolveEffectiveEntitlements({
      userId: "u3",
      subscriptionStatus: "ACTIVE",
      planId: "my-basic_plus-plan",
      userRole: "USER",
    });

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        userId: "u3",
        status: "ACTIVE",
        organization: {
          status: "ACTIVE",
        },
      },
      select: {
        organizationId: true,
        organization: {
          select: {
            id: true,
            name: true,
            contract: {
              select: {
                id: true,
                organizationId: true,
                seatLimit: true,
                planLabel: true,
                modelTier: true,
                maxRequestsPerDay: true,
                maxInputTokensPerDay: true,
                maxOutputTokensPerDay: true,
                maxCostPerDay: true,
                maxContextMessages: true,
                version: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });
    expect(result.sources[0]).toMatchObject({
      type: "personal",
      sourceId: "personal-subscription",
      sourceLabel: "Personal basic_plus",
      modelTier: "BASIC_PLUS",
    });
    expect(result.limits).toEqual(PERSONAL_PLAN_LIMITS.basic_plus);
  });

  it("selects the strongest organization source when contracts are present", async () => {
    mocks.findMany.mockResolvedValue([
      {
        organizationId: "org-basic",
        organization: {
          id: "org-basic",
          name: "Basic Org",
          contract: {
            basePlan: "BASIC",
          },
        },
      },
      {
        organizationId: "org-pro",
        organization: {
          id: "org-pro",
          name: "Pro Org",
          contract: {
            basePlan: "PRO",
          },
        },
      },
    ]);

    const result = await resolveEffectiveEntitlements({
      userId: "u4",
      subscriptionStatus: "TRIAL",
      userRole: "USER",
    });

    expect(result).toMatchObject({
      modelTier: "PRO",
      sources: [
        {
          type: "organization",
          sourceId: "org-pro",
          sourceLabel: "organization:Pro Org:PRO",
          modelTier: "PRO",
        },
      ],
    });
  });

  it("uses sourceId lexical tiebreaker for equivalent organization entitlements", async () => {
    mocks.findMany.mockResolvedValue([
      {
        organizationId: "org-z",
        organization: {
          id: "org-z",
          name: "Zulu Org",
          contract: {
            basePlan: "BASIC",
          },
        },
      },
      {
        organizationId: "org-a",
        organization: {
          id: "org-a",
          name: "Alpha Org",
          contract: {
            basePlan: "BASIC",
          },
        },
      },
    ]);

    const result = await resolveEffectiveEntitlements({
      userId: "u5",
      subscriptionStatus: "TRIAL",
      userRole: "USER",
    });

    expect(result.sources[0]?.sourceId).toBe("org-a");
    expect(result.sources[0]?.sourceLabel).toBe("organization:Alpha Org:BASIC");
  });

  it("falls back to personal source when memberships exist but none has a contract", async () => {
    mocks.findMany.mockResolvedValue([
      {
        organizationId: "org-1",
        organization: {
          id: "org-1",
          name: "No Contract 1",
          contract: null,
        },
      },
      {
        organizationId: "org-2",
        organization: {
          id: "org-2",
          name: "No Contract 2",
          contract: null,
        },
      },
    ]);

    const result = await resolveEffectiveEntitlements({
      userId: "u6",
      subscriptionStatus: "ACTIVE",
      planId: "my-basic-plan",
      userRole: "USER",
    });

    expect(result).toEqual({
      limits: PERSONAL_PLAN_LIMITS.basic,
      modelTier: "BASIC",
      sources: [
        {
          type: "personal",
          sourceId: "personal-fallback",
          sourceLabel: "Personal fallback (missing organization contract)",
          limits: PERSONAL_PLAN_LIMITS.basic,
          modelTier: "BASIC",
        },
      ],
    });
  });
});
