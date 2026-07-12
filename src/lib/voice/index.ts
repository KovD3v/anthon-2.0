/**
 * Voice Generation Module
 *
 * Exports all voice-related functionality.
 */

export {
  getVoicePlanConfig,
  type VoiceCadenceConfig,
  type VoicePlanConfig,
} from "./config";
export {
  decideVoiceDelivery,
  getVoiceCapacityState,
  type VoiceCapacityState,
  type VoiceDecisionReason,
  type VoiceDecisionReasonCode,
  type VoiceDeliveryDecision,
  type VoiceDeliveryParams,
  type VoiceSuitability,
  type VoiceSuitabilityHint,
} from "./decision";
export {
  estimateVoiceCostUsd,
  generateVoice,
  getElevenLabsSubscription,
  getSystemLoad,
  isElevenLabsConfigured,
} from "./elevenlabs";
export {
  type FunnelBlockedAt,
  type FunnelParams,
  type FunnelResult,
  shouldGenerateVoice,
  trackVoiceUsage,
} from "./funnel";
export {
  detectVoiceRequestIntent,
  getVoiceUnavailability,
  type VoiceRequestIntent,
  type VoiceUnavailability,
  type VoiceUnavailableCode,
} from "./policy";
export {
  decideWebVoiceMode,
  type WebVoiceMode,
  type WebVoiceModeDecision,
  type WebVoiceModeParams,
} from "./preflight";
export {
  type ClassifySuitabilityParams,
  classifyVoiceSuitability,
  type DeterministicSuitabilityParams,
  getDeterministicVoiceSuitability,
} from "./suitability";
