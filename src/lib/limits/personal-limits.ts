import type {
  EntitlementLimits,
  OrganizationModelTier,
} from "@/lib/organizations/types";

export const PERSONAL_PLAN_KEYS = [
  "GUEST",
  "TRIAL",
  "basic",
  "basic_plus",
  "pro",
  "ACTIVE",
  "ADMIN",
] as const;

export type PersonalPlanKey = (typeof PERSONAL_PLAN_KEYS)[number];

export const PERSONAL_PLAN_LIMITS: Record<PersonalPlanKey, EntitlementLimits> =
  {
    GUEST: {
      maxRequestsPerDay: 10,
      maxInputTokensPerDay: 20_000,
      maxOutputTokensPerDay: 10_000,
      maxCostPerDay: 0.05,
      maxContextMessages: 5,
    },
    TRIAL: {
      maxRequestsPerDay: 3,
      maxInputTokensPerDay: 100_000,
      maxOutputTokensPerDay: 50_000,
      maxCostPerDay: 0.5,
      maxContextMessages: 10,
    },
    basic: {
      maxRequestsPerDay: 50,
      maxInputTokensPerDay: 500_000,
      maxOutputTokensPerDay: 250_000,
      maxCostPerDay: 3,
      maxContextMessages: 15,
    },
    basic_plus: {
      maxRequestsPerDay: 50,
      maxInputTokensPerDay: 800_000,
      maxOutputTokensPerDay: 400_000,
      maxCostPerDay: 5,
      maxContextMessages: 30,
    },
    pro: {
      maxRequestsPerDay: 100,
      maxInputTokensPerDay: 2_000_000,
      maxOutputTokensPerDay: 1_000_000,
      maxCostPerDay: 15,
      maxContextMessages: 100,
    },
    ACTIVE: {
      maxRequestsPerDay: 50,
      maxInputTokensPerDay: 500_000,
      maxOutputTokensPerDay: 250_000,
      maxCostPerDay: 3,
      maxContextMessages: 15,
    },
    ADMIN: {
      maxRequestsPerDay: Number.POSITIVE_INFINITY,
      maxInputTokensPerDay: Number.POSITIVE_INFINITY,
      maxOutputTokensPerDay: Number.POSITIVE_INFINITY,
      maxCostPerDay: Number.POSITIVE_INFINITY,
      maxContextMessages: 100,
    },
  };

export function planKeyToModelTier(
  planKey: PersonalPlanKey,
): OrganizationModelTier {
  switch (planKey) {
    case "basic":
      return "BASIC";
    case "basic_plus":
      return "BASIC_PLUS";
    case "pro":
      return "PRO";
    case "ACTIVE":
      return "BASIC";
    case "ADMIN":
      return "ADMIN";
  }
  return "TRIAL";
}
