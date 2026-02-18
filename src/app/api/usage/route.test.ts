import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  getFullUser: vi.fn(),
  getDailyUsage: vi.fn(),
  resolveEffectiveEntitlements: vi.fn(),
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

import { GET } from "./route";

describe("GET /api/usage", () => {
  beforeEach(() => {
    mocks.getAuthUser.mockReset();
    mocks.getFullUser.mockReset();
    mocks.getDailyUsage.mockReset();
    mocks.resolveEffectiveEntitlements.mockReset();

    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", role: "USER" },
      error: null,
    });
    mocks.getFullUser.mockResolvedValue({
      id: "user-1",
      isGuest: false,
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
      isGuest: false,
      subscription: null,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tier: "TRIAL",
      subscriptionStatus: null,
    });
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
