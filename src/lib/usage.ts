import { cache } from "react";
import type { UserRole } from "@/generated/prisma";
import { getFullUser } from "@/lib/auth";
import { resolveEffectiveEntitlements } from "@/lib/organizations/entitlements";
import { getDailyUsage } from "@/lib/rate-limit";

export const getSharedUsageData = cache(
  async (userId: string, userRole: UserRole) => {
    const fullUser = await getFullUser(userId);
    const subscriptionStatus = fullUser?.subscription?.status;
    const planId = fullUser?.subscription?.planId;

    const usage = await getDailyUsage(userId);
    const effectiveEntitlements = await resolveEffectiveEntitlements({
      userId,
      subscriptionStatus,
      userRole,
      planId,
      isGuest: fullUser?.isGuest,
    });

    const limits = {
      maxRequestsPerDay: effectiveEntitlements.limits.maxRequestsPerDay,
      maxInputTokensPerDay: effectiveEntitlements.limits.maxInputTokensPerDay,
      maxOutputTokensPerDay: effectiveEntitlements.limits.maxOutputTokensPerDay,
      maxCostPerDay: effectiveEntitlements.limits.maxCostPerDay,
      maxContextMessages: effectiveEntitlements.limits.maxContextMessages,
    };

    let tier: "TRIAL" | "ACTIVE" | "ADMIN" = "TRIAL";
    if (userRole === "ADMIN" || userRole === "SUPER_ADMIN") {
      tier = "ADMIN";
    } else if (subscriptionStatus === "ACTIVE") {
      tier = "ACTIVE";
    }

    return {
      usage: {
        requestCount: usage.requestCount,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalCostUsd: usage.totalCostUsd,
      },
      limits: {
        maxRequests: limits.maxRequestsPerDay,
        maxInputTokens: limits.maxInputTokensPerDay,
        maxOutputTokens: limits.maxOutputTokensPerDay,
        maxCostUsd: limits.maxCostPerDay,
      },
      tier,
      subscriptionStatus: subscriptionStatus ?? null,
      entitlements: {
        modelTier: effectiveEntitlements.modelTier,
        sources: effectiveEntitlements.sources.map((source) => ({
          type: source.type,
          sourceId: source.sourceId,
          sourceLabel: source.sourceLabel,
        })),
      },
    };
  },
);
