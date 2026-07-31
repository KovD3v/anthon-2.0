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
export type {
  VoiceCapacityState,
  VoiceDecisionReason,
  VoiceDecisionReasonCode,
  VoiceDeliveryDecision,
  VoiceDeliveryParams,
  VoiceSuitability,
  VoiceSuitabilityHint,
} from "./decision";
export {
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
export type {
  ClassifySuitabilityParams,
  DeterministicSuitabilityParams,
  VoiceClassifierDiagnostics,
  VoiceClassifierFailureCode,
  VoiceSuitabilityClassification,
} from "./suitability";
