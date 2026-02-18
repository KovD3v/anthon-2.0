import type {
  EntitlementLimits,
  OrganizationModelTier,
} from "@/lib/organizations/types";
import type { VoicePlanConfig } from "@/lib/voice/config";

export const CANONICAL_PLANS = [
  "GUEST",
  "TRIAL",
  "BASIC",
  "BASIC_PLUS",
  "PRO",
  "ADMIN",
] as const;

export type CanonicalPlan = (typeof CANONICAL_PLANS)[number];

export interface OrganizationEntitlementSource {
  sourceId: string;
  sourceLabel: string;
  plan?: CanonicalPlan;
  modelTier: OrganizationModelTier;
  limits: EntitlementLimits;
}

export interface PlanResolutionInput {
  userId?: string;
  subscriptionStatus?: string | null;
  userRole?: string | null;
  planId?: string | null;
  isGuest?: boolean;
  modelTier?: OrganizationModelTier;
  organizationSources?: OrganizationEntitlementSource[];
}

export interface ResolvedEntitlements {
  sourceType: "personal" | "organization";
  sourceId: string;
  sourceLabel: string;
  plan: CanonicalPlan;
  modelTier: OrganizationModelTier;
  limits: EntitlementLimits;
}

export interface ResolvedPlanPolicies {
  modelRouting: {
    orchestrator: string;
    subAgent: string;
    maintenance: string;
  };
  attachmentRetentionDays: number;
  voice: VoicePlanConfig;
}

export interface ResolvedPlanSnapshot {
  personalPlan: CanonicalPlan;
  effective: ResolvedEntitlements;
  policies: ResolvedPlanPolicies;
}
