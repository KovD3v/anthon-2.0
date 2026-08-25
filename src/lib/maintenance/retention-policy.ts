import type { Subscription, User } from "@/generated/prisma/client";
import { resolveEffectiveEntitlements } from "@/lib/organizations/entitlements";
import { PlanResolutionError } from "@/lib/plans";
import { getAttachmentRetentionDaysForPlan } from "@/lib/rate-limit/config";

type UserWithSubscription = Pick<User, "id" | "role" | "isGuest"> & {
  subscription: Pick<Subscription, "status" | "planId"> | null;
};

const REGISTERED_NO_ACCESS_RETENTION_DAYS = 7;

/**
 * Determines data retention from personal or organization-funded access.
 * Registered accounts without current access keep the former seven-day window.
 */
export async function getRetentionParams(user: UserWithSubscription): Promise<{
  retentionDays: number;
}> {
  try {
    const entitlements = await resolveEffectiveEntitlements({
      userId: user.id,
      subscriptionStatus: user.subscription?.status,
      userRole: user.role,
      planId: user.subscription?.planId,
      isGuest: user.isGuest,
    });

    return {
      retentionDays: getAttachmentRetentionDaysForPlan(entitlements.plan),
    };
  } catch (error) {
    if (
      error instanceof PlanResolutionError &&
      error.reason === "PAID_ACCESS_REQUIRED"
    ) {
      return { retentionDays: REGISTERED_NO_ACCESS_RETENTION_DAYS };
    }
    throw error;
  }
}
