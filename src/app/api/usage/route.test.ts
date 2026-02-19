import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  getFullUser: vi.fn(),
  getDailyUsage: vi.fn(),
  resolveEffectiveEntitlements: vi.fn(),
  isBillingSyncStale: vi.fn(),
  syncPersonalSubscriptionFromClerk: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getAuthUser: mocks.getAuthUser,
  getFullUser: mocks.getFullUser,
}));

vi.mock("@/lib/rate-limit", () => ({
  getDailyUsage: mocks.getDailyUsage,
}));

vi.mock("@/lib/organizations/entitlements", () => ({
  resolveEffectiveEntitlements: mocks.resolveEffectiveEntitlements,
}));

vi.mock("@/lib/billing/personal-subscription", () => ({
  isBillingSyncStale: mocks.isBillingSyncStale,
  syncPersonalSubscriptionFromClerk: mocks.syncPersonalSubscriptionFromClerk,
}));

import { GET } from "./route";

describe("GET /api/usage", () => {
  beforeEach(() => {
    mocks.getAuthUser.mockReset();
    mocks.getFullUser.mockReset();
    mocks.getDailyUsage.mockReset();
    mocks.resolveEffectiveEntitlements.mockReset();
    mocks.isBillingSyncStale.mockReset();
    mocks.syncPersonalSubscriptionFromClerk.mockReset();

    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", role: "USER" },
      error: null,
    });
    mocks.getFullUser.mockResolvedValue({
      id: "user-1",
      clerkId: "clerk_1",
      isGuest: false,
      billingSyncedAt: new Date("2026-02-18T10:00:00.000Z"),
      subscription: {
        status: "ACTIVE",
        planId: "my-basic-plan",
      },
    });
    mocks.getDailyUsage.mockResolvedValue({
      requestCount: 2,
      inputTokens: 300,
      outputTokens: 120,
      totalCostUsd: 0.45,
    });
    mocks.resolveEffectiveEntitlements.mockResolvedValue({
      limits: {
        maxRequestsPerDay: 10,
        maxInputTokensPerDay: 1000,
        maxOutputTokensPerDay: 500,
        maxCostPerDay: 5,
        maxContextMessages: 20,
      },
      modelTier: "BASIC",
      sources: [
        {
          type: "personal",
          sourceId: "personal-subscription",
          sourceLabel: "Personal basic",
          limits: {
            maxRequestsPerDay: 10,
            maxInputTokensPerDay: 1000,
            maxOutputTokensPerDay: 500,
            maxCostPerDay: 5,
            maxContextMessages: 20,
          },
          modelTier: "BASIC",
        },
      ],
    });
    mocks.syncPersonalSubscriptionFromClerk.mockResolvedValue(null);
    mocks.isBillingSyncStale.mockImplementation(
      (billingSyncedAt?: Date | null) =>
        !billingSyncedAt ||
        Date.now() - billingSyncedAt.getTime() > 5 * 60 * 1000,
    );
  });

  it("returns 401 when user is not authenticated", async () => {
    mocks.getAuthUser.mockResolvedValue({ user: null, error: "Unauthorized" });

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns mapped usage payload for active subscriptions", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      usage: {
        requestCount: 2,
        inputTokens: 300,
        outputTokens: 120,
        totalCostUsd: 0.45,
      },
      limits: {
        maxRequests: 10,
        maxInputTokens: 1000,
        maxOutputTokens: 500,
        maxCostUsd: 5,
      },
      tier: "BASIC",
      subscriptionStatus: "ACTIVE",
      entitlements: {
        modelTier: "BASIC",
        sources: [
          {
            type: "personal",
            sourceId: "personal-subscription",
            sourceLabel: "Personal basic",
          },
        ],
      },
    });

    expect(mocks.resolveEffectiveEntitlements).toHaveBeenCalledWith({
      userId: "user-1",
      subscriptionStatus: "ACTIVE",
      userRole: "USER",
      planId: "my-basic-plan",
      isGuest: false,
    });
  });

  it("returns ADMIN tier for admin role users", async () => {
    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", role: "ADMIN" },
      error: null,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tier: "ADMIN",
    });
  });

  it("returns TRIAL tier and null subscriptionStatus when subscription is missing", async () => {
    mocks.getFullUser.mockResolvedValue({
      id: "user-1",
      clerkId: "clerk_1",
      isGuest: false,
      billingSyncedAt: new Date("2026-02-18T10:00:00.000Z"),
      subscription: null,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tier: "TRIAL",
      subscriptionStatus: null,
    });
  });

  it("skips Clerk sync when trial subscription was synced recently", async () => {
    mocks.getFullUser.mockResolvedValue({
      id: "user-1",
      clerkId: "clerk_1",
      isGuest: false,
      billingSyncedAt: new Date(),
      subscription: {
        status: "TRIAL",
        planId: "my-basic-plan",
      },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.syncPersonalSubscriptionFromClerk).not.toHaveBeenCalled();
  });

  it("syncs when trial subscription is stale", async () => {
    mocks.getFullUser.mockResolvedValue({
      id: "user-1",
      clerkId: "clerk_1",
      isGuest: false,
      billingSyncedAt: new Date(Date.now() - 6 * 60 * 1000),
      subscription: {
        status: "TRIAL",
        planId: "my-basic-plan",
      },
    });
    mocks.syncPersonalSubscriptionFromClerk.mockResolvedValue({
      status: "ACTIVE",
      planId: "my-pro-plan",
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.syncPersonalSubscriptionFromClerk).toHaveBeenCalledWith({
      userId: "user-1",
      clerkUserId: "clerk_1",
      current: {
        status: "TRIAL",
        planId: "my-basic-plan",
      },
    });
    expect(mocks.resolveEffectiveEntitlements).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionStatus: "ACTIVE",
        planId: "my-pro-plan",
      }),
    );
  });

  it("keeps response stable when stale sync returns null", async () => {
    mocks.getFullUser.mockResolvedValue({
      id: "user-1",
      clerkId: "clerk_1",
      isGuest: false,
      billingSyncedAt: new Date(Date.now() - 6 * 60 * 1000),
      subscription: null,
    });
    mocks.syncPersonalSubscriptionFromClerk.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tier: "TRIAL",
      subscriptionStatus: null,
    });
    expect(mocks.syncPersonalSubscriptionFromClerk).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when downstream dependency throws", async () => {
    mocks.getFullUser.mockRejectedValue(new Error("db failure"));

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch usage",
    });
  });
});
