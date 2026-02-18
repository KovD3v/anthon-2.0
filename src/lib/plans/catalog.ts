import type {
  EntitlementLimits,
  OrganizationModelTier,
} from "@/lib/organizations/types";
import type { VoicePlanConfig } from "@/lib/voice/config";
import type { CanonicalPlan } from "./types";

interface PlanCatalogEntry {
  modelTier: OrganizationModelTier;
  limits: EntitlementLimits;
  attachmentRetentionDays: number;
  modelRouting: {
    orchestrator: string;
    subAgent: string;
    maintenance: string;
  };
  voice: VoicePlanConfig;
}

const MAINTENANCE_MODEL_ID = "google/gemini-2.0-flash-lite-001";

export const PLAN_CATALOG: Record<CanonicalPlan, PlanCatalogEntry> = {
  GUEST: {
    modelTier: "TRIAL",
    limits: {
      maxRequestsPerDay: 10,
      maxInputTokensPerDay: 20_000,
      maxOutputTokensPerDay: 10_000,
      maxCostPerDay: 0.05,
      maxContextMessages: 5,
    },
    attachmentRetentionDays: 1,
    modelRouting: {
      orchestrator: "google/gemini-2.0-flash-lite-001",
      subAgent: "google/gemini-2.0-flash-lite-001",
      maintenance: MAINTENANCE_MODEL_ID,
    },
    voice: {
      enabled: false,
      baseProbability: 0,
      decayFactor: 0,
      capWindowMs: 0,
      maxPerWindow: 0,
    },
  },
  TRIAL: {
    modelTier: "TRIAL",
    limits: {
      maxRequestsPerDay: 3,
      maxInputTokensPerDay: 100_000,
      maxOutputTokensPerDay: 50_000,
      maxCostPerDay: 0.5,
      maxContextMessages: 10,
    },
    attachmentRetentionDays: 7,
    modelRouting: {
      orchestrator: "google/gemini-2.0-flash-lite-001",
      subAgent: "google/gemini-2.0-flash-lite-001",
      maintenance: MAINTENANCE_MODEL_ID,
    },
    voice: {
      enabled: false,
      baseProbability: 0.3,
      decayFactor: 0.7,
      capWindowMs: 6 * 60 * 60 * 1000,
      maxPerWindow: 3,
    },
  },
  BASIC: {
    modelTier: "BASIC",
    limits: {
      maxRequestsPerDay: 50,
      maxInputTokensPerDay: 500_000,
      maxOutputTokensPerDay: 250_000,
      maxCostPerDay: 3,
      maxContextMessages: 15,
    },
    attachmentRetentionDays: 30,
    modelRouting: {
      orchestrator: "google/gemini-2.0-flash-001",
      subAgent: "google/gemini-2.0-flash-lite-001",
      maintenance: MAINTENANCE_MODEL_ID,
    },
    voice: {
      enabled: true,
      baseProbability: 0.5,
      decayFactor: 0.8,
      capWindowMs: 12 * 60 * 60 * 1000,
      maxPerWindow: 10,
    },
  },
  BASIC_PLUS: {
    modelTier: "BASIC_PLUS",
    limits: {
      maxRequestsPerDay: 50,
      maxInputTokensPerDay: 800_000,
      maxOutputTokensPerDay: 400_000,
      maxCostPerDay: 5,
      maxContextMessages: 30,
    },
    attachmentRetentionDays: 60,
    modelRouting: {
      orchestrator: "google/gemini-2.0-flash-001",
      subAgent: "google/gemini-2.0-flash-001",
      maintenance: MAINTENANCE_MODEL_ID,
    },
    voice: {
      enabled: true,
      baseProbability: 0.6,
      decayFactor: 0.85,
      capWindowMs: 12 * 60 * 60 * 1000,
      maxPerWindow: 20,
    },
  },
  PRO: {
    modelTier: "PRO",
    limits: {
      maxRequestsPerDay: 100,
      maxInputTokensPerDay: 2_000_000,
      maxOutputTokensPerDay: 1_000_000,
      maxCostPerDay: 15,
      maxContextMessages: 100,
    },
    attachmentRetentionDays: 180,
    modelRouting: {
      orchestrator: "google/gemini-2.0-flash-lite-001",
      subAgent: "google/gemini-2.0-flash-lite-001",
      maintenance: MAINTENANCE_MODEL_ID,
    },
    voice: {
      enabled: true,
      baseProbability: 0.8,
      decayFactor: 0.9,
      capWindowMs: 36 * 60 * 60 * 1000,
      maxPerWindow: 50,
    },
  },
  ADMIN: {
    modelTier: "ADMIN",
    limits: {
      maxRequestsPerDay: Number.POSITIVE_INFINITY,
      maxInputTokensPerDay: Number.POSITIVE_INFINITY,
      maxOutputTokensPerDay: Number.POSITIVE_INFINITY,
      maxCostPerDay: Number.POSITIVE_INFINITY,
      maxContextMessages: 100,
    },
    attachmentRetentionDays: 365 * 10,
    modelRouting: {
      orchestrator: "google/gemini-2.0-flash-lite-001",
      subAgent: "google/gemini-2.0-flash-lite-001",
      maintenance: MAINTENANCE_MODEL_ID,
    },
    voice: {
      enabled: true,
      baseProbability: 1,
      decayFactor: 1,
      capWindowMs: 36 * 60 * 60 * 1000,
      maxPerWindow: Number.POSITIVE_INFINITY,
    },
  },
};

export const MODEL_TIER_PRIORITY: Record<OrganizationModelTier, number> = {
  TRIAL: 0,
  BASIC: 1,
  BASIC_PLUS: 2,
  PRO: 3,
  ENTERPRISE: 4,
  ADMIN: 5,
};

export const MODEL_TIER_TO_CANONICAL_PLAN: Record<
  OrganizationModelTier,
  CanonicalPlan
> = {
  TRIAL: "TRIAL",
  BASIC: "BASIC",
  BASIC_PLUS: "BASIC_PLUS",
  PRO: "PRO",
  ENTERPRISE: "PRO",
  ADMIN: "ADMIN",
};
