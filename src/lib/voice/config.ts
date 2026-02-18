/**
 * Voice Generation Configuration
 *
 * Plan-based configuration for Eleven Labs voice generation.
 * Controls probabilities, decay factors, and caps per subscription tier.
 */

import type { OrganizationModelTier } from "@/lib/organizations/types";
import { resolvePlanSnapshot } from "@/lib/plans";

export interface VoicePlanConfig {
  enabled: boolean;
  baseProbability: number; // 0.0 - 1.0
  decayFactor: number; // Applied per voice message: P = P_base * (decay ^ N)
  capWindowMs: number; // Time window in milliseconds
  maxPerWindow: number; // Maximum voice messages per window
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
