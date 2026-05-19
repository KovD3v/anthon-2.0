import { resolvePoliciesForEntitlements } from "./policy-engine";
import { resolveEffectiveEntitlements, resolvePersonalPlan } from "./resolver";
import type { PlanResolutionInput, ResolvedPlanSnapshot } from "./types";

export function resolvePlanSnapshot(
  input: PlanResolutionInput,
): ResolvedPlanSnapshot {
  const personalPlan = resolvePersonalPlan(input);
  const effective = resolveEffectiveEntitlements(input);

  return {
    personalPlan,
    effective,
    policies: resolvePoliciesForEntitlements(effective),
  };
}
