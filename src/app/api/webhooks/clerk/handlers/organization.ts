/**
 * Clerk webhook handlers for organization and membership events.
 */

import { createLogger } from "@/lib/logger";
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

const webhookLogger = createLogger("webhook");

export async function handleOrganizationUpsert(data: ClerkOrganizationData) {
  const payload = data as Record<string, unknown>;
  const clerkOrganizationId = readString(payload, "id");

  if (!clerkOrganizationId) {
    webhookLogger.error(
      "webhook.organization.upsert.invalid",
      "Missing organization id in upsert event",
    );
    return;
  }

  const syncedOrganization = await syncOrganizationFromClerkEvent({
    clerkOrganizationId,
    name: readString(payload, "name"),
    slug: readString(payload, "slug"),
  });

  webhookLogger.info(
    "webhook.organization.upsert.processed",
    "Processed organization upsert webhook",
    {
      clerkOrganizationId,
      synced: Boolean(syncedOrganization),
    },
  );
}

export async function handleOrganizationDeleted(data: ClerkOrganizationData) {
  const payload = data as Record<string, unknown>;
  const clerkOrganizationId = readString(payload, "id");

  if (!clerkOrganizationId) {
    webhookLogger.error(
      "webhook.organization.deleted.invalid",
      "Missing organization id in delete event",
    );
    return;
  }

  const syncedOrganization = await syncOrganizationFromClerkEvent({
    clerkOrganizationId,
    status: "ARCHIVED",
  });

  webhookLogger.info(
    "webhook.organization.deleted.processed",
    "Processed organization delete webhook",
    {
      clerkOrganizationId,
      synced: Boolean(syncedOrganization),
    },
  );
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
    webhookLogger.error(
      "webhook.organization.membership.upsert.invalid",
      "Missing fields for membership upsert",
      {
        id,
        organizationId,
        userId,
      },
    );
    return;
  }

  const result = await syncMembershipFromClerkEvent({
    clerkMembershipId: id,
    clerkOrganizationId: organizationId,
    clerkUserId: userId,
    role: readString(payload, "role"),
    status: mapMembershipStatus(readString(payload, "status") || "active"),
  });

  webhookLogger.info(
    "webhook.organization.membership.upsert.processed",
    "Processed organization membership upsert webhook",
    {
      clerkMembershipId: id,
      clerkOrganizationId: organizationId,
      clerkUserId: userId,
      result,
    },
  );
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
    webhookLogger.error(
      "webhook.organization.membership.delete.invalid",
      "Missing fields for membership delete",
      {
        id,
        organizationId,
        userId,
      },
    );
    return;
  }

  const result = await syncMembershipFromClerkEvent({
    clerkMembershipId: id,
    clerkOrganizationId: organizationId,
    clerkUserId: userId,
    role: readString(payload, "role"),
    status: "REMOVED",
  });

  webhookLogger.info(
    "webhook.organization.membership.delete.processed",
    "Processed organization membership delete webhook",
    {
      clerkMembershipId: id,
      clerkOrganizationId: organizationId,
      clerkUserId: userId,
      result,
    },
  );
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
    webhookLogger.error(
      "webhook.organization.invitation.invalid",
      "Missing fields for invitation accepted",
      {
        invitationId,
        organizationId,
        userId,
      },
    );
    return;
  }

  // Invitation payload id is the invitation id, not membership id.
  // Wait for organizationMembership.created unless a concrete membership id is present.
  if (!membershipId) {
    webhookLogger.info(
      "webhook.organization.invitation.await_membership",
      "Invitation accepted; waiting for membership.created",
      {
        invitationId,
        organizationId,
        userId,
      },
    );
    return;
  }

  const result = await syncMembershipFromClerkEvent({
    clerkMembershipId: membershipId,
    clerkOrganizationId: organizationId,
    clerkUserId: userId,
    role: readString(payload, "role"),
    status: "ACTIVE",
  });

  webhookLogger.info(
    "webhook.organization.invitation.processed",
    "Processed organization invitation accepted webhook",
    {
      invitationId,
      clerkMembershipId: membershipId,
      clerkOrganizationId: organizationId,
      clerkUserId: userId,
      result,
    },
  );
}
