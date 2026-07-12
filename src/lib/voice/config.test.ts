import { describe, expect, it } from "vitest";
import { PlanResolutionError } from "@/lib/plans";
import { getVoicePlanConfig } from "./config";

describe("voice/config", () => {
  it("keeps the same deterministic cadence across paid plans", () => {
    const basic = getVoicePlanConfig("ACTIVE", "USER", "my-basic-plan");
    const plus = getVoicePlanConfig("ACTIVE", "USER", "my-basic_plus-plan");
    const pro = getVoicePlanConfig("ACTIVE", "USER", "my-pro-plan");

    expect(basic.cadence).toEqual(plus.cadence);
    expect(plus.cadence).toEqual(pro.cadence);
    expect(basic.cadence).toEqual({
      strongMinTurns: 1,
      strongCooldownMs: 5 * 60 * 1000,
      naturalMinTurns: 3,
      naturalCooldownMs: 15 * 60 * 1000,
      maxAutomaticPerHour: 3,
      maxConsecutiveAudio: 2,
      antiDroughtTurns: 8,
      naturalConfidence: 0.7,
      antiDroughtConfidence: 0.6,
    });
  });

  it("uses quotas for plan differentiation and reserves explicit capacity", () => {
    expect(getVoicePlanConfig("ACTIVE", "USER", "my-basic-plan")).toMatchObject(
      {
        enabled: true,
        maxPerWindow: 10,
        automaticBudgetRatio: 0.65,
      },
    );
    expect(
      getVoicePlanConfig("ACTIVE", "USER", "my-basic_plus-plan"),
    ).toMatchObject({
      enabled: true,
      maxPerWindow: 20,
      automaticBudgetRatio: 0.65,
    });
    expect(getVoicePlanConfig("ACTIVE", "USER", "my-pro-plan")).toMatchObject({
      enabled: true,
      maxPerWindow: 50,
      automaticBudgetRatio: 0.65,
    });
  });

  it("gives admins unlimited voice and disables guests", () => {
    expect(getVoicePlanConfig("TRIAL", "ADMIN", "basic")).toMatchObject({
      enabled: true,
      maxPerWindow: Number.POSITIVE_INFINITY,
      automaticBudgetRatio: 1,
    });
    expect(getVoicePlanConfig("ACTIVE", "USER", "pro", true)).toMatchObject({
      enabled: false,
      maxPerWindow: 0,
    });
  });

  it("resolves organization tiers before personal plan IDs", () => {
    expect(
      getVoicePlanConfig("ACTIVE", "USER", "basic", false, "BASIC_PLUS"),
    ).toMatchObject({ enabled: true, maxPerWindow: 20 });
    expect(
      getVoicePlanConfig("ACTIVE", "USER", "basic_plus", false, "ENTERPRISE"),
    ).toMatchObject({ enabled: true, maxPerWindow: 50 });
  });

  it("fails closed for an unknown active plan", () => {
    expect(() => getVoicePlanConfig("ACTIVE", "USER", null)).toThrow(
      PlanResolutionError,
    );
  });
});
