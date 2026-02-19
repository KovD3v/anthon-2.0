import { clerkClient } from "@clerk/nextjs/server";
import type { SubscriptionStatus } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { type CanonicalPlan, parseCanonicalPlanFromPlanId } from "@/lib/plans";

const billingLogger = createLogger("usage");
export const BILLING_SYNC_COOLDOWN_MS = 5 * 60 * 1000;

interface CurrentSubscriptionState {
  status?: SubscriptionStatus | null;
  planId?: string | null;
}

interface ClerkSubscriptionItem {
  id?: string | null;
  status?: string | null;
  isFreeTrial?: boolean | null;
  planId?: string | null;
  plan?: {
    id?: string | null;
    slug?: string | null;
    name?: string | null;
  } | null;
  nextPayment?: {
    date?: string | number | Date | null;
  } | null;
}

interface RankedSubscriptionItem {
  item: ClerkSubscriptionItem;
  planId: string;
  canonicalPlan: CanonicalPlan;
  lifecyclePriority: number;
  planPriority: number;
}

export function isBillingSyncStale(billingSyncedAt?: Date | null): boolean {
  if (!billingSyncedAt) {
    return true;
  }
  return Date.now() - billingSyncedAt.getTime() > BILLING_SYNC_COOLDOWN_MS;
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as {
    status?: number;
    statusCode?: number;
    errors?: Array<{ code?: string }>;
  };

  if (maybeError.status === 404 || maybeError.statusCode === 404) {
    return true;
  }

  return Array.isArray(maybeError.errors)
    ? maybeError.errors.some((entry) => entry.code === "resource_not_found")
    : false;
}

function resolveRecognizedPlan(item: ClerkSubscriptionItem): {
  planId: string;
  canonicalPlan: CanonicalPlan;
} | null {
  const candidates = [item.planId, item.plan?.slug, item.plan?.id];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const parsedPlan = parseCanonicalPlanFromPlanId(candidate);
    if (parsedPlan) {
      return {
        planId: candidate,
        canonicalPlan: parsedPlan,
      };
    }
  }

  return null;
}

function getLifecyclePriority(item: ClerkSubscriptionItem): number {
  if (item.isFreeTrial) {
    return 2;
  }

  const normalizedStatus = (item.status ?? "").toLowerCase();
  if (normalizedStatus === "active" || normalizedStatus === "upcoming") {
    return 3;
  }
  return 1;
}

function getPlanPriority(plan: CanonicalPlan): number {
  switch (plan) {
    case "PRO":
      return 3;
    case "BASIC_PLUS":
      return 2;
    case "BASIC":
      return 1;
    default:
      return 0;
  }
}

function selectBestSubscriptionItem(
  items: ClerkSubscriptionItem[],
): RankedSubscriptionItem | null {
  const rankedItems: RankedSubscriptionItem[] = [];

  for (const item of items) {
    const recognizedPlan = resolveRecognizedPlan(item);
    if (!recognizedPlan) {
      continue;
    }

    rankedItems.push({
      item,
      planId: recognizedPlan.planId,
      canonicalPlan: recognizedPlan.canonicalPlan,
      lifecyclePriority: getLifecyclePriority(item),
      planPriority: getPlanPriority(recognizedPlan.canonicalPlan),
    });
  }

  if (rankedItems.length === 0) {
    return null;
  }

  rankedItems.sort((left, right) => {
    if (left.lifecyclePriority !== right.lifecyclePriority) {
      return right.lifecyclePriority - left.lifecyclePriority;
    }
    if (left.planPriority !== right.planPriority) {
      return right.planPriority - left.planPriority;
    }

    const leftId = left.item.id ?? "";
    const rightId = right.item.id ?? "";
    return leftId.localeCompare(rightId);
  });

  return rankedItems[0];
}

