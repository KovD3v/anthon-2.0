/**
 * Voice Generation Configuration
 *
 * Plan-based configuration for Eleven Labs voice generation.
 * Controls probabilities, decay factors, and caps per subscription tier.
 */

export interface VoicePlanConfig {
  enabled: boolean;
  baseProbability: number; // 0.0 - 1.0
  decayFactor: number; // Applied per voice message: P = P_base * (decay ^ N)
  capWindowMs: number; // Time window in milliseconds
  maxPerWindow: number; // Maximum voice messages per window
}

const VOICE_PLAN_CONFIG: Record<string, VoicePlanConfig> = {
  // Guest users - voice disabled
  GUEST: {
    enabled: false,
    baseProbability: 0,
    decayFactor: 0,
    capWindowMs: 0,
    maxPerWindow: 0,
  },

  // Trial users - limited voice
  TRIAL: {
    enabled: true,
    baseProbability: 0.3,
    decayFactor: 0.7,
    capWindowMs: 6 * 60 * 60 * 1000, // 6 hours
    maxPerWindow: 3,
  },

  // Basic plan ($7/month)
  basic: {
    enabled: true,
    baseProbability: 0.5,
    decayFactor: 0.8,
    capWindowMs: 12 * 60 * 60 * 1000, // 12 hours
    maxPerWindow: 10,
  },

  // Basic Plus plan ($12/month)
  basic_plus: {
    enabled: true,
    baseProbability: 0.6,
    decayFactor: 0.85,
    capWindowMs: 12 * 60 * 60 * 1000, // 12 hours
    maxPerWindow: 20,
  },

  // Pro plan ($25/month)
  pro: {
    enabled: true,
    baseProbability: 0.8,
    decayFactor: 0.9,
    capWindowMs: 36 * 60 * 60 * 1000, // 36 hours
    maxPerWindow: 50,
  },

  // Admin - unlimited
  ADMIN: {
    enabled: true,
    baseProbability: 1.0,
    decayFactor: 1.0,
    capWindowMs: 36 * 60 * 60 * 1000, // 36 hours
    maxPerWindow: Number.POSITIVE_INFINITY,
  },
};

/**
 * Get voice configuration for a user based on their subscription.
 */
export function getVoicePlanConfig(
  subscriptionStatus?: string,
  userRole?: string,
  planId?: string | null,
  isGuest?: boolean,
): VoicePlanConfig {
  // Admin users have unlimited access
  if (userRole === "ADMIN" || userRole === "SUPER_ADMIN") {
    return VOICE_PLAN_CONFIG.ADMIN;
  }

  // Guest users have voice disabled
  if (isGuest) {
    return VOICE_PLAN_CONFIG.GUEST;
  }

  // Check specific plan ID first (from Clerk)
  if (planId && subscriptionStatus === "ACTIVE") {
    const normalizedPlanId = planId.toLowerCase();
    if (normalizedPlanId.includes("pro")) {
      return VOICE_PLAN_CONFIG.pro;
    }
    if (normalizedPlanId.includes("basic_plus")) {
      return VOICE_PLAN_CONFIG.basic_plus;
    }
    if (normalizedPlanId.includes("basic")) {
      return VOICE_PLAN_CONFIG.basic;
    }
  }

  // Fallback to basic if subscription is active but no specific plan
  if (subscriptionStatus === "ACTIVE") {
    return VOICE_PLAN_CONFIG.basic;
  }

  // Default to trial
  return VOICE_PLAN_CONFIG.TRIAL;
}
