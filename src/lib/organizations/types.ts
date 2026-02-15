export const ORGANIZATION_MODEL_TIERS = [
  "TRIAL",
  "BASIC",
  "BASIC_PLUS",
  "PRO",
  "ENTERPRISE",
  "ADMIN",
] as const;

export type OrganizationModelTier = (typeof ORGANIZATION_MODEL_TIERS)[number];

export const ORGANIZATION_BASE_PLANS = ["BASIC", "BASIC_PLUS", "PRO"] as const;
export type OrganizationBasePlan = (typeof ORGANIZATION_BASE_PLANS)[number];

export const ORGANIZATION_MEMBER_ROLES = ["OWNER", "MEMBER"] as const;
export type OrganizationMemberRole = (typeof ORGANIZATION_MEMBER_ROLES)[number];

export const ORGANIZATION_AUDIT_ACTIONS = [
  "ORGANIZATION_CREATED",
  "CONTRACT_UPDATED",
  "OWNER_ASSIGNED",
  "OWNER_TRANSFERRED",
  "MEMBERSHIP_SYNCED",
  "MEMBERSHIP_BLOCKED_SEAT_LIMIT",
] as const;

export type OrganizationAuditAction =
  (typeof ORGANIZATION_AUDIT_ACTIONS)[number];

export interface EntitlementLimits {
  maxRequestsPerDay: number;
  maxInputTokensPerDay: number;
  maxOutputTokensPerDay: number;
  maxCostPerDay: number;
  maxContextMessages: number;
}

export interface EffectiveEntitlementSource {
  type: "personal" | "organization";
  sourceId: string;
  sourceLabel: string;
  limits: EntitlementLimits;
  modelTier: OrganizationModelTier;
}

export interface EffectiveEntitlements {
  limits: EntitlementLimits;
  modelTier: OrganizationModelTier;
  sources: EffectiveEntitlementSource[];
}

export interface OrganizationContractInput {
  basePlan: OrganizationBasePlan;
  seatLimit: number;
  planLabel: string;
  modelTier: OrganizationModelTier;
  maxRequestsPerDay: number;
  maxInputTokensPerDay: number;
  maxOutputTokensPerDay: number;
  maxCostPerDay: number;
  maxContextMessages: number;
}
