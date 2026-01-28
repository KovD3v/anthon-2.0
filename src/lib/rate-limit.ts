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
  maxContextMessages: number; // Session message cap
}

// Default limits for different subscription tiers
const RATE_LIMITS: Record<string, RateLimits> = {
  // Guest users (anonymous / pre-registration)
  // Intentionally stricter than TRIAL to mitigate abuse before identity verification.
  GUEST: {
    maxRequestsPerDay: 10,
    maxInputTokensPerDay: 20_000,
    maxOutputTokensPerDay: 10_000,
    maxCostPerDay: 0.05,
    maxContextMessages: 5,
  },
  // Trial users (no active subscription)
  TRIAL: {
    maxRequestsPerDay: 3,
    maxInputTokensPerDay: 100_000,
    maxOutputTokensPerDay: 50_000,
    maxCostPerDay: 0.5,
    maxContextMessages: 10,
  },
  // Basic plan ($7/month) - 3 day trial
  basic: {
    maxRequestsPerDay: 50,
    maxInputTokensPerDay: 500_000,
    maxOutputTokensPerDay: 250_000,
    maxCostPerDay: 3,
    maxContextMessages: 15,
  },
  // Basic Plus plan ($12/month)
  basic_plus: {
    maxRequestsPerDay: 50,
    maxInputTokensPerDay: 800_000,
    maxOutputTokensPerDay: 400_000,
    maxCostPerDay: 5,
    maxContextMessages: 30,
  },
  // Pro plan ($25/month)
  pro: {
    maxRequestsPerDay: 100,
    maxInputTokensPerDay: 2_000_000,
    maxOutputTokensPerDay: 1_000_000,
    maxCostPerDay: 15,
    maxContextMessages: 100,
  },
  // Active subscription (fallback for ACTIVE status without plan)
  ACTIVE: {
    maxRequestsPerDay: 50,
    maxInputTokensPerDay: 500_000,
    maxOutputTokensPerDay: 250_000,
    maxCostPerDay: 3,
    maxContextMessages: 15,
  },
  // Admin / Unlimited
  ADMIN: {
    maxRequestsPerDay: Number.POSITIVE_INFINITY,
    maxInputTokensPerDay: Number.POSITIVE_INFINITY,
    maxOutputTokensPerDay: Number.POSITIVE_INFINITY,
    maxCostPerDay: Number.POSITIVE_INFINITY,
    maxContextMessages: 100,
  },
};

// -----------------------------------------------------
// ATTACHMENT RETENTION CONFIGURATION
// -----------------------------------------------------

/**
 * Attachment retention days per subscription tier.
 * After this period, attachments may be deleted to save storage.
 */
export const ATTACHMENT_RETENTION_DAYS: Record<string, number> = {
  GUEST: 1, // 1 day for guests
  TRIAL: 7, // 7 days for trial users
  basic: 30, // 30 days for basic plan
  basic_plus: 60, // 60 days for basic+ plan
  pro: 180, // 6 months for pro plan
  ACTIVE: 30, // 30 days fallback
  ADMIN: 365 * 10, // 10 years for admins (effectively forever)
};

/**
 * Get attachment retention days based on subscription plan and user role.
 */
function _getAttachmentRetentionDays(
  subscriptionStatus?: string,
  userRole?: string,
  planId?: string | null,
  isGuest?: boolean,
): number {
  // Admin users keep files for a long time
  if (userRole === "ADMIN" || userRole === "SUPER_ADMIN") {
    return ATTACHMENT_RETENTION_DAYS.ADMIN;
  }

  // Guest users
  if (isGuest) {
    return ATTACHMENT_RETENTION_DAYS.GUEST;
  }

  // Check specific plan ID first
  if (planId && subscriptionStatus === "ACTIVE") {
    const normalizedPlanId = planId.toLowerCase();
    if (normalizedPlanId.includes("pro")) {
      return ATTACHMENT_RETENTION_DAYS.pro;
    }
    if (normalizedPlanId.includes("basic_plus")) {
      return ATTACHMENT_RETENTION_DAYS.basic_plus;
    }
    if (normalizedPlanId.includes("basic")) {
      return ATTACHMENT_RETENTION_DAYS.basic;
    }
  }

  // Fallback to ACTIVE if subscription is active but no specific plan
  if (subscriptionStatus === "ACTIVE") {
    return ATTACHMENT_RETENTION_DAYS.ACTIVE;
  }

  // Default to trial retention
  return ATTACHMENT_RETENTION_DAYS.TRIAL;
}

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

