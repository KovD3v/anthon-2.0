import { describe, expect, it } from "vitest";
import {
  PERSONAL_PLAN_KEYS,
  PERSONAL_PLAN_LIMITS,
  planKeyToModelTier,
} from "./personal-limits";

describe("limits/personal-limits", () => {
  it("exposes the expected plan keys", () => {
    expect(PERSONAL_PLAN_KEYS).toEqual([
      "GUEST",
      "TRIAL",
      "BASIC",
      "BASIC_PLUS",
      "PRO",
      "ADMIN",
    ]);
  });

  it("maps personal plan keys to model tiers", () => {
    expect(planKeyToModelTier("GUEST")).toBe("TRIAL");
    expect(planKeyToModelTier("TRIAL")).toBe("TRIAL");
    expect(planKeyToModelTier("BASIC")).toBe("BASIC");
    expect(planKeyToModelTier("BASIC_PLUS")).toBe("BASIC_PLUS");
    expect(planKeyToModelTier("PRO")).toBe("PRO");
    expect(planKeyToModelTier("ADMIN")).toBe("ADMIN");
  });

  it("keeps unlimited admin limits", () => {
    expect(PERSONAL_PLAN_LIMITS.ADMIN.maxRequestsPerDay).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(PERSONAL_PLAN_LIMITS.ADMIN.maxInputTokensPerDay).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(PERSONAL_PLAN_LIMITS.ADMIN.maxOutputTokensPerDay).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(PERSONAL_PLAN_LIMITS.ADMIN.maxCostPerDay).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});
