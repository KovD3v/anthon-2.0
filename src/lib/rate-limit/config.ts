/**
 * Rate Limit Module — plan configuration and retention settings.
 */

import {
  type CanonicalPlan,
  PLAN_CATALOG,
  resolvePlanSnapshot,
} from "@/lib/plans";
import type { RateLimits } from "./types";

export const ATTACHMENT_RETENTION_DAYS: Record<CanonicalPlan, number> = {
  GUEST: PLAN_CATALOG.GUEST.attachmentRetentionDays,
  TRIAL: PLAN_CATALOG.TRIAL.attachmentRetentionDays,
  BASIC: PLAN_CATALOG.BASIC.attachmentRetentionDays,
  BASIC_PLUS: PLAN_CATALOG.BASIC_PLUS.attachmentRetentionDays,
  PRO: PLAN_CATALOG.PRO.attachmentRetentionDays,
  ADMIN: PLAN_CATALOG.ADMIN.attachmentRetentionDays,
};

function resolveSnapshot(
  subscriptionStatus?: string,
  userRole?: string,
  planId?: string | null,
  isGuest?: boolean,
) {
  return resolvePlanSnapshot({
    subscriptionStatus,
    userRole,
    planId,
    isGuest,
  });
}

/**
 * Get attachment retention days based on resolved policies.
 */
export function getAttachmentRetentionDays(
  subscriptionStatus?: string,
  userRole?: string,
  planId?: string | null,
  isGuest?: boolean,
): number {
  return resolveSnapshot(subscriptionStatus, userRole, planId, isGuest).policies
    .attachmentRetentionDays;
}

/**
 * Get the canonical effective personal plan ID for upgrade suggestions.
 */
export function getEffectivePlanId(
  subscriptionStatus?: string,
  userRole?: string,
  planId?: string | null,
  isGuest?: boolean,
): CanonicalPlan {
  return resolveSnapshot(subscriptionStatus, userRole, planId, isGuest)
    .personalPlan;
}

/**
 * Get rate limits based on resolved effective entitlements.
 */
export function getRateLimitsForUser(
  subscriptionStatus?: string,
  userRole?: string,
  planId?: string | null,
  isGuest?: boolean,
): RateLimits {
  return resolveSnapshot(subscriptionStatus, userRole, planId, isGuest)
    .effective.limits;
}
