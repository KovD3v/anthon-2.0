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
import {
  handleOrganizationDeleted,
  handleOrganizationInvitationAccepted,
  handleOrganizationMembershipDeleted,
  handleOrganizationMembershipUpsert,
  handleOrganizationUpsert,
} from "./handlers/organization";
import {
  handleSubscriptionCreated,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
} from "./handlers/subscription";
import type {
  ClerkOrganizationData,
  ClerkOrganizationInvitationAcceptedData,
  ClerkOrganizationMembershipData,
  SubscriptionData,
  UserCreatedData,
  WebhookEvent,
} from "./handlers/types";
import { handleUserCreated, handleUserUpdated } from "./handlers/user";

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

      case "organization.created":
      case "organization.updated":
        await handleOrganizationUpsert(
          evt.data as unknown as ClerkOrganizationData,
        );
        break;

      case "organization.deleted":
        await handleOrganizationDeleted(
          evt.data as unknown as ClerkOrganizationData,
        );
        break;

      case "organizationMembership.created":
      case "organizationMembership.updated":
      case "organization_membership.created":
      case "organization_membership.updated":
        await handleOrganizationMembershipUpsert(
          evt.data as unknown as ClerkOrganizationMembershipData,
        );
        break;

      case "organizationInvitation.accepted":
      case "organization_invitation.accepted":
        await handleOrganizationInvitationAccepted(
          evt.data as unknown as ClerkOrganizationInvitationAcceptedData,
        );
        break;

      case "organizationMembership.deleted":
      case "organization_membership.deleted":
        await handleOrganizationMembershipDeleted(
          evt.data as unknown as ClerkOrganizationMembershipData,
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
