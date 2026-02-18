import { describe, expect, it } from "vitest";

import { getRetentionParams } from "./retention-policy";

describe("maintenance/retention-policy", () => {
  it("returns ADMIN retention for admin roles", () => {
    expect(
      getRetentionParams({
        role: "ADMIN",
        isGuest: false,
        subscription: null,
      } as never),
    ).toEqual({ retentionDays: 3650 });

    expect(
      getRetentionParams({
        role: "SUPER_ADMIN",
        isGuest: false,
        subscription: null,
      } as never),
    ).toEqual({ retentionDays: 3650 });
  });

  it("returns GUEST retention for guest users", () => {
    expect(
      getRetentionParams({
        role: "USER",
        isGuest: true,
        subscription: null,
      } as never),
    ).toEqual({ retentionDays: 1 });
  });

  it("returns PRO retention for active pro plans", () => {
    expect(
      getRetentionParams({
        role: "USER",
        isGuest: false,
        subscription: {
          status: "ACTIVE",
          planId: "my-pro-plan",
        },
      } as never),
    ).toEqual({ retentionDays: 180 });
  });

  it("returns BASIC_PLUS retention for active basic_plus plans", () => {
    expect(
      getRetentionParams({
        role: "USER",
        isGuest: false,
        subscription: {
          status: "ACTIVE",
          planId: "basic_plus",
        },
      } as never),
    ).toEqual({ retentionDays: 60 });
  });

  it("falls back to TRIAL retention", () => {
    expect(
      getRetentionParams({
        role: "USER",
        isGuest: false,
        subscription: {
          status: "TRIAL",
          planId: "anything",
        },
      } as never),
    ).toEqual({ retentionDays: 7 });

    expect(
      getRetentionParams({
        role: "USER",
        isGuest: false,
        subscription: null,
      } as never),
    ).toEqual({ retentionDays: 7 });
  });
});
