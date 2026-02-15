/**
 * Shared types and utilities for Clerk webhook handlers.
 */

// Clerk webhook event envelope
export interface WebhookEvent {
  type: string;
  data: Record<string, unknown>;
}

// User event payload
export interface UserCreatedData {
  id: string;
  email_addresses?: Array<{ email_address: string }>;
  first_name?: string | null;
  last_name?: string | null;
}

// Subscription event payload
export interface SubscriptionData {
  id: string;
  user_id: string;
  status: string;
  plan_id?: string;
  plan_name?: string;
  trial_period_days?: number;
  current_period_start?: number;
  current_period_end?: number;
}

// Organization event payload
export interface ClerkOrganizationData {
  id?: string;
  name?: string;
  slug?: string;
  status?: string;
}

// Organization membership event payload
export interface ClerkOrganizationMembershipData {
  id?: string;
  role?: string;
  status?: string;
  organization?: { id?: string };
  organization_id?: string;
  public_user_data?: { user_id?: string };
  publicUserData?: { userId?: string };
  user?: { id?: string };
  user_id?: string;
}

// Organization invitation accepted event payload
export interface ClerkOrganizationInvitationAcceptedData {
  id?: string;
  role?: string;
  organization_id?: string;
  user_id?: string;
  organization?: { id?: string };
  user?: { id?: string };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Safely extract a non-empty string from an object by key. */
export function readString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const candidate = value[key];
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : null;
}

/** Map Clerk membership status strings to our enum values. */
export function mapMembershipStatus(
  status?: string,
): "ACTIVE" | "REMOVED" | "BLOCKED" {
  const normalized = (status || "active").toLowerCase();
  if (normalized.includes("block")) {
    return "BLOCKED";
  }
  if (normalized.includes("delete") || normalized.includes("remove")) {
    return "REMOVED";
  }
  return "ACTIVE";
}
