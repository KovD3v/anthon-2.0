import type {
  EntitlementLimits,
  OrganizationModelTier,
} from "@/lib/organizations/types";
import {
  MODEL_TIER_PRIORITY,
  MODEL_TIER_TO_CANONICAL_PLAN,
  PLAN_CATALOG,
} from "./catalog";
import { PlanResolutionError } from "./errors";
import type {
  CanonicalPlan,
  PlanResolutionInput,
  ResolvedEntitlements,
} from "./types";

function isAdminRole(role?: string | null): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export function parseCanonicalPlanFromPlanId(
  planId?: string | null,
): CanonicalPlan | null {
  if (!planId) {
    return null;
  }

  const normalizedPlanId = planId.toLowerCase();

  if (normalizedPlanId.includes("pro")) {
    return "PRO";
  }
  if (normalizedPlanId.includes("basic_plus")) {
    return "BASIC_PLUS";
  }
  if (normalizedPlanId.includes("basic")) {
    return "BASIC";
  }

  return null;
}

export function resolvePersonalPlan(input: PlanResolutionInput): CanonicalPlan {
  if (isAdminRole(input.userRole)) {
    return "ADMIN";
  }

  if (input.isGuest) {
    return "GUEST";
  }

  if (input.subscriptionStatus === "ACTIVE") {
    const parsed = parseCanonicalPlanFromPlanId(input.planId);
    if (parsed) {
      return parsed;
    }

    throw new PlanResolutionError(
      "ACTIVE_WITH_INVALID_PLAN_ID",
      "Active subscription requires a recognized planId",
    );
  }

  throw new PlanResolutionError(
    "PAID_ACCESS_REQUIRED",
    "A paid or organization-funded entitlement is required",
  );
}

function buildPersonalEntitlements(
  input: PlanResolutionInput,
): ResolvedEntitlements {
  const plan = resolvePersonalPlan(input);
  const config = PLAN_CATALOG[plan];

  if (plan === "ADMIN" && isAdminRole(input.userRole)) {
    return {
      sourceType: "personal",
      sourceId: "personal-admin",
      sourceLabel: "Admin role",
      plan,
      modelTier: config.modelTier,
      limits: config.limits,
    };
  }

  return {
    sourceType: "personal",
    sourceId: "personal-subscription",
    sourceLabel: plan === "GUEST" ? "Guest" : `Personal ${plan}`,
    plan,
    modelTier: config.modelTier,
    limits: config.limits,
  };
}

function buildModelTierOverride(
  modelTier: OrganizationModelTier,
): ResolvedEntitlements {
  const plan = MODEL_TIER_TO_CANONICAL_PLAN[modelTier];
  const config = PLAN_CATALOG[plan];

  return {
    sourceType: "organization",
    sourceId: "model-tier-override",
    sourceLabel: `model-tier:${modelTier}`,
    plan,
    modelTier,
    limits: config.limits,
  };
}

function mapOrganizationSource(source: {
  sourceId: string;
  sourceLabel: string;
  plan?: CanonicalPlan;
  modelTier: OrganizationModelTier;
  limits: EntitlementLimits;
}): ResolvedEntitlements {
  return {
    sourceType: "organization",
    sourceId: source.sourceId,
    sourceLabel: source.sourceLabel,
    plan: source.plan ?? MODEL_TIER_TO_CANONICAL_PLAN[source.modelTier],
    modelTier: source.modelTier,
    limits: source.limits,
  };
}

export function compareEntitlementVectors(
  a: { modelTier: OrganizationModelTier; limits: EntitlementLimits },
  b: { modelTier: OrganizationModelTier; limits: EntitlementLimits },
): number {
  const tierDiff =
    MODEL_TIER_PRIORITY[a.modelTier] - MODEL_TIER_PRIORITY[b.modelTier];

  if (tierDiff !== 0) {
    return tierDiff;
  }

  if (a.limits.maxRequestsPerDay !== b.limits.maxRequestsPerDay) {
    return a.limits.maxRequestsPerDay - b.limits.maxRequestsPerDay;
  }
  if (a.limits.maxInputTokensPerDay !== b.limits.maxInputTokensPerDay) {
    return a.limits.maxInputTokensPerDay - b.limits.maxInputTokensPerDay;
  }
  if (a.limits.maxOutputTokensPerDay !== b.limits.maxOutputTokensPerDay) {
    return a.limits.maxOutputTokensPerDay - b.limits.maxOutputTokensPerDay;
  }
  if (a.limits.maxCostPerDay !== b.limits.maxCostPerDay) {
    return a.limits.maxCostPerDay - b.limits.maxCostPerDay;
  }

  return a.limits.maxContextMessages - b.limits.maxContextMessages;
}

function pickBestEntitlements(
  candidates: ResolvedEntitlements[],
): ResolvedEntitlements {
  return candidates.slice(1).reduce((best, candidate) => {
    const vectorDiff = compareEntitlementVectors(candidate, best);

    if (vectorDiff > 0) {
      return candidate;
    }

    if (
      vectorDiff === 0 &&
      candidate.sourceId.localeCompare(best.sourceId) < 0
    ) {
      return candidate;
    }

    return best;
  }, candidates[0]);
}

export function resolveEffectiveEntitlements(
  input: PlanResolutionInput,
): ResolvedEntitlements {
  if (input.isGuest || isAdminRole(input.userRole)) {
    return buildPersonalEntitlements(input);
  }

  if (input.modelTier) {
    return buildModelTierOverride(input.modelTier);
  }

  const organizationSources = (input.organizationSources ?? []).map(
    mapOrganizationSource,
  );

  let personal: ResolvedEntitlements | null = null;
  try {
    personal = buildPersonalEntitlements(input);
  } catch (error) {
    if (
      !(error instanceof PlanResolutionError) ||
      error.reason !== "PAID_ACCESS_REQUIRED"
    ) {
      throw error;
    }
  }

  const candidates = personal
    ? [personal, ...organizationSources]
    : organizationSources;
  if (candidates.length === 0) {
    throw new PlanResolutionError("PAID_ACCESS_REQUIRED");
  }

  return pickBestEntitlements(candidates);
}
