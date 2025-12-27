import type { Subscription, User } from "@/generated/prisma/client";

// Retention days configuration matching implementation plan
const RETENTION_DAYS = {
  GUEST: 7, // Free/Guest
  TRIAL: 7, // Free/Trial
  BASIC: 14, // Basic Plan
  PRO: 30, // Pro Plan
  ADMIN: 90, // Admin/Internal
};

type UserWithSubscription = User & {
  subscription: Subscription | null;
};

/**
 * Determines the data retention period (in days) for a user based on their subscription.
 */
export function getRetentionParams(user: UserWithSubscription): {
  retentionDays: number;
} {
  // Admin / Limitless
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
    return { retentionDays: RETENTION_DAYS.ADMIN };
  }

  // Guest users - Strict policy
  if (user.isGuest) {
    return { retentionDays: RETENTION_DAYS.GUEST };
  }

  // Active Subscription Logic
  if (user.subscription?.status === "ACTIVE" && user.subscription.planId) {
    const planId = user.subscription.planId.toLowerCase();

    if (planId.includes("pro")) {
      return { retentionDays: RETENTION_DAYS.PRO };
    }
    if (planId.includes("basic")) {
      return { retentionDays: RETENTION_DAYS.BASIC };
    }
  }

  // Default / Trial
  return { retentionDays: RETENTION_DAYS.TRIAL };
}
