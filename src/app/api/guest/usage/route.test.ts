import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateGuest: vi.fn(),
  getDailyUsage: vi.fn(),
  getRateLimitsForUser: vi.fn(),
}));

vi.mock("@/lib/guest-auth", () => ({
  authenticateGuest: mocks.authenticateGuest,
}));

vi.mock("@/lib/rate-limit", () => ({
  getDailyUsage: mocks.getDailyUsage,
  getRateLimitsForUser: mocks.getRateLimitsForUser,
}));

import { GET } from "./route";

describe("GET /api/guest/usage", () => {
  beforeEach(() => {
    mocks.authenticateGuest.mockReset();
    mocks.getDailyUsage.mockReset();
    mocks.getRateLimitsForUser.mockReset();

    mocks.authenticateGuest.mockResolvedValue({
      user: { id: "guest-1", isGuest: true },
    });

    mocks.getDailyUsage.mockResolvedValue({
      requestCount: 7,
      inputTokens: 120,
      outputTokens: 90,
      totalCostUsd: 0.42,
    });

    mocks.getRateLimitsForUser.mockReturnValue({
      maxRequestsPerDay: 25,
      maxInputTokensPerDay: 5000,
      maxOutputTokensPerDay: 5000,
      maxCostPerDay: 2,
      maxContextMessages: 10,
    });
  });

  it("returns guest usage and mapped limits", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.getDailyUsage).toHaveBeenCalledWith("guest-1");
    expect(mocks.getRateLimitsForUser).toHaveBeenCalledWith(
      undefined,
      "USER",
      null,
      true,
    );
    await expect(response.json()).resolves.toEqual({
      usage: {
        requestCount: 7,
        inputTokens: 120,
        outputTokens: 90,
        totalCostUsd: 0.42,
      },
      limits: {
        maxRequests: 25,
        maxInputTokens: 5000,
        maxOutputTokens: 5000,
        maxCostUsd: 2,
      },
      tier: "GUEST",
      subscriptionStatus: null,
    });
  });

  it("returns 500 when guest authentication fails", async () => {
    mocks.authenticateGuest.mockRejectedValue(new Error("bad token"));

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch usage",
    });
  });

  it("returns 500 when usage lookup fails", async () => {
    mocks.getDailyUsage.mockRejectedValue(new Error("db failed"));

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch usage",
    });
  });
});