// -----------------------------------------------------
// UPGRADE CTA CONFIGURATION
// -----------------------------------------------------

export interface UpgradeInfo {
  currentPlan: string;
  suggestedPlan: string;
  upgradeUrl: string;
  ctaMessage: string;
}

// Plan hierarchy for upgrades
const PLAN_HIERARCHY = [
  "GUEST",
  "TRIAL",
  "basic",
  "basic_plus",
  "pro",
] as const;
type PlanTier = (typeof PLAN_HIERARCHY)[number];

/**
 * Get upgrade information based on current plan and which limit was hit.
 * Returns null for pro/ADMIN plans (no upgrade available).
 */
export function getUpgradeInfo(
  currentPlan: string,
  limitType: "requests" | "tokens" | "cost" | "general",
): UpgradeInfo | null {
  // Normalize plan name
  const normalizedPlan = currentPlan.toUpperCase();

  // No upgrade available for pro or admin plans
  if (
    normalizedPlan === "PRO" ||
    normalizedPlan === "ADMIN" ||
    normalizedPlan === "SUPER_ADMIN"
  ) {
    return null;
  }

  // Determine current tier and next tier
  let currentTier: PlanTier;
  let nextTier: PlanTier;

  if (normalizedPlan === "GUEST") {
    currentTier = "GUEST";
    nextTier = "basic";
  } else if (normalizedPlan === "TRIAL") {
    currentTier = "TRIAL";
    nextTier = "basic";
  } else if (normalizedPlan.includes("BASIC_PLUS")) {
    currentTier = "basic_plus";
    nextTier = "pro";
  } else if (normalizedPlan.includes("BASIC")) {
    currentTier = "basic";
    nextTier = "basic_plus";
  } else {
    // Default fallback - treat as trial
    currentTier = "TRIAL";
    nextTier = "basic";
  }

  // Get plan display names
  const planDisplayNames: Record<string, string> = {
    GUEST: "Ospite",
    TRIAL: "Prova",
    basic: "Basic",
    basic_plus: "Basic Plus",
    pro: "Pro",
  };

  // Generate contextual CTA message based on limit type
  let ctaMessage = "";
  switch (limitType) {
    case "requests":
      ctaMessage = `Hai raggiunto il limite giornaliero di richieste per il piano ${planDisplayNames[currentTier]}. Passa a ${planDisplayNames[nextTier]} per continuare a utilizzare Anthon senza interruzioni.`;
      break;
    case "tokens":
      ctaMessage = `Hai esaurito i token disponibili per oggi con il piano ${planDisplayNames[currentTier]}. Aggiorna a ${planDisplayNames[nextTier]} per ottenere più token giornalieri.`;
      break;
    case "cost":
      ctaMessage = `Hai raggiunto il limite di spesa giornaliero del piano ${planDisplayNames[currentTier]}. Passa a ${planDisplayNames[nextTier]} per aumentare il tuo budget giornaliero.`;
      break;
    default:
      ctaMessage = `Hai raggiunto un limite del tuo piano ${planDisplayNames[currentTier]}. Aggiorna a ${planDisplayNames[nextTier]} per sbloccare funzionalità aggiuntive e limiti più elevati.`;
  }

  return {
    currentPlan: planDisplayNames[currentTier],
    suggestedPlan: planDisplayNames[nextTier],
    upgradeUrl: "/pricing",
    ctaMessage,
  };
}

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
  upgradeInfo?: UpgradeInfo | null;
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
 * Get the effective plan ID for upgrade suggestions.
 */
function getEffectivePlanId(
  subscriptionStatus?: string,
  userRole?: string,
  planId?: string | null,
  isGuest?: boolean,
): string {
  // Admin users
  if (userRole === "ADMIN" || userRole === "SUPER_ADMIN") {
    return "ADMIN";
  }

  // Guest users
  if (isGuest) {
    return "GUEST";
  }

  // Check specific plan ID first
  if (planId && subscriptionStatus === "ACTIVE") {
    const normalizedPlanId = planId.toLowerCase();
    if (normalizedPlanId.includes("pro")) {
      return "pro";
    }
    if (normalizedPlanId.includes("basic_plus")) {
      return "basic_plus";
    }
    if (normalizedPlanId.includes("basic")) {
      return "basic";
    }
  }

  // Fallback to ACTIVE
  if (subscriptionStatus === "ACTIVE") {
    return "ACTIVE";
  }

  // Default to trial
  return "TRIAL";
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
