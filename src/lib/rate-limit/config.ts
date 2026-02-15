/**
 * Rate Limit Module — plan configuration and retention settings.
 */

import {
  PERSONAL_PLAN_LIMITS,
  type PersonalPlanKey,
} from "@/lib/limits/personal-limits";
import type { RateLimits } from "./types";

// Keep a local alias for backward compatibility with existing rate-limit helpers.
const RATE_LIMITS: Record<PersonalPlanKey, RateLimits> = PERSONAL_PLAN_LIMITS;

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
// PLAN RESOLUTION
// -----------------------------------------------------

/**
 * Get the effective plan ID for upgrade suggestions.
 */
export function getEffectivePlanId(
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
