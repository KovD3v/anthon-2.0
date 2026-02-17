import { describe, expect, it } from "vitest";
import {
  applyOrgOverrides,
  compareEntitlementVectors,
  isOrganizationBasePlan,
  normalizeModelTier,
  normalizeOrganizationBasePlan,
  resolveOrgPlanDefaults,
} from "./plan-defaults";

describe("organizations/plan-defaults", () => {
  it("validates and normalizes base plan values", () => {
    expect(isOrganizationBasePlan("BASIC")).toBe(true);
    expect(isOrganizationBasePlan("BASIC_PLUS")).toBe(true);
    expect(isOrganizationBasePlan("PRO")).toBe(true);
    expect(isOrganizationBasePlan("trial")).toBe(false);
    expect(isOrganizationBasePlan(null)).toBe(false);

    expect(normalizeOrganizationBasePlan("PRO")).toBe("PRO");
    expect(normalizeOrganizationBasePlan("unknown")).toBe("BASIC");
  });

  it("normalizes model tiers and falls back to TRIAL", () => {
    expect(normalizeModelTier("ENTERPRISE")).toBe("ENTERPRISE");
    expect(normalizeModelTier("ADMIN")).toBe("ADMIN");
    expect(normalizeModelTier("invalid")).toBe("TRIAL");
    expect(normalizeModelTier(undefined)).toBe("TRIAL");
  });

  it("returns defaults for a base plan", () => {
    const defaults = resolveOrgPlanDefaults("PRO");
    expect(defaults.basePlan).toBe("PRO");
    expect(defaults.planLabel).toBe("Pro");
    expect(defaults.modelTier).toBe("PRO");
    expect(defaults.seatLimit).toBe(50);
    expect(defaults.limits.maxRequestsPerDay).toBe(100);
  });

  it("applies finite contract overrides and trims labels", () => {
    const result = applyOrgOverrides({
      basePlan: "BASIC_PLUS",
      planLabel: "  Team Plus  ",
      modelTier: "PRO",
      seatLimit: 42,
      maxRequestsPerDay: 70,
      maxInputTokensPerDay: 900_000,
      maxOutputTokensPerDay: 500_000,
      maxCostPerDay: 7,
      maxContextMessages: 35,
    });

    expect(result.basePlan).toBe("BASIC_PLUS");
    expect(result.effective).toEqual({
      seatLimit: 42,
      planLabel: "Team Plus",
      modelTier: "PRO",
      limits: {
        maxRequestsPerDay: 70,
        maxInputTokensPerDay: 900_000,
        maxOutputTokensPerDay: 500_000,
        maxCostPerDay: 7,
        maxContextMessages: 35,
      },
    });
  });

  it("falls back to defaults for invalid override values", () => {
    const result = applyOrgOverrides({
      basePlan: "INVALID",
      planLabel: "   ",
      modelTier: "INVALID",
      seatLimit: Number.NaN,
      maxRequestsPerDay: Number.NaN,
    });

    expect(result.basePlan).toBe("BASIC");
    expect(result.effective.planLabel).toBe("Basic");
    expect(result.effective.modelTier).toBe("TRIAL");
    expect(result.effective.seatLimit).toBe(10);
    expect(result.effective.limits.maxRequestsPerDay).toBe(50);
  });

  it("compares vectors by model tier first, then limits", () => {
    const basic = {
      modelTier: "BASIC" as const,
      limits: {
        maxRequestsPerDay: 50,
        maxInputTokensPerDay: 500_000,
        maxOutputTokensPerDay: 250_000,
        maxCostPerDay: 3,
        maxContextMessages: 15,
      },
    };
    const pro = {
      modelTier: "PRO" as const,
      limits: {
        maxRequestsPerDay: 50,
        maxInputTokensPerDay: 500_000,
        maxOutputTokensPerDay: 250_000,
        maxCostPerDay: 3,
        maxContextMessages: 15,
      },
    };

    expect(compareEntitlementVectors(pro, basic)).toBeGreaterThan(0);
    expect(compareEntitlementVectors(basic, pro)).toBeLessThan(0);

    const basicHigherRequests = {
      ...basic,
      limits: { ...basic.limits, maxRequestsPerDay: 80 },
    };
    expect(
      compareEntitlementVectors(basicHigherRequests, basic),
    ).toBeGreaterThan(0);
  });
});
