/**
 * Rate Limiting Module
 *
 * DB-based rate limiting using the DailyUsage table.
 * Tracks requests, tokens, and costs per user per day.
 */

import { prisma } from "@/lib/db";

// -----------------------------------------------------
// RATE LIMITS CONFIGURATION
// -----------------------------------------------------

export interface RateLimits {
  maxRequestsPerDay: number;
  maxInputTokensPerDay: number;
  maxOutputTokensPerDay: number;
  maxCostPerDay: number; // USD
}

// Default limits for different subscription tiers
export const RATE_LIMITS: Record<string, RateLimits> = {
  // Guest users (anonymous / pre-registration)
  // Intentionally stricter than TRIAL to mitigate abuse before identity verification.
  GUEST: {
    maxRequestsPerDay: 10,
    maxInputTokensPerDay: 20_000,
    maxOutputTokensPerDay: 10_000,
    maxCostPerDay: 0.05,
  },
  // Trial users (no active subscription)
  TRIAL: {
    maxRequestsPerDay: 50,
    maxInputTokensPerDay: 100_000,
    maxOutputTokensPerDay: 50_000,
    maxCostPerDay: 0.5,
  },
  // Basic plan ($7/month) - 3 day trial
  basic: {
    maxRequestsPerDay: 200,
    maxInputTokensPerDay: 500_000,
    maxOutputTokensPerDay: 250_000,
    maxCostPerDay: 3,
  },
  // Basic Plus plan ($12/month)
  basic_plus: {
    maxRequestsPerDay: 400,
    maxInputTokensPerDay: 800_000,
    maxOutputTokensPerDay: 400_000,
    maxCostPerDay: 5,
  },
  // Pro plan ($25/month)
  pro: {
    maxRequestsPerDay: 1000,
    maxInputTokensPerDay: 2_000_000,
    maxOutputTokensPerDay: 1_000_000,
    maxCostPerDay: 15,
  },
  // Active subscription (fallback for ACTIVE status without plan)
  ACTIVE: {
    maxRequestsPerDay: 200,
    maxInputTokensPerDay: 500_000,
    maxOutputTokensPerDay: 250_000,
    maxCostPerDay: 3,
  },
  // Admin / Unlimited
  ADMIN: {
    maxRequestsPerDay: Number.POSITIVE_INFINITY,
    maxInputTokensPerDay: Number.POSITIVE_INFINITY,
    maxOutputTokensPerDay: Number.POSITIVE_INFINITY,
    maxCostPerDay: Number.POSITIVE_INFINITY,
  },
};

// -----------------------------------------------------
// USAGE DATA
// -----------------------------------------------------

export interface DailyUsageData {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
}

/**
 * Get or create today's usage record for a user.
 */
export async function getDailyUsage(userId: string): Promise<DailyUsageData> {
  const today = getUTCDateOnly();

  const usage = await prisma.dailyUsage.findUnique({
    where: {
      userId_date: {
        userId,
        date: today,
      },
    },
  });

  if (!usage) {
    return {
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalCostUsd: 0,
    };
  }

  return {
    requestCount: usage.requestCount,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalCostUsd: usage.totalCostUsd,
  };
}

/**
 * Increment usage counters for a user.
 * Creates the record if it doesn't exist.
 */
export async function incrementUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
): Promise<DailyUsageData> {
  const today = getUTCDateOnly();

  const usage = await prisma.dailyUsage.upsert({
    where: {
      userId_date: {
        userId,
        date: today,
      },
    },
    create: {
      userId,
      date: today,
      requestCount: 1,
      inputTokens,
      outputTokens,
      totalCostUsd: costUsd,
    },
    update: {
      requestCount: { increment: 1 },
      inputTokens: { increment: inputTokens },
      outputTokens: { increment: outputTokens },
      totalCostUsd: { increment: costUsd },
    },
  });

  return {
    requestCount: usage.requestCount,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalCostUsd: usage.totalCostUsd,
  };
}

// -----------------------------------------------------
// RATE LIMIT CHECKING
// -----------------------------------------------------

export interface RateLimitResult {
  allowed: boolean;
  usage: DailyUsageData;
  limits: RateLimits;
  reason?: string;
  percentUsed: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
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
  const limits = getRateLimitsForUser(
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
    };
  }

  if (usage.inputTokens >= limits.maxInputTokensPerDay) {
    return {
      allowed: false,
      usage,
      limits,
      reason: "Daily input token limit reached",
      percentUsed,
    };
  }

  if (usage.outputTokens >= limits.maxOutputTokensPerDay) {
    return {
      allowed: false,
      usage,
      limits,
      reason: "Daily output token limit reached",
      percentUsed,
    };
  }

  if (usage.totalCostUsd >= limits.maxCostPerDay) {
    return {
      allowed: false,
      usage,
      limits,
      reason: "Daily spending limit reached",
      percentUsed,
    };
  }

  return {
    allowed: true,
    usage,
    limits,
    percentUsed,
  };
}

/**
 * Get rate limits based on subscription plan and user role.
 */
export function getRateLimitsForUser(
  subscriptionStatus?: string,
  userRole?: string,
  planId?: string | null,
  isGuest?: boolean,
): RateLimits {
  // Admin users have unlimited access
  if (userRole === "ADMIN" || userRole === "SUPER_ADMIN") {
    return RATE_LIMITS.ADMIN;
  }

  // Guest users (pre-registration)
  if (isGuest) {
    return RATE_LIMITS.GUEST;
  }

  // Check specific plan ID first (from Clerk)
  if (planId && subscriptionStatus === "ACTIVE") {
    const normalizedPlanId = planId.toLowerCase();
    if (normalizedPlanId.includes("pro")) {
      return RATE_LIMITS.pro;
    }
    if (normalizedPlanId.includes("basic_plus")) {
      return RATE_LIMITS.basic_plus;
    }
    if (normalizedPlanId.includes("basic")) {
      return RATE_LIMITS.basic;
    }
  }

  // Fallback to ACTIVE limits if subscription is active but no specific plan
  if (subscriptionStatus === "ACTIVE") {
    return RATE_LIMITS.ACTIVE;
  }

  // Default to trial limits
  return RATE_LIMITS.TRIAL;
}

// -----------------------------------------------------
// HELPERS
// -----------------------------------------------------

/**
 * Get today's date in UTC with time set to 00:00:00.
 */
function getUTCDateOnly(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Get remaining allowance for the day.
 */
export async function getRemainingAllowance(
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
export function formatRateLimitStatus(result: RateLimitResult): {
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
