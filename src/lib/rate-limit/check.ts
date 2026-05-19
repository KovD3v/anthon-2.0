/**
 * Rate Limit Module — limit checking logic.
 */

import { createLogger } from "@/lib/logger";
import { resolveEffectiveEntitlements } from "@/lib/organizations/entitlements";
import type { EffectiveEntitlements } from "@/lib/organizations/types";
import { getEffectivePlanId } from "./config";
import type { RateLimitResult, RateLimits } from "./types";
import { getUpgradeInfo } from "./upgrade";
import { getDailyUsage } from "./usage";

const usageLogger = createLogger("usage");

function buildEntitlementsPayload(entitlements: EffectiveEntitlements): {
  modelTier: string;
  sources: Array<{
    type: "personal" | "organization";
    sourceId: string;
    sourceLabel: string;
  }>;
} {
  return {
    modelTier: entitlements.modelTier,
    sources: entitlements.sources.map((source) => ({
      type: source.type,
      sourceId: source.sourceId,
      sourceLabel: source.sourceLabel,
    })),
  };
}

function formatRatio(current: number, max: number): string {
  return `${current}/${max}`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 10) / 10}%`;
}

/**
 * Check if a user can make a request based on their rate limits.
 */
export async function checkRateLimit(
  userId: string,
  subscriptionStatus?: string,
  userRole?: string,
  planId?: string | null,
  isGuest?: boolean,
): Promise<RateLimitResult> {
  const usage = await getDailyUsage(userId);
  const entitlements = await resolveEffectiveEntitlements({
    userId,
    subscriptionStatus,
    userRole,
    planId,
    isGuest,
  });

  const limits: RateLimits = {
    maxRequestsPerDay: entitlements.limits.maxRequestsPerDay,
    maxInputTokensPerDay: entitlements.limits.maxInputTokensPerDay,
    maxOutputTokensPerDay: entitlements.limits.maxOutputTokensPerDay,
    maxCostPerDay: entitlements.limits.maxCostPerDay,
    maxContextMessages: entitlements.limits.maxContextMessages,
  };

  // Determine effective plan ID for upgrade suggestions
  const effectivePlanId = getEffectivePlanId(
    subscriptionStatus,
    userRole,
    planId,
    isGuest,
  );

  const percentUsed = {
    requests: (usage.requestCount / limits.maxRequestsPerDay) * 100,
    inputTokens: (usage.inputTokens / limits.maxInputTokensPerDay) * 100,
    outputTokens: (usage.outputTokens / limits.maxOutputTokensPerDay) * 100,
    cost: (usage.totalCostUsd / limits.maxCostPerDay) * 100,
  };

  const usageSnapshot = {
    userId,
    effectivePlanId,
    subscriptionStatus: subscriptionStatus ?? null,
    userRole: userRole ?? null,
    isGuest: Boolean(isGuest),
    requests: formatRatio(usage.requestCount, limits.maxRequestsPerDay),
    inputTokens: formatRatio(usage.inputTokens, limits.maxInputTokensPerDay),
    outputTokens: formatRatio(usage.outputTokens, limits.maxOutputTokensPerDay),
    costUsd: `${usage.totalCostUsd.toFixed(6)}/${limits.maxCostPerDay}`,
    percentUsed: {
      requests: formatPercent(percentUsed.requests),
      inputTokens: formatPercent(percentUsed.inputTokens),
      outputTokens: formatPercent(percentUsed.outputTokens),
      cost: formatPercent(percentUsed.cost),
    },
    modelTier: entitlements.modelTier,
    sourceTypes: entitlements.sources.map((source) => source.type),
  };

  // Check all limits
  if (usage.requestCount >= limits.maxRequestsPerDay) {
    usageLogger.warn(
      "usage.limit.blocked",
      "Rate limit blocked by request cap",
      {
        ...usageSnapshot,
        reason: "Daily request limit reached",
      },
    );
    return {
      allowed: false,
      usage,
      limits,
      reason: "Daily request limit reached",
      percentUsed,
      upgradeInfo: getUpgradeInfo(effectivePlanId, "requests"),
      entitlements: buildEntitlementsPayload(entitlements),
      effectiveEntitlements: entitlements,
    };
  }

  if (usage.inputTokens >= limits.maxInputTokensPerDay) {
    usageLogger.warn(
      "usage.limit.blocked",
      "Rate limit blocked by input token cap",
      {
        ...usageSnapshot,
        reason: "Daily input token limit reached",
      },
    );
    return {
      allowed: false,
      usage,
      limits,
      reason: "Daily input token limit reached",
      percentUsed,
      upgradeInfo: getUpgradeInfo(effectivePlanId, "tokens"),
      entitlements: buildEntitlementsPayload(entitlements),
      effectiveEntitlements: entitlements,
    };
  }

  if (usage.outputTokens >= limits.maxOutputTokensPerDay) {
    usageLogger.warn(
      "usage.limit.blocked",
      "Rate limit blocked by output token cap",
      {
        ...usageSnapshot,
        reason: "Daily output token limit reached",
      },
    );
    return {
      allowed: false,
      usage,
      limits,
      reason: "Daily output token limit reached",
      percentUsed,
      upgradeInfo: getUpgradeInfo(effectivePlanId, "tokens"),
      entitlements: buildEntitlementsPayload(entitlements),
      effectiveEntitlements: entitlements,
    };
  }

  if (usage.totalCostUsd >= limits.maxCostPerDay) {
    usageLogger.warn(
      "usage.limit.blocked",
      "Rate limit blocked by daily cost",
      {
        ...usageSnapshot,
        reason: "Daily spending limit reached",
      },
    );
    return {
      allowed: false,
      usage,
      limits,
      reason: "Daily spending limit reached",
      percentUsed,
      upgradeInfo: getUpgradeInfo(effectivePlanId, "cost"),
      entitlements: buildEntitlementsPayload(entitlements),
      effectiveEntitlements: entitlements,
    };
  }

  usageLogger.info(
    "usage.limit.allowed",
    "Rate limit check allowed",
    usageSnapshot,
  );

  return {
    allowed: true,
    usage,
    limits,
    percentUsed,
    entitlements: buildEntitlementsPayload(entitlements),
    effectiveEntitlements: entitlements,
  };
}
