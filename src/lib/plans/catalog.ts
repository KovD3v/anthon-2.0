import type {
  EntitlementLimits,
  OrganizationModelTier,
  UploadLimits,
} from "@/lib/organizations/types";
import type { VoicePlanConfig } from "@/lib/voice/config";
import type { CanonicalPlan } from "./types";

interface PlanCatalogEntry {
  modelTier: OrganizationModelTier;
  limits: EntitlementLimits;
  uploadLimits: UploadLimits;
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
const ORCHESTRATOR_MODEL_ID = "openai/gpt-5.6-luna";
const ORCHESTRATOR_FALLBACK_MODEL_IDS = ["deepseek/deepseek-v4-flash"];

// Keep unsolicited audio occasional. Explicit voice requests bypass these
// cadence gates in decideVoiceDelivery and remain limited only by hard policy.
const DEFAULT_VOICE_CADENCE: VoicePlanConfig["cadence"] = {
  strongMinTurns: 2,
  strongCooldownMs: 15 * 60 * 1000,
  naturalMinTurns: 8,
  naturalCooldownMs: 60 * 60 * 1000,
  maxAutomaticPerHour: 2,
  maxConsecutiveAudio: 2,
  antiDroughtTurns: 8,
  naturalConfidence: 0.6,
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
    uploadLimits: {
      maxUploadsPerDay: 0,
      maxUploadBytesPerDay: 0,
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
      maxRequestsPerDay: 75,
      maxInputTokensPerDay: 100_000,
      maxOutputTokensPerDay: 50_000,
      maxCostPerDay: 0.5,
      maxContextMessages: 10,
    },
    uploadLimits: {
      maxUploadsPerDay: 10,
      maxUploadBytesPerDay: 50 * 1024 * 1024,
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
    uploadLimits: {
      maxUploadsPerDay: 25,
      maxUploadBytesPerDay: 250 * 1024 * 1024,
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
    uploadLimits: {
      maxUploadsPerDay: 50,
      maxUploadBytesPerDay: 500 * 1024 * 1024,
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
    uploadLimits: {
      maxUploadsPerDay: 100,
      maxUploadBytesPerDay: 2 * 1024 * 1024 * 1024,
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
    uploadLimits: {
      maxUploadsPerDay: Number.POSITIVE_INFINITY,
      maxUploadBytesPerDay: Number.POSITIVE_INFINITY,
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
