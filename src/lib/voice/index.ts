/**
 * Voice Generation Module
 *
 * Exports all voice-related functionality.
 */

export { getVoicePlanConfig, type VoicePlanConfig } from "./config";
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
} from "./preflight";
