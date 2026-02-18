import { describe, expect, it } from "vitest";
import { PLAN_CATALOG } from "./catalog";
import { PlanResolutionError } from "./errors";
import {
  compareEntitlementVectors,
  parseCanonicalPlanFromPlanId,
  resolveEffectiveEntitlements,
  resolvePersonalPlan,
} from "./resolver";

describe("plans/resolver", () => {
  it("parses canonical plans from planId strings", () => {
    expect(parseCanonicalPlanFromPlanId("my-pro-plan")).toBe("PRO");
    expect(parseCanonicalPlanFromPlanId("my-basic_plus-plan")).toBe(
      "BASIC_PLUS",
    );
    expect(parseCanonicalPlanFromPlanId("my-basic-plan")).toBe("BASIC");
    expect(parseCanonicalPlanFromPlanId("unknown")).toBeNull();
  });

  it("resolves personal plan with admin and guest precedence", () => {
    expect(
      resolvePersonalPlan({
        subscriptionStatus: "ACTIVE",
        userRole: "ADMIN",
        planId: null,
      }),
    ).toBe("ADMIN");

    expect(
      resolvePersonalPlan({
        subscriptionStatus: "ACTIVE",
        isGuest: true,
        planId: "my-pro-plan",
      }),
    ).toBe("GUEST");
  });

  it("resolves active personal plans and fails closed on invalid active planId", () => {
    expect(
      resolvePersonalPlan({
        subscriptionStatus: "ACTIVE",
        userRole: "USER",
        planId: "my-basic_plus-plan",
      }),
    ).toBe("BASIC_PLUS");

    expect(
      resolvePersonalPlan({
        subscriptionStatus: "TRIAL",
        userRole: "USER",
        planId: "my-pro-plan",
      }),
    ).toBe("TRIAL");

    expect(() =>
      resolvePersonalPlan({
        subscriptionStatus: "ACTIVE",
        userRole: "USER",
        planId: "invalid-plan",
      }),
    ).toThrow(PlanResolutionError);
  });

  it("applies best-of vector between personal and organization sources", () => {
    const result = resolveEffectiveEntitlements({
      subscriptionStatus: "ACTIVE",
      userRole: "USER",
      planId: "my-basic-plan",
      organizationSources: [
        {
          sourceId: "org-pro",
          sourceLabel: "organization:Pro Org:PRO",
          plan: "PRO",
          modelTier: "PRO",
          limits: PLAN_CATALOG.PRO.limits,
        },
      ],
    });

    expect(result.sourceType).toBe("organization");
    expect(result.sourceId).toBe("org-pro");
    expect(result.plan).toBe("PRO");
  });

  it("keeps enterprise contract limits as-is", () => {
    const result = resolveEffectiveEntitlements({
      subscriptionStatus: "TRIAL",
      userRole: "USER",
      organizationSources: [
        {
          sourceId: "org-enterprise",
          sourceLabel: "organization:Ent:ENTERPRISE",
          modelTier: "ENTERPRISE",
          limits: {
            maxRequestsPerDay: 7,
            maxInputTokensPerDay: 7000,
            maxOutputTokensPerDay: 3500,
            maxCostPerDay: 0.7,
            maxContextMessages: 7,
          },
        },
      ],
    });

    expect(result.modelTier).toBe("ENTERPRISE");
    expect(result.limits).toEqual({
      maxRequestsPerDay: 7,
      maxInputTokensPerDay: 7000,
      maxOutputTokensPerDay: 3500,
      maxCostPerDay: 0.7,
      maxContextMessages: 7,
    });
  });

  it("uses deterministic lexical tie-break for equal vectors", () => {
    const result = resolveEffectiveEntitlements({
      subscriptionStatus: "TRIAL",
      userRole: "USER",
      organizationSources: [
        {
          sourceId: "org-z",
          sourceLabel: "organization:Z:PRO",
          modelTier: "PRO",
          limits: PLAN_CATALOG.PRO.limits,
        },
        {
          sourceId: "org-a",
          sourceLabel: "organization:A:PRO",
          modelTier: "PRO",
          limits: PLAN_CATALOG.PRO.limits,
        },
      ],
    });

    expect(result.sourceId).toBe("org-a");
  });

  it("applies model tier override before personal parsing for policy consumers", () => {
    const result = resolveEffectiveEntitlements({
      subscriptionStatus: "ACTIVE",
      userRole: "USER",
      planId: "my-pro-plan",
      modelTier: "BASIC",
    });

    expect(result.sourceId).toBe("model-tier-override");
    expect(result.modelTier).toBe("BASIC");
    expect(result.plan).toBe("BASIC");
  });

  it("compares entitlement vectors by model tier first, then limits", () => {
    const basic = {
      modelTier: "BASIC" as const,
      limits: PLAN_CATALOG.BASIC.limits,
    };
    const pro = {
      modelTier: "PRO" as const,
      limits: PLAN_CATALOG.PRO.limits,
    };

    expect(compareEntitlementVectors(pro, basic)).toBeGreaterThan(0);
    expect(compareEntitlementVectors(basic, pro)).toBeLessThan(0);
  });
});
