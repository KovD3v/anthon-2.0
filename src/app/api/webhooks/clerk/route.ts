/**
 * Clerk Webhook Handler
 * Handles user profile sync and subscription events from Clerk Billing for funnel tracking.
 *
 * ⚠️ SETUP REQUIRED:
 * 1. Go to Clerk Dashboard → Webhooks
 * 2. Create a new webhook endpoint pointing to: https://your-domain.com/api/webhooks/clerk
 * 3. Select events: user.created, user.updated, subscription.created, subscription.updated, subscription.deleted
 * 4. Copy the Signing Secret and add to .env as CLERK_WEBHOOK_SECRET
 */

import { headers } from "next/headers";
import { Webhook } from "svix";
import type { SubscriptionStatus } from "@/generated/prisma";
import { prisma } from "@/lib/db";

// Clerk webhook event types
interface WebhookEvent {
  type: string;
  data: Record<string, unknown>;
}

interface UserCreatedData {
  id: string;
  email_addresses?: Array<{ email_address: string }>;
  first_name?: string | null;
  last_name?: string | null;
}

interface SubscriptionData {
  id: string;
  user_id: string;
  status: string;
  plan_id?: string;
  plan_name?: string;
  trial_period_days?: number;
  current_period_start?: number;
  current_period_end?: number;
}

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error("[Webhook] CLERK_WEBHOOK_SECRET not configured");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  // Get the headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  // Get the body
  const payload = await req.text();

  // Verify the webhook signature
  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(payload, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("[Webhook] Signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  // Handle the event
  const eventType = evt.type;
  console.log(`[Webhook] Received event: ${eventType}`);

  try {
    switch (eventType) {
      case "user.created":
        await handleUserCreated(evt.data as unknown as UserCreatedData);
        break;

      case "user.updated":
        await handleUserUpdated(evt.data as unknown as UserCreatedData);
        break;

      case "subscription.created":
        await handleSubscriptionCreated(
          evt.data as unknown as SubscriptionData,
        );
        break;

      case "subscription.updated":
        await handleSubscriptionUpdated(
          evt.data as unknown as SubscriptionData,
        );
        break;

      case "subscription.deleted":
        await handleSubscriptionDeleted(
          evt.data as unknown as SubscriptionData,
        );
        break;

      default:
        console.log(`[Webhook] Unhandled event type: ${eventType}`);
    }

    return new Response("Webhook processed", { status: 200 });
  } catch (error) {
    console.error(`[Webhook] Error processing ${eventType}:`, error);
    return new Response("Webhook processing error", { status: 500 });
  }
}

/**
 * Handle user.created event
 * Creates the user in our database if not exists
 */
async function handleUserCreated(data: UserCreatedData) {
  const clerkId = data.id;
  const email = data.email_addresses?.[0]?.email_address;
  const firstName = data.first_name;
  const lastName = data.last_name;

  console.log(`[Webhook] User created: ${clerkId}`);

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { clerkId },
  });

  if (!existingUser) {
    // Create user
    const user = await prisma.user.create({
      data: {
        clerkId,
        email,
      },
    });
    console.log(`[Webhook] Created user in database: ${clerkId}`);

    // Create profile with name if available
    if (firstName || lastName) {
      const fullName = [firstName, lastName].filter(Boolean).join(" ");
      await prisma.profile.create({
        data: {
          userId: user.id,
          name: fullName,
        },
      });
      console.log(`[Webhook] Created profile with name: ${fullName}`);
    }
  }
}

/**
 * Handle user.updated event
 * Updates user profile with name changes from Clerk
 */
async function handleUserUpdated(data: UserCreatedData) {
  const clerkId = data.id;
  const firstName = data.first_name;
  const lastName = data.last_name;

  console.log(`[Webhook] User updated: ${clerkId}`);

  // Find user
  const user = await prisma.user.findUnique({
    where: { clerkId },
    include: { profile: true },
  });

  if (!user) {
    console.error(`[Webhook] User not found: ${clerkId}`);
    return;
  }

  // Update profile with name if available
  if (firstName || lastName) {
    const fullName = [firstName, lastName].filter(Boolean).join(" ");

    if (user.profile) {
      await prisma.profile.update({
        where: { userId: user.id },
        data: { name: fullName },
      });
    } else {
      await prisma.profile.create({
        data: {
          userId: user.id,
          name: fullName,
        },
      });
    }
    console.log(`[Webhook] Updated profile name: ${fullName}`);
  }
}

/**
 * Handle subscription.created event
 * Creates a subscription record and marks trial start
 */
async function handleSubscriptionCreated(data: SubscriptionData) {
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
 * Handle subscription.updated event
 * Updates status and tracks conversions/cancellations
 */
async function handleSubscriptionUpdated(data: SubscriptionData) {
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
 * Handle subscription.deleted event
 * Marks the subscription as expired
 */
async function handleSubscriptionDeleted(data: SubscriptionData) {
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

/**
 * Map Clerk subscription status to our SubscriptionStatus enum
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
