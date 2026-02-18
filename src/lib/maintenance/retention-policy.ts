import type { Subscription, User } from "@/generated/prisma/client";
import { getAttachmentRetentionDays } from "@/lib/rate-limit/config";

type UserWithSubscription = User & {
  subscription: Subscription | null;
};

/**
 * Determines the data retention period (in days) for a user based on their subscription.
 */
export function getRetentionParams(user: UserWithSubscription): {
  retentionDays: number;
} {
  return {
    retentionDays: getAttachmentRetentionDays(
      user.subscription?.status ?? undefined,
      user.role ?? undefined,
      user.subscription?.planId ?? undefined,
      user.isGuest,
    ),
  };
}