function mapBillingStatus(
  billingStatus: string | null | undefined,
  isFreeTrial: boolean,
): SubscriptionStatus {
  if (isFreeTrial) {
    return "TRIAL";
  }

  switch ((billingStatus ?? "").toLowerCase()) {
    case "active":
    case "upcoming":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
    case "ended":
      return "CANCELED";
    case "abandoned":
    case "incomplete":
    case "expired":
      return "EXPIRED";
    default:
      billingLogger.warn(
        "billing.unknown_status",
        "Unrecognized Clerk billing status",
        {
          billingStatus: billingStatus ?? null,
        },
      );
      return "EXPIRED";
  }
}

async function markBillingSyncedAt(userId: string, now: Date): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      billingSyncedAt: now,
    },
  });
}

async function clearLocalSubscriptionState(userId: string): Promise<void> {
  await prisma.subscription.updateMany({
    where: { userId },
    data: {
      status: "EXPIRED",
      clerkSubscriptionId: null,
      planId: null,
      planName: null,
      trialEndsAt: null,
      canceledAt: new Date(),
    },
  });
}

export async function syncPersonalSubscriptionFromClerk(params: {
  userId: string;
  clerkUserId: string;
  current?: CurrentSubscriptionState | null;
}): Promise<CurrentSubscriptionState | null> {
  const { userId, clerkUserId, current } = params;
  const syncAttemptedAt = new Date();

  try {
    const client = await clerkClient();
    const billingSubscription =
      await client.billing.getUserBillingSubscription(clerkUserId);

    const selectedItem = selectBestSubscriptionItem(
      Array.isArray(billingSubscription.subscriptionItems)
        ? billingSubscription.subscriptionItems
        : [],
    );

    if (!selectedItem) {
      return current ?? null;
    }

    const planId = selectedItem.planId;

    const nextStatus = mapBillingStatus(
      selectedItem.item.status,
      Boolean(selectedItem.item.isFreeTrial),
    );
    const now = new Date();
    const trialEndsAt =
      selectedItem.item.isFreeTrial && selectedItem.item.nextPayment?.date
        ? new Date(selectedItem.item.nextPayment.date)
        : null;

    await prisma.subscription.upsert({
      where: { userId },
      update: {
        status: nextStatus,
        clerkSubscriptionId: billingSubscription.id,
        planId,
        planName: selectedItem.item.plan?.name ?? null,
        trialStartedAt:
          nextStatus === "TRIAL"
            ? current?.status === "TRIAL"
              ? undefined
              : now
            : null,
        trialEndsAt: nextStatus === "TRIAL" ? trialEndsAt : null,
        convertedAt:
          nextStatus === "ACTIVE" && current?.status === "TRIAL"
            ? now
            : undefined,
      },
      create: {
        userId,
        status: nextStatus,
        clerkSubscriptionId: billingSubscription.id,
        planId,
        planName: selectedItem.item.plan?.name ?? null,
        trialStartedAt: nextStatus === "TRIAL" ? now : null,
        trialEndsAt: nextStatus === "TRIAL" ? trialEndsAt : null,
        convertedAt: nextStatus === "ACTIVE" ? now : null,
      },
    });

    return {
      status: nextStatus,
      planId,
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      const hasKnownSubscriptionState = Boolean(current?.status || current?.planId);

      if (!hasKnownSubscriptionState) {
        return null;
      }

      try {
        await clearLocalSubscriptionState(userId);
      } catch (clearError) {
        billingLogger.warn(
          "billing.subscription.clear_failed",
          "Failed clearing stale local subscription state after Clerk 404",
          {
            error: clearError,
            userId,
            clerkUserId,
          },
        );
        return current ?? null;
      }

      return {
        status: "EXPIRED",
        planId: null,
      };
    }

    billingLogger.warn(
      "billing.subscription.sync_failed",
      "Failed syncing personal subscription from Clerk",
      {
        error,
        userId,
        clerkUserId,
      },
    );

    return current ?? null;
  } finally {
    try {
      await markBillingSyncedAt(userId, syncAttemptedAt);
    } catch (error) {
      billingLogger.warn(
        "billing.sync_timestamp_update_failed",
        "Failed updating billing sync timestamp",
        {
          error,
          userId,
        },
      );
    }
  }
}
