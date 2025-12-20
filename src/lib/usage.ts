import { cache } from "react";
import type { UserRole } from "@/generated/prisma";
import { getFullUser } from "@/lib/auth";
import { getDailyUsage, getRateLimitsForUser } from "@/lib/rate-limit";

export const getSharedUsageData = cache(
  async (userId: string, userRole: UserRole) => {
    const fullUser = await getFullUser(userId);
    const subscriptionStatus = fullUser?.subscription?.status;
    const planId = fullUser?.subscription?.planId;

    const usage = await getDailyUsage(userId);
    const limits = getRateLimitsForUser(
      subscriptionStatus ?? undefined,
      userRole,
      planId,
    );

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
    };
  },
);
