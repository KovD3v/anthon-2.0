/**
 * Clerk webhook handlers for subscription events.
 */

import type { SubscriptionStatus } from "@/generated/prisma";
import { trackFunnelUpgrade } from "@/lib/analytics/funnel";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import type { SubscriptionData } from "./types";

const webhookLogger = createLogger("webhook");

/**
 * Map Clerk subscription status to our SubscriptionStatus enum.
 */
function mapClerkStatus(clerkStatus: string): SubscriptionStatus {
  switch (clerkStatus.toLowerCase()) {
    case "trialing":
    case "trial":
      return "TRIAL";
    case "active":
      return "ACTIVE";
    case "canceled":
    case "cancelled":
      return "CANCELED";
    case "past_due":
      return "PAST_DUE";
    case "expired":
    case "unpaid":
      return "EXPIRED";
    default:
      webhookLogger.warn(
        "webhook.subscription.status_unknown",
        "Unknown Clerk subscription status, defaulting to TRIAL",
        {
          clerkStatus,
        },
      );
      return "TRIAL";
  }
}

/**
 * Handle subscription.created event.
 * Creates a subscription record and marks trial start.
 */
export async function handleSubscriptionCreated(data: SubscriptionData) {
  const clerkUserId = data.user_id;
  const clerkSubscriptionId = data.id;

  webhookLogger.info(
    "webhook.subscription.created.received",
    "Subscription created event received",
    { clerkUserId, clerkSubscriptionId },
  );

  // Find our internal user
  const user = await prisma.user.findUnique({
    where: { clerkId: clerkUserId },
  });

  if (!user) {
    webhookLogger.error(
      "webhook.subscription.created.user_missing",
      "User not found for subscription.created event",
      { clerkUserId, clerkSubscriptionId },
    );
    return;
  }

  // Map Clerk status to our status
  const status = mapClerkStatus(data.status);
  const now = new Date();

  // Calculate trial end date if in trial
  let trialEndsAt: Date | undefined;
  if (status === "TRIAL" && data.trial_period_days) {
    trialEndsAt = new Date(
      now.getTime() + data.trial_period_days * 24 * 60 * 60 * 1000,
    );
  }

  // Create or update subscription
  await prisma.subscription.upsert({
    where: { userId: user.id },
    update: {
      clerkSubscriptionId,
      status,
      planId: data.plan_id,
      planName: data.plan_name,
      trialStartedAt: status === "TRIAL" ? now : undefined,
      trialEndsAt,
      convertedAt: status === "ACTIVE" ? now : undefined,
    },
    create: {
      userId: user.id,
      clerkSubscriptionId,
      status,
      planId: data.plan_id,
      planName: data.plan_name,
      trialStartedAt: status === "TRIAL" ? now : undefined,
      trialEndsAt,
      convertedAt: status === "ACTIVE" ? now : undefined,
    },
  });

  webhookLogger.info(
    "auth.subscription_transition",
    "Subscription transition applied from subscription.created",
    {
      userId: user.id,
      previousStatus: null,
      newStatus: status,
      clerkSubscriptionId,
      planId: data.plan_id,
    },
  );

  if (status === "ACTIVE") {
    trackFunnelUpgrade({
      userId: user.id,
      isGuest: user.isGuest,
      userRole: user.role,
      channel: "WEB",
      planId: data.plan_id,
      planName: data.plan_name,
      subscriptionStatus: status,
    });
  }
}

/**
 * Handle subscription.updated event.
 * Updates status and tracks conversions/cancellations.
 */
export async function handleSubscriptionUpdated(data: SubscriptionData) {
  const clerkSubscriptionId = data.id;

  webhookLogger.info(
    "webhook.subscription.updated.received",
    "Subscription updated event received",
    { clerkSubscriptionId },
  );

  // Find subscription by Clerk ID
  const subscription = await prisma.subscription.findUnique({
    where: { clerkSubscriptionId },
  });

  if (!subscription) {
    webhookLogger.error(
      "webhook.subscription.updated.missing",
      "Subscription not found for update event",
      { clerkSubscriptionId },
    );
    return;
  }

  const newStatus = mapClerkStatus(data.status);
  const now = new Date();

  // Track status transitions
  const updateData: {
    status: SubscriptionStatus;
    planId?: string;
    planName?: string;
    convertedAt?: Date;
    canceledAt?: Date;
  } = {
    status: newStatus,
    planId: data.plan_id,
    planName: data.plan_name,
  };

  // Trial → Active = Conversion
  if (subscription.status === "TRIAL" && newStatus === "ACTIVE") {
    updateData.convertedAt = now;
    webhookLogger.info(
      "auth.subscription_transition",
      "User converted from trial",
      {
        userId: subscription.userId,
        previousStatus: subscription.status,
        newStatus,
        clerkSubscriptionId,
      },
    );

    const user = await prisma.user.findUnique({
      where: { id: subscription.userId },
      select: { id: true, role: true, isGuest: true },
    });

    if (user) {
      trackFunnelUpgrade({
        userId: user.id,
        isGuest: user.isGuest,
        userRole: user.role,
        channel: "WEB",
        planId: data.plan_id,
        planName: data.plan_name,
        subscriptionStatus: newStatus,
      });
    }
  }

  // Any → Canceled = Cancellation
  if (newStatus === "CANCELED" && subscription.status !== "CANCELED") {
    updateData.canceledAt = now;
    webhookLogger.info(
      "auth.subscription_transition",
      "User canceled subscription",
      {
        userId: subscription.userId,
        previousStatus: subscription.status,
        newStatus,
        clerkSubscriptionId,
      },
    );
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: updateData,
  });

  webhookLogger.info(
    "auth.subscription_transition",
    "Subscription status updated",
    {
      userId: subscription.userId,
      previousStatus: subscription.status,
      newStatus,
      clerkSubscriptionId,
      planId: data.plan_id,
    },
  );
}

/**
 * Handle subscription.deleted event.
 * Marks the subscription as expired.
 */
export async function handleSubscriptionDeleted(data: SubscriptionData) {
  const clerkSubscriptionId = data.id;

  webhookLogger.info(
    "webhook.subscription.deleted.received",
    "Subscription deleted event received",
    { clerkSubscriptionId },
  );

  const subscription = await prisma.subscription.findUnique({
    where: { clerkSubscriptionId },
  });

  if (!subscription) {
    webhookLogger.error(
      "webhook.subscription.deleted.missing",
      "Subscription not found for delete event",
      { clerkSubscriptionId },
    );
    return;
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: "EXPIRED",
      canceledAt: new Date(),
    },
  });

  webhookLogger.info(
    "auth.subscription_transition",
    "Subscription marked as expired",
    {
      userId: subscription.userId,
      previousStatus: subscription.status,
      newStatus: "EXPIRED",
      clerkSubscriptionId,
    },
  );
}
