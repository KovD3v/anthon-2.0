import type {
  EntitlementLimits,
  OrganizationModelTier,
} from "@/lib/organizations/types";
import { CANONICAL_PLANS, type CanonicalPlan, PLAN_CATALOG } from "@/lib/plans";

export const PERSONAL_PLAN_KEYS = CANONICAL_PLANS;

export type PersonalPlanKey = CanonicalPlan;

export const PERSONAL_PLAN_LIMITS: Record<PersonalPlanKey, EntitlementLimits> =
  {
    GUEST: PLAN_CATALOG.GUEST.limits,
    TRIAL: PLAN_CATALOG.TRIAL.limits,
    BASIC: PLAN_CATALOG.BASIC.limits,
    BASIC_PLUS: PLAN_CATALOG.BASIC_PLUS.limits,
    PRO: PLAN_CATALOG.PRO.limits,
    ADMIN: PLAN_CATALOG.ADMIN.limits,
  };

export function planKeyToModelTier(
  planKey: PersonalPlanKey,
): OrganizationModelTier {
  return PLAN_CATALOG[planKey].modelTier;
}
