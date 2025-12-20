/**
 * Voice Generation Module
 *
 * Exports all voice-related functionality.
 */

export { getVoicePlanConfig, type VoicePlanConfig } from "./config";
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
