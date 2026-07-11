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
    orchestratorFallbacks?: string[];
    subAgent: string;
    maintenance: string;
  };
  voice: VoicePlanConfig;
}

const MAINTENANCE_MODEL_ID = "google/gemini-2.5-flash-lite";
const ORCHESTRATOR_MODEL_ID = "z-ai/glm-5.2";
const ORCHESTRATOR_FALLBACK_MODEL_IDS = ["deepseek/deepseek-v4-flash"];

const DEFAULT_VOICE_CADENCE: VoicePlanConfig["cadence"] = {
  strongMinTurns: 1,
  strongCooldownMs: 5 * 60 * 1000,
  naturalMinTurns: 3,
  naturalCooldownMs: 15 * 60 * 1000,
  maxAutomaticPerHour: 3,
  maxConsecutiveAudio: 2,
  antiDroughtTurns: 8,
  naturalConfidence: 0.7,
  antiDroughtConfidence: 0.6,
};

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
      orchestrator: ORCHESTRATOR_MODEL_ID,
      orchestratorFallbacks: ORCHESTRATOR_FALLBACK_MODEL_IDS,
      subAgent: "google/gemini-2.5-flash-lite",
      maintenance: MAINTENANCE_MODEL_ID,
    },
    voice: {
      enabled: false,
      capWindowMs: 0,
      maxPerWindow: 0,
      automaticBudgetRatio: 0,
      cadence: DEFAULT_VOICE_CADENCE,
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
      orchestrator: ORCHESTRATOR_MODEL_ID,
      orchestratorFallbacks: ORCHESTRATOR_FALLBACK_MODEL_IDS,
      subAgent: "google/gemini-2.5-flash-lite",
      maintenance: MAINTENANCE_MODEL_ID,
    },
    voice: {
      enabled: false,
      capWindowMs: 6 * 60 * 60 * 1000,
      maxPerWindow: 3,
      automaticBudgetRatio: 0.65,
      cadence: DEFAULT_VOICE_CADENCE,
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
      orchestrator: ORCHESTRATOR_MODEL_ID,
      orchestratorFallbacks: ORCHESTRATOR_FALLBACK_MODEL_IDS,
      subAgent: "google/gemini-2.5-flash-lite",
      maintenance: MAINTENANCE_MODEL_ID,
    },
    voice: {
      enabled: true,
      capWindowMs: 12 * 60 * 60 * 1000,
      maxPerWindow: 10,
      automaticBudgetRatio: 0.65,
      cadence: DEFAULT_VOICE_CADENCE,
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
      orchestrator: ORCHESTRATOR_MODEL_ID,
      orchestratorFallbacks: ORCHESTRATOR_FALLBACK_MODEL_IDS,
      subAgent: "google/gemini-2.5-flash",
      maintenance: MAINTENANCE_MODEL_ID,
    },
    voice: {
      enabled: true,
      capWindowMs: 12 * 60 * 60 * 1000,
      maxPerWindow: 20,
      automaticBudgetRatio: 0.65,
      cadence: DEFAULT_VOICE_CADENCE,
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
      orchestrator: ORCHESTRATOR_MODEL_ID,
      orchestratorFallbacks: ORCHESTRATOR_FALLBACK_MODEL_IDS,
      subAgent: "google/gemini-2.5-flash-lite",
      maintenance: MAINTENANCE_MODEL_ID,
    },
    voice: {
      enabled: true,
      capWindowMs: 36 * 60 * 60 * 1000,
      maxPerWindow: 50,
      automaticBudgetRatio: 0.65,
      cadence: DEFAULT_VOICE_CADENCE,
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
      orchestrator: ORCHESTRATOR_MODEL_ID,
      orchestratorFallbacks: ORCHESTRATOR_FALLBACK_MODEL_IDS,
      subAgent: "google/gemini-2.5-flash-lite",
      maintenance: MAINTENANCE_MODEL_ID,
    },
    voice: {
      enabled: true,
      capWindowMs: 36 * 60 * 60 * 1000,
      maxPerWindow: Number.POSITIVE_INFINITY,
      automaticBudgetRatio: 1,
      cadence: DEFAULT_VOICE_CADENCE,
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
