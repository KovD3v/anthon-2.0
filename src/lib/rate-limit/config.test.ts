import { describe, expect, it } from "vitest";
import { PERSONAL_PLAN_LIMITS } from "@/lib/limits/personal-limits";
import { getEffectivePlanId, getRateLimitsForUser } from "./config";

describe("rate-limit/config", () => {
  it("maps admin roles to admin plan and limits", () => {
    expect(getEffectivePlanId("ACTIVE", "ADMIN", "basic")).toBe("ADMIN");
    expect(getEffectivePlanId("ACTIVE", "SUPER_ADMIN", "pro")).toBe("ADMIN");
    expect(getRateLimitsForUser("ACTIVE", "ADMIN", "basic")).toEqual(
      PERSONAL_PLAN_LIMITS.ADMIN,
    );
  });

  it("maps guests to guest plan and limits", () => {
    expect(getEffectivePlanId(undefined, undefined, null, true)).toBe("GUEST");
    expect(getRateLimitsForUser(undefined, undefined, null, true)).toEqual(
      PERSONAL_PLAN_LIMITS.GUEST,
    );
  });

  it("resolves active pro/basic_plus/basic plan IDs", () => {
    expect(getEffectivePlanId("ACTIVE", "USER", "my-pro-plan")).toBe("pro");
    expect(getEffectivePlanId("ACTIVE", "USER", "my-basic_plus-plan")).toBe(
      "basic_plus",
    );
    expect(getEffectivePlanId("ACTIVE", "USER", "my-basic-plan")).toBe("basic");

    expect(getRateLimitsForUser("ACTIVE", "USER", "my-pro-plan")).toEqual(
      PERSONAL_PLAN_LIMITS.pro,
    );
    expect(
      getRateLimitsForUser("ACTIVE", "USER", "my-basic_plus-plan"),
    ).toEqual(PERSONAL_PLAN_LIMITS.basic_plus);
    expect(getRateLimitsForUser("ACTIVE", "USER", "my-basic-plan")).toEqual(
      PERSONAL_PLAN_LIMITS.basic,
    );
  });

  it("falls back to ACTIVE when subscription is active without recognized plan ID", () => {
    expect(getEffectivePlanId("ACTIVE", "USER", null)).toBe("ACTIVE");
    expect(getRateLimitsForUser("ACTIVE", "USER", null)).toEqual(
      PERSONAL_PLAN_LIMITS.ACTIVE,
    );
  });

  it("falls back to TRIAL when subscription is not active", () => {
    expect(getEffectivePlanId("TRIAL", "USER", "basic")).toBe("TRIAL");
    expect(getRateLimitsForUser("TRIAL", "USER", "basic")).toEqual(
      PERSONAL_PLAN_LIMITS.TRIAL,
    );
  });
});
