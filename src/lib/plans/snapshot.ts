import { resolvePoliciesForEntitlements } from "./policy-engine";
import { resolveEffectiveEntitlements } from "./resolver";
import type { PlanResolutionInput, ResolvedPlanSnapshot } from "./types";

export function resolvePlanSnapshot(
  input: PlanResolutionInput,
): ResolvedPlanSnapshot {
  const effective = resolveEffectiveEntitlements(input);

  return {
    effective,
    policies: resolvePoliciesForEntitlements(effective),
  };
}
