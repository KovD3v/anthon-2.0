import {
  type EntitlementLimits,
  ORGANIZATION_BASE_PLANS,
  ORGANIZATION_MODEL_TIERS,
  type OrganizationBasePlan,
  type OrganizationModelTier,
} from "@/lib/organizations/types";
import {
  compareEntitlementVectors as comparePlanEntitlementVectors,
  PLAN_CATALOG,
} from "@/lib/plans";

interface OrgPlanDefaults {
  basePlan: OrganizationBasePlan;
  planLabel: string;
  modelTier: OrganizationModelTier;
  limits: EntitlementLimits;
  seatLimit: number;
}

type ContractLike = {
  basePlan?: string | null;
  planLabel?: string | null;
  modelTier?: string | null;
  seatLimit?: number | null;
  maxRequestsPerDay?: number | null;
  maxInputTokensPerDay?: number | null;
  maxOutputTokensPerDay?: number | null;
  maxCostPerDay?: number | null;
  maxContextMessages?: number | null;
};

const ORG_BASE_PLAN_DEFAULTS: Record<OrganizationBasePlan, OrgPlanDefaults> = {
  BASIC: {
    basePlan: "BASIC",
    planLabel: "Basic",
    modelTier: PLAN_CATALOG.BASIC.modelTier,
    seatLimit: 10,
    limits: PLAN_CATALOG.BASIC.limits,
  },
  BASIC_PLUS: {
    basePlan: "BASIC_PLUS",
    planLabel: "Basic Plus",
    modelTier: PLAN_CATALOG.BASIC_PLUS.modelTier,
    seatLimit: 25,
    limits: PLAN_CATALOG.BASIC_PLUS.limits,
  },
  PRO: {
    basePlan: "PRO",
    planLabel: "Pro",
    modelTier: PLAN_CATALOG.PRO.modelTier,
    seatLimit: 50,
    limits: PLAN_CATALOG.PRO.limits,
  },
};

export function isOrganizationBasePlan(
  value: unknown,
): value is OrganizationBasePlan {
  return (
    typeof value === "string" &&
    (ORGANIZATION_BASE_PLANS as readonly string[]).includes(value)
  );
}

export function normalizeOrganizationBasePlan(
  value: unknown,
): OrganizationBasePlan {
  if (isOrganizationBasePlan(value)) {
    return value;
  }
  return "BASIC";
}

export function normalizeModelTier(value: unknown): OrganizationModelTier {
  if (
    typeof value === "string" &&
    (ORGANIZATION_MODEL_TIERS as readonly string[]).includes(value)
  ) {
    return value as OrganizationModelTier;
  }
  return "TRIAL";
}

export function resolveOrgPlanDefaults(
  basePlan: OrganizationBasePlan,
): OrgPlanDefaults {
  return ORG_BASE_PLAN_DEFAULTS[basePlan];
}

export function applyOrgOverrides(contract: ContractLike) {
  const basePlan = normalizeOrganizationBasePlan(contract.basePlan);
  const defaults = resolveOrgPlanDefaults(basePlan);

  return {
    basePlan,
    defaults,
    effective: {
      seatLimit:
        typeof contract.seatLimit === "number" &&
        Number.isFinite(contract.seatLimit)
          ? contract.seatLimit
          : defaults.seatLimit,
      planLabel:
        typeof contract.planLabel === "string" && contract.planLabel.trim()
          ? contract.planLabel.trim()
          : defaults.planLabel,
      modelTier:
        contract.modelTier !== undefined && contract.modelTier !== null
          ? normalizeModelTier(contract.modelTier)
          : defaults.modelTier,
      limits: {
        maxRequestsPerDay:
          typeof contract.maxRequestsPerDay === "number" &&
          Number.isFinite(contract.maxRequestsPerDay)
            ? contract.maxRequestsPerDay
            : defaults.limits.maxRequestsPerDay,
        maxInputTokensPerDay:
          typeof contract.maxInputTokensPerDay === "number" &&
          Number.isFinite(contract.maxInputTokensPerDay)
            ? contract.maxInputTokensPerDay
            : defaults.limits.maxInputTokensPerDay,
        maxOutputTokensPerDay:
          typeof contract.maxOutputTokensPerDay === "number" &&
          Number.isFinite(contract.maxOutputTokensPerDay)
            ? contract.maxOutputTokensPerDay
            : defaults.limits.maxOutputTokensPerDay,
        maxCostPerDay:
          typeof contract.maxCostPerDay === "number" &&
          Number.isFinite(contract.maxCostPerDay)
            ? contract.maxCostPerDay
            : defaults.limits.maxCostPerDay,
        maxContextMessages:
          typeof contract.maxContextMessages === "number" &&
          Number.isFinite(contract.maxContextMessages)
            ? contract.maxContextMessages
            : defaults.limits.maxContextMessages,
      },
    },
  };
}

export function compareEntitlementVectors(
  a: { modelTier: OrganizationModelTier; limits: EntitlementLimits },
  b: { modelTier: OrganizationModelTier; limits: EntitlementLimits },
): number {
  return comparePlanEntitlementVectors(a, b);
}
