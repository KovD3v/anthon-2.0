import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFullUser: vi.fn(),
  getDailyUsage: vi.fn(),
  resolveEffectiveEntitlements: vi.fn(),
}));

vi.mock("react", () => ({
  cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@/lib/auth", () => ({
  getFullUser: mocks.getFullUser,
}));

vi.mock("@/lib/rate-limit", () => ({
  getDailyUsage: mocks.getDailyUsage,
}));

vi.mock("@/lib/organizations/entitlements", () => ({
  resolveEffectiveEntitlements: mocks.resolveEffectiveEntitlements,
}));

import { getSharedUsageData } from "./usage";

describe("lib/usage", () => {
  beforeEach(() => {
    mocks.getFullUser.mockReset();
    mocks.getDailyUsage.mockReset();
    mocks.resolveEffectiveEntitlements.mockReset();

    mocks.getDailyUsage.mockResolvedValue({
      requestCount: 5,
      inputTokens: 120,
      outputTokens: 80,
      totalCostUsd: 0.45,
    });

    mocks.resolveEffectiveEntitlements.mockResolvedValue({
      limits: {
        maxRequestsPerDay: 100,
        maxInputTokensPerDay: 10000,
        maxOutputTokensPerDay: 8000,
        maxCostPerDay: 5,
        maxContextMessages: 20,
      },
      modelTier: "BASIC",
      sources: [
        {
          type: "personal",
          sourceId: "personal-subscription",
          sourceLabel: "Personal",
        },
      ],
    });
  });

  it("returns ADMIN tier for admin roles", async () => {
    mocks.getFullUser.mockResolvedValue({
      id: "user-1",
      isGuest: false,
      subscription: {
        status: "ACTIVE",
        planId: "pro",
      },
    });

    const result = await getSharedUsageData("user-1", "ADMIN");

    expect(result.tier).toBe("ADMIN");
    expect(result.subscriptionStatus).toBe("ACTIVE");
    expect(result.usage).toEqual({
      requestCount: 5,
      inputTokens: 120,
      outputTokens: 80,
      totalCostUsd: 0.45,
    });
    expect(result.limits).toEqual({
      maxRequests: 100,
      maxInputTokens: 10000,
      maxOutputTokens: 8000,
      maxCostUsd: 5,
    });
  });

  it("returns ACTIVE tier when user has active subscription", async () => {
    mocks.getFullUser.mockResolvedValue({
      id: "user-2",
      isGuest: false,
      subscription: {
        status: "ACTIVE",
        planId: "basic_plus",
      },
    });

    const result = await getSharedUsageData("user-2", "USER");

    expect(mocks.resolveEffectiveEntitlements).toHaveBeenCalledWith({
      userId: "user-2",
      subscriptionStatus: "ACTIVE",
      userRole: "USER",
      planId: "basic_plus",
      isGuest: false,
    });
    expect(result.tier).toBe("ACTIVE");
    expect(result.entitlements).toEqual({
      modelTier: "BASIC",
      sources: [
        {
          type: "personal",
          sourceId: "personal-subscription",
          sourceLabel: "Personal",
        },
      ],
    });
  });

  it("falls back to TRIAL tier when no active subscription", async () => {
    mocks.getFullUser.mockResolvedValue({
      id: "guest-1",
      isGuest: true,
      subscription: null,
    });

    const result = await getSharedUsageData("guest-1", "USER");

    expect(mocks.resolveEffectiveEntitlements).toHaveBeenCalledWith({
      userId: "guest-1",
      subscriptionStatus: undefined,
      userRole: "USER",
      planId: undefined,
      isGuest: true,
    });
    expect(result.tier).toBe("TRIAL");
    expect(result.subscriptionStatus).toBeNull();
  });
});
