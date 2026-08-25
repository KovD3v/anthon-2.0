import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveEffectiveEntitlements: vi.fn(),
}));

vi.mock("@/lib/organizations/entitlements", () => ({
  resolveEffectiveEntitlements: mocks.resolveEffectiveEntitlements,
}));

import { PlanResolutionError } from "@/lib/plans";
import { getRetentionParams } from "./retention-policy";

describe("maintenance/retention-policy", () => {
  beforeEach(() => {
    mocks.resolveEffectiveEntitlements.mockReset();
  });

  it("returns ADMIN retention for admin roles", async () => {
    mocks.resolveEffectiveEntitlements.mockResolvedValue({ plan: "ADMIN" });

    await expect(
      getRetentionParams({
        role: "ADMIN",
        isGuest: false,
        subscription: null,
      } as never),
    ).resolves.toEqual({ retentionDays: 3650 });

    await expect(
      getRetentionParams({
        role: "SUPER_ADMIN",
        isGuest: false,
        subscription: null,
      } as never),
    ).resolves.toEqual({ retentionDays: 3650 });
  });

  it("returns GUEST retention for guest users", async () => {
    mocks.resolveEffectiveEntitlements.mockResolvedValue({ plan: "GUEST" });

    await expect(
      getRetentionParams({
        role: "USER",
        isGuest: true,
        subscription: null,
      } as never),
    ).resolves.toEqual({ retentionDays: 1 });
  });

  it("returns PRO retention for active pro plans", async () => {
    mocks.resolveEffectiveEntitlements.mockResolvedValue({ plan: "PRO" });

    await expect(
      getRetentionParams({
        role: "USER",
        isGuest: false,
        subscription: {
          status: "ACTIVE",
          planId: "my-pro-plan",
        },
      } as never),
    ).resolves.toEqual({ retentionDays: 180 });
  });

  it("returns organization-funded retention without a personal plan", async () => {
    mocks.resolveEffectiveEntitlements.mockResolvedValue({
      plan: "BASIC_PLUS",
    });

    await expect(
      getRetentionParams({
        role: "USER",
        isGuest: false,
        subscription: {
          status: "EXPIRED",
          planId: null,
        },
      } as never),
    ).resolves.toEqual({ retentionDays: 60 });
  });

  it("keeps a bounded retention window without paid access", async () => {
    mocks.resolveEffectiveEntitlements.mockRejectedValue(
      new PlanResolutionError("PAID_ACCESS_REQUIRED"),
    );

    await expect(
      getRetentionParams({
        role: "USER",
        isGuest: false,
        subscription: {
          status: "EXPIRED",
          planId: "anything",
        },
      } as never),
    ).resolves.toEqual({ retentionDays: 7 });

    await expect(
      getRetentionParams({
        role: "USER",
        isGuest: false,
        subscription: null,
      } as never),
    ).resolves.toEqual({ retentionDays: 7 });
  });
});
