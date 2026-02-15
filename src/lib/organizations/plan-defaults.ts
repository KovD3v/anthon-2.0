import {
  type EntitlementLimits,
  ORGANIZATION_BASE_PLANS,
  ORGANIZATION_MODEL_TIERS,
  type OrganizationBasePlan,
  type OrganizationModelTier,
} from "@/lib/organizations/types";

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
    modelTier: "BASIC",
    seatLimit: 10,
    limits: {
      maxRequestsPerDay: 50,
      maxInputTokensPerDay: 500_000,
      maxOutputTokensPerDay: 250_000,
      maxCostPerDay: 3,
      maxContextMessages: 15,
    },
  },
  BASIC_PLUS: {
    basePlan: "BASIC_PLUS",
    planLabel: "Basic Plus",
    modelTier: "BASIC_PLUS",
    seatLimit: 25,
    limits: {
      maxRequestsPerDay: 50,
      maxInputTokensPerDay: 800_000,
      maxOutputTokensPerDay: 400_000,
      maxCostPerDay: 5,
      maxContextMessages: 30,
    },
  },
  PRO: {
    basePlan: "PRO",
    planLabel: "Pro",
    modelTier: "PRO",
    seatLimit: 50,
    limits: {
      maxRequestsPerDay: 100,
      maxInputTokensPerDay: 2_000_000,
      maxOutputTokensPerDay: 1_000_000,
      maxCostPerDay: 15,
      maxContextMessages: 100,
    },
  },
};

const MODEL_TIER_PRIORITY: Record<OrganizationModelTier, number> = {
  TRIAL: 0,
  BASIC: 1,
  BASIC_PLUS: 2,
  PRO: 3,
  ENTERPRISE: 4,
  ADMIN: 5,
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
