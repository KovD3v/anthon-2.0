import { describe, expect, it } from "vitest";
import { PlanResolutionError } from "@/lib/plans";
import { getVoicePlanConfig } from "./config";

describe("voice/config", () => {
  it("gives unlimited voice config to admin roles", () => {
    const admin = getVoicePlanConfig("TRIAL", "ADMIN", "basic", false);
    const superAdmin = getVoicePlanConfig("ACTIVE", "SUPER_ADMIN", "pro", true);

    expect(admin).toEqual({
      enabled: true,
      baseProbability: 1,
      decayFactor: 1,
      capWindowMs: 36 * 60 * 60 * 1000,
      maxPerWindow: Number.POSITIVE_INFINITY,
    });
    expect(superAdmin).toEqual(admin);
  });

  it("disables voice for guests", () => {
    expect(getVoicePlanConfig("ACTIVE", "USER", "pro", true)).toEqual({
      enabled: false,
      baseProbability: 0,
      decayFactor: 0,
      capWindowMs: 0,
      maxPerWindow: 0,
    });
  });

  it("resolves from model tier when provided", () => {
    expect(
      getVoicePlanConfig("ACTIVE", "USER", "basic", false, "BASIC_PLUS"),
    ).toMatchObject({
      enabled: true,
      baseProbability: 0.6,
      decayFactor: 0.85,
      maxPerWindow: 20,
    });

    expect(
      getVoicePlanConfig("ACTIVE", "USER", "basic_plus", false, "PRO"),
    ).toMatchObject({
      enabled: true,
      baseProbability: 0.8,
      decayFactor: 0.9,
      maxPerWindow: 50,
    });

    expect(
      getVoicePlanConfig("ACTIVE", "USER", "pro", false, "ENTERPRISE"),
    ).toMatchObject({
      enabled: true,
      baseProbability: 0.8,
      decayFactor: 0.9,
      maxPerWindow: 50,
    });
  });

  it("uses model tier before plan id when both are set", () => {
    const result = getVoicePlanConfig(
      "ACTIVE",
      "USER",
      "my-pro-plan",
      false,
      "BASIC",
    );

    expect(result).toMatchObject({
      enabled: true,
      baseProbability: 0.5,
      decayFactor: 0.8,
      maxPerWindow: 10,
    });
  });

  it("resolves from active plan id when model tier is absent", () => {
    expect(getVoicePlanConfig("ACTIVE", "USER", "my-pro-plan")).toMatchObject({
      enabled: true,
      baseProbability: 0.8,
      decayFactor: 0.9,
      maxPerWindow: 50,
    });

    expect(
      getVoicePlanConfig("ACTIVE", "USER", "my-basic_plus-plan"),
    ).toMatchObject({
      enabled: true,
      baseProbability: 0.6,
      decayFactor: 0.85,
      maxPerWindow: 20,
    });

    expect(getVoicePlanConfig("ACTIVE", "USER", "my-basic-plan")).toMatchObject(
      {
        enabled: true,
        baseProbability: 0.5,
        decayFactor: 0.8,
        maxPerWindow: 10,
      },
    );
  });

  it("throws when active subscriptions have unknown plan IDs", () => {
    expect(() => getVoicePlanConfig("ACTIVE", "USER", null)).toThrow(
      PlanResolutionError,
    );
  });

  it("falls back to trial config for non-active users", () => {
    expect(getVoicePlanConfig("TRIAL", "USER", "basic")).toMatchObject({
      enabled: false,
      baseProbability: 0.3,
      decayFactor: 0.7,
      maxPerWindow: 3,
    });
    expect(getVoicePlanConfig(undefined, "USER", undefined)).toMatchObject({
      enabled: false,
      baseProbability: 0.3,
      decayFactor: 0.7,
      maxPerWindow: 3,
    });
  });
});
