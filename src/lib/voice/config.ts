/**
 * Voice Generation Configuration
 *
 * Plan-based configuration for Eleven Labs voice generation.
 * Controls deterministic cadence and hard caps per subscription tier.
 */

import type { OrganizationModelTier } from "@/lib/organizations/types";
import { resolvePlanSnapshot } from "@/lib/plans";

export interface VoicePlanConfig {
  enabled: boolean;
  capWindowMs: number; // Time window in milliseconds
  maxPerWindow: number; // Maximum voice messages per window
  automaticBudgetRatio: number; // Portion of the quota available to unsolicited audio
  cadence: VoiceCadenceConfig;
}

export interface VoiceCadenceConfig {
  strongMinTurns: number;
  strongCooldownMs: number;
  naturalMinTurns: number;
  naturalCooldownMs: number;
  maxAutomaticPerHour: number;
  maxConsecutiveAudio: number;
  antiDroughtTurns: number;
  naturalConfidence: number;
  antiDroughtConfidence: number;
}

/**
 * Get voice configuration for a user based on resolved plan policies.
 */
export function getVoicePlanConfig(
  subscriptionStatus?: string,
  userRole?: string,
  planId?: string | null,
  isGuest?: boolean,
  modelTier?: OrganizationModelTier,
): VoicePlanConfig {
  return resolvePlanSnapshot({
    subscriptionStatus,
    userRole,
    planId,
    isGuest,
    modelTier,
  }).policies.voice;
}
