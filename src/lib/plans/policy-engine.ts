import { MODEL_TIER_TO_CANONICAL_PLAN, PLAN_CATALOG } from "./catalog";
import type {
  ResolvedEntitlements,
  ResolvedPlanPolicies,
} from "./types";

export function resolvePoliciesForEntitlements(
  entitlements: ResolvedEntitlements,
): ResolvedPlanPolicies {
  const routingPlan = MODEL_TIER_TO_CANONICAL_PLAN[entitlements.modelTier];
  const routingConfig = PLAN_CATALOG[routingPlan];
  const planConfig = PLAN_CATALOG[entitlements.plan];

  return {
    modelRouting: routingConfig.modelRouting,
    attachmentRetentionDays: planConfig.attachmentRetentionDays,
    voice: planConfig.voice,
  };
}
