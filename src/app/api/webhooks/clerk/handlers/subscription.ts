/**
 * Clerk webhook handlers for subscription events.
 */

import type { SubscriptionStatus } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import type { SubscriptionData } from "./types";

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
      console.warn(
        `[Webhook] Unknown Clerk status: ${clerkStatus}, defaulting to TRIAL`,
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

  console.log(`[Webhook] Subscription created for user: ${clerkUserId}`);

  // Find our internal user
  const user = await prisma.user.findUnique({
    where: { clerkId: clerkUserId },
  });

  if (!user) {
    console.error(`[Webhook] User not found for clerkId: ${clerkUserId}`);
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

  console.log(
    `[Webhook] Subscription record created/updated for user: ${user.id}`,
  );
}

/**
 * Handle subscription.updated event.
 * Updates status and tracks conversions/cancellations.
 */
export async function handleSubscriptionUpdated(data: SubscriptionData) {
  const clerkSubscriptionId = data.id;

  console.log(`[Webhook] Subscription updated: ${clerkSubscriptionId}`);

  // Find subscription by Clerk ID
  const subscription = await prisma.subscription.findUnique({
    where: { clerkSubscriptionId },
  });

  if (!subscription) {
    console.error(`[Webhook] Subscription not found: ${clerkSubscriptionId}`);
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
    console.log(`[Webhook] User converted from trial: ${subscription.userId}`);
  }

  // Any → Canceled = Cancellation
  if (newStatus === "CANCELED" && subscription.status !== "CANCELED") {
    updateData.canceledAt = now;
    console.log(`[Webhook] User canceled subscription: ${subscription.userId}`);
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: updateData,
  });
}

/**
 * Handle subscription.deleted event.
 * Marks the subscription as expired.
 */
export async function handleSubscriptionDeleted(data: SubscriptionData) {
  const clerkSubscriptionId = data.id;

  console.log(`[Webhook] Subscription deleted: ${clerkSubscriptionId}`);

  const subscription = await prisma.subscription.findUnique({
    where: { clerkSubscriptionId },
  });

  if (!subscription) {
    console.error(`[Webhook] Subscription not found: ${clerkSubscriptionId}`);
    return;
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: "EXPIRED",
      canceledAt: new Date(),
    },
  });

  console.log(
    `[Webhook] Subscription marked as expired: ${subscription.userId}`,
  );
}
