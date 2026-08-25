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
      plan: "BASIC",
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
    mocks.resolveEffectiveEntitlements.mockResolvedValueOnce({
      plan: "ADMIN",
      limits: {
        maxRequestsPerDay: 100,
        maxInputTokensPerDay: 10000,
        maxOutputTokensPerDay: 8000,
        maxCostPerDay: 5,
        maxContextMessages: 20,
      },
      modelTier: "ADMIN",
      sources: [],
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

  it("returns BASIC_PLUS tier when user has active subscription", async () => {
    mocks.getFullUser.mockResolvedValue({
      id: "user-2",
      isGuest: false,
      subscription: {
        status: "ACTIVE",
        planId: "basic_plus",
      },
    });
    mocks.resolveEffectiveEntitlements.mockResolvedValueOnce({
      plan: "BASIC_PLUS",
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

    const result = await getSharedUsageData("user-2", "USER");

    expect(mocks.resolveEffectiveEntitlements).toHaveBeenCalledWith({
      userId: "user-2",
      subscriptionStatus: "ACTIVE",
      userRole: "USER",
      planId: "basic_plus",
      isGuest: false,
    });
    expect(result.tier).toBe("BASIC_PLUS");
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

  it("returns GUEST tier for guest users", async () => {
    mocks.getFullUser.mockResolvedValue({
      id: "guest-1",
      isGuest: true,
      subscription: null,
    });
    mocks.resolveEffectiveEntitlements.mockResolvedValueOnce({
      plan: "GUEST",
      limits: {
        maxRequestsPerDay: 4,
        maxInputTokensPerDay: 20_000,
        maxOutputTokensPerDay: 10_000,
        maxCostPerDay: 0.05,
        maxContextMessages: 5,
      },
      modelTier: "GUEST",
      sources: [],
    });

    const result = await getSharedUsageData("guest-1", "USER");

    expect(mocks.resolveEffectiveEntitlements).toHaveBeenCalledWith({
      userId: "guest-1",
      subscriptionStatus: undefined,
      userRole: "USER",
      planId: undefined,
      isGuest: true,
    });
    expect(result.tier).toBe("GUEST");
    expect(result.subscriptionStatus).toBeNull();
  });

  it("returns the organization plan when personal access is expired", async () => {
    mocks.getFullUser.mockResolvedValue({
      id: "user-3",
      isGuest: false,
      subscription: {
        status: "EXPIRED",
        planId: null,
      },
    });
    mocks.resolveEffectiveEntitlements.mockResolvedValue({
      plan: "PRO",
      limits: {
        maxRequestsPerDay: 100,
        maxInputTokensPerDay: 2_000_000,
        maxOutputTokensPerDay: 1_000_000,
        maxCostPerDay: 15,
        maxContextMessages: 100,
      },
      modelTier: "PRO",
      sources: [
        {
          type: "organization",
          sourceId: "org-pro",
          sourceLabel: "Organization Pro",
        },
      ],
    });

    const result = await getSharedUsageData("user-3", "USER");

    expect(result.tier).toBe("PRO");
  });
});
