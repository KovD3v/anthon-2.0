/**
 * Rate Limit Module — limit checking logic.
 */

import { resolveEffectiveEntitlements } from "@/lib/organizations/entitlements";
import type { EffectiveEntitlements } from "@/lib/organizations/types";
import { getEffectivePlanId, getRateLimitsForUser } from "./config";
import type { RateLimitResult, RateLimits } from "./types";
import { getUpgradeInfo } from "./upgrade";
import { getDailyUsage } from "./usage";

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

  // Check all limits
  if (usage.requestCount >= limits.maxRequestsPerDay) {
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

  return {
    allowed: true,
    usage,
    limits,
    percentUsed,
    entitlements: buildEntitlementsPayload(entitlements),
    effectiveEntitlements: entitlements,
  };
}

/**
 * Get remaining allowance for the day.
 */
async function _getRemainingAllowance(
  userId: string,
  subscriptionStatus?: string,
  userRole?: string,
): Promise<{
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}> {
  const usage = await getDailyUsage(userId);
  const limits = getRateLimitsForUser(subscriptionStatus, userRole);

  return {
    requests: Math.max(0, limits.maxRequestsPerDay - usage.requestCount),
    inputTokens: Math.max(0, limits.maxInputTokensPerDay - usage.inputTokens),
    outputTokens: Math.max(
      0,
      limits.maxOutputTokensPerDay - usage.outputTokens,
    ),
    costUsd: Math.max(0, limits.maxCostPerDay - usage.totalCostUsd),
  };
}

/**
 * Format rate limit info for display in UI.
 */
function _formatRateLimitStatus(result: RateLimitResult): {
  status: "ok" | "warning" | "limit-reached";
  message: string;
  percentUsed: number;
} {
  const maxPercent = Math.max(
    result.percentUsed.requests,
    result.percentUsed.inputTokens,
    result.percentUsed.outputTokens,
    result.percentUsed.cost,
  );

  if (!result.allowed) {
    return {
      status: "limit-reached",
      message: result.reason ?? "Daily limit reached",
      percentUsed: 100,
    };
  }

  if (maxPercent >= 80) {
    return {
      status: "warning",
      message: `${Math.round(100 - maxPercent)}% of daily limit remaining`,
      percentUsed: maxPercent,
    };
  }

  return {
    status: "ok",
    message: `${Math.round(100 - maxPercent)}% of daily limit remaining`,
    percentUsed: maxPercent,
  };
}
