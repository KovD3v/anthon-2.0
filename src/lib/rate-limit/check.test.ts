import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EffectiveEntitlements } from "@/lib/organizations/types";

vi.mock("@/lib/rate-limit/usage", () => ({
  getDailyUsage: vi.fn(),
}));

vi.mock("@/lib/organizations/entitlements", () => ({
  resolveEffectiveEntitlements: vi.fn(),
}));

import { resolveEffectiveEntitlements } from "@/lib/organizations/entitlements";
import { checkRateLimit } from "./check";
import { getDailyUsage } from "./usage";

const mockGetDailyUsage = vi.mocked(getDailyUsage);
const mockResolveEffectiveEntitlements = vi.mocked(
  resolveEffectiveEntitlements,
);

const baseEntitlements: EffectiveEntitlements = {
  limits: {
    maxRequestsPerDay: 10,
    maxInputTokensPerDay: 100,
    maxOutputTokensPerDay: 50,
    maxCostPerDay: 1,
    maxContextMessages: 10,
  },
  modelTier: "BASIC",
  sources: [
    {
      type: "personal",
      sourceId: "personal-subscription",
      sourceLabel: "Personal basic",
      limits: {
        maxRequestsPerDay: 10,
        maxInputTokensPerDay: 100,
        maxOutputTokensPerDay: 50,
        maxCostPerDay: 1,
        maxContextMessages: 10,
      },
      modelTier: "BASIC",
    },
  ],
};

describe("checkRateLimit", () => {
  beforeEach(() => {
    mockResolveEffectiveEntitlements.mockResolvedValue(baseEntitlements);
    mockGetDailyUsage.mockResolvedValue({
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalCostUsd: 0,
    });
  });

  it("allows requests under all limits", async () => {
    mockGetDailyUsage.mockResolvedValue({
      requestCount: 2,
      inputTokens: 20,
      outputTokens: 10,
      totalCostUsd: 0.1,
    });

    const result = await checkRateLimit(
      "user-1",
      "ACTIVE",
      "USER",
      "basic",
      false,
    );

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.percentUsed).toEqual({
      requests: 20,
      inputTokens: 20,
      outputTokens: 20,
      cost: 10,
    });
    expect(result.entitlements).toEqual({
      modelTier: "BASIC",
      sources: [
        {
          type: "personal",
          sourceId: "personal-subscription",
          sourceLabel: "Personal basic",
        },
      ],
    });
    expect(result.effectiveEntitlements).toEqual(baseEntitlements);
  });

  it("blocks when request limit is reached", async () => {
    mockGetDailyUsage.mockResolvedValue({
      requestCount: 10,
      inputTokens: 0,
      outputTokens: 0,
      totalCostUsd: 0,
    });

    const result = await checkRateLimit(
      "user-1",
      "ACTIVE",
      "USER",
      "basic",
      false,
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Daily request limit reached");
    expect(result.upgradeInfo?.suggestedPlan).toBe("Basic Plus");
  });

  it("blocks when input token limit is reached", async () => {
    mockGetDailyUsage.mockResolvedValue({
      requestCount: 0,
      inputTokens: 100,
      outputTokens: 0,
      totalCostUsd: 0,
    });

    const result = await checkRateLimit(
      "user-1",
      "ACTIVE",
      "USER",
      "basic",
      false,
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Daily input token limit reached");
    expect(result.upgradeInfo?.suggestedPlan).toBe("Basic Plus");
  });

  it("blocks when output token limit is reached", async () => {
    mockGetDailyUsage.mockResolvedValue({
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 50,
      totalCostUsd: 0,
    });

    const result = await checkRateLimit(
      "user-1",
      "ACTIVE",
      "USER",
      "basic",
      false,
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Daily output token limit reached");
    expect(result.upgradeInfo?.suggestedPlan).toBe("Basic Plus");
  });

  it("blocks when daily cost limit is reached", async () => {
    mockGetDailyUsage.mockResolvedValue({
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalCostUsd: 1,
    });

    const result = await checkRateLimit(
      "user-1",
      "ACTIVE",
      "USER",
      "basic",
      false,
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Daily spending limit reached");
    expect(result.upgradeInfo?.suggestedPlan).toBe("Basic Plus");
  });
});
