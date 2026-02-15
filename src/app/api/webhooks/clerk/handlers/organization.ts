/**
 * Clerk webhook handlers for organization and membership events.
 */

import {
  syncMembershipFromClerkEvent,
  syncOrganizationFromClerkEvent,
} from "@/lib/organizations/service";
import type {
  ClerkOrganizationData,
  ClerkOrganizationInvitationAcceptedData,
  ClerkOrganizationMembershipData,
} from "./types";
import { mapMembershipStatus, readString } from "./types";

export async function handleOrganizationUpsert(data: ClerkOrganizationData) {
  const payload = data as Record<string, unknown>;
  const clerkOrganizationId = readString(payload, "id");

  if (!clerkOrganizationId) {
    console.error("[Webhook] Missing organization id in upsert event");
    return;
  }

  await syncOrganizationFromClerkEvent({
    clerkOrganizationId,
    name: readString(payload, "name"),
    slug: readString(payload, "slug"),
  });
}

export async function handleOrganizationDeleted(data: ClerkOrganizationData) {
  const payload = data as Record<string, unknown>;
  const clerkOrganizationId = readString(payload, "id");

  if (!clerkOrganizationId) {
    console.error("[Webhook] Missing organization id in delete event");
    return;
  }

  await syncOrganizationFromClerkEvent({
    clerkOrganizationId,
    status: "ARCHIVED",
  });
}

export async function handleOrganizationMembershipUpsert(
  data: ClerkOrganizationMembershipData,
) {
  const payload = data as Record<string, unknown>;
  const id = readString(payload, "id");

  const organizationId =
    readString(payload, "organization_id") ||
    readString((payload.organization as Record<string, unknown>) || {}, "id");

  const userId =
    readString(payload, "user_id") ||
    readString((payload.user as Record<string, unknown>) || {}, "id") ||
    readString(
      (payload.public_user_data as Record<string, unknown>) || {},
      "user_id",
    ) ||
    readString(
      (payload.publicUserData as Record<string, unknown>) || {},
      "userId",
    );

  if (!id || !organizationId || !userId) {
    console.error("[Webhook] Missing fields for membership upsert", {
      id,
      organizationId,
      userId,
    });
    return;
  }

  await syncMembershipFromClerkEvent({
    clerkMembershipId: id,
    clerkOrganizationId: organizationId,
    clerkUserId: userId,
    role: readString(payload, "role"),
    status: mapMembershipStatus(readString(payload, "status") || "active"),
  });
}

export async function handleOrganizationMembershipDeleted(
  data: ClerkOrganizationMembershipData,
) {
  const payload = data as Record<string, unknown>;
  const id = readString(payload, "id");

  const organizationId =
    readString(payload, "organization_id") ||
    readString((payload.organization as Record<string, unknown>) || {}, "id");

  const userId =
    readString(payload, "user_id") ||
    readString((payload.user as Record<string, unknown>) || {}, "id") ||
    readString(
      (payload.public_user_data as Record<string, unknown>) || {},
      "user_id",
    ) ||
    readString(
      (payload.publicUserData as Record<string, unknown>) || {},
      "userId",
    );

  if (!id || !organizationId || !userId) {
    console.error("[Webhook] Missing fields for membership delete", {
      id,
      organizationId,
      userId,
    });
    return;
  }

  await syncMembershipFromClerkEvent({
    clerkMembershipId: id,
    clerkOrganizationId: organizationId,
    clerkUserId: userId,
    role: readString(payload, "role"),
    status: "REMOVED",
  });
}

export async function handleOrganizationInvitationAccepted(
  data: ClerkOrganizationInvitationAcceptedData,
) {
  const payload = data as Record<string, unknown>;
  const invitationId = readString(payload, "id");
  const organizationId =
    readString(payload, "organization_id") ||
    readString((payload.organization as Record<string, unknown>) || {}, "id");
  const userId =
    readString(payload, "user_id") ||
    readString((payload.user as Record<string, unknown>) || {}, "id");
  const membershipId =
    readString(payload, "organization_membership_id") ||
    readString(payload, "organizationMembershipId") ||
    readString(
      (payload.organization_membership as Record<string, unknown>) || {},
      "id",
    );

  if (!organizationId || !userId) {
    console.error("[Webhook] Missing fields for invitation accepted", {
      invitationId,
      organizationId,
      userId,
    });
    return;
  }

  // Invitation payload id is the invitation id, not membership id.
  // Wait for organizationMembership.created unless a concrete membership id is present.
  if (!membershipId) {
    console.log(
      "[Webhook] Invitation accepted; waiting for membership.created",
      {
        invitationId,
        organizationId,
        userId,
      },
    );
    return;
  }

  await syncMembershipFromClerkEvent({
    clerkMembershipId: membershipId,
    clerkOrganizationId: organizationId,
    clerkUserId: userId,
    role: readString(payload, "role"),
    status: "ACTIVE",
  });
}
