import type { VoicePlanConfig } from "./config";
import {
  decideVoiceDelivery,
  type VoiceCapacityState,
  type VoiceDecisionReasonCode,
  type VoiceSuitability,
  type VoiceSuitabilityHint,
} from "./decision";
import { getSystemLoad } from "./elevenlabs";
import { detectVoiceRequestIntent } from "./policy";
import {
  classifyVoiceSuitability,
  getDeterministicVoiceSuitability,
} from "./suitability";

export type WebVoiceMode = "TEXT" | "VOICE";

export interface WebVoiceModeDecision {
  mode: WebVoiceMode;
  reason: string;
  source: "deterministic" | "classifier";
  category: VoiceSuitability;
  capacityState: VoiceCapacityState;
  reasonCode: VoiceDecisionReasonCode;
  suitabilityReason?: string;
  suitabilityConfidence?: number;
}

export interface WebVoiceModeParams {
  userId: string;
  userMessage: string;
  recentMessages?: Array<{ role: string; content: string }>;
  userPreferences: { voiceEnabled?: boolean | null };
  planConfig: VoicePlanConfig;
  planId?: string | null;
  chatId?: string | null;
  channel?: "WEB";
  hasAttachments?: boolean;
  timeoutMs?: number;
  suitabilityHint?: VoiceSuitabilityHint;
}

export async function decideWebVoiceMode(
  params: WebVoiceModeParams,
): Promise<WebVoiceModeDecision> {
  const requestIntent = detectVoiceRequestIntent(params.userMessage);
  const ineligibleSuitability =
    !params.planConfig.enabled || params.userPreferences.voiceEnabled === false
      ? ({
          category: "TEXT_PREFERRED",
          confidence: 1,
          reason: "eligibility_fast_path",
        } satisfies VoiceSuitabilityHint)
      : null;
  const deterministic =
    params.suitabilityHint ??
    ineligibleSuitability ??
    getDeterministicVoiceSuitability({
      userMessage: params.userMessage,
      requestIntent,
    });
  let classifierInvoked = false;
  let classifiedSuitability: VoiceSuitabilityHint | undefined;
  const suitability =
    deterministic ??
    (async () => {
      classifierInvoked = true;
      classifiedSuitability = await classifyVoiceSuitability({
        userId: params.userId,
        userMessage: params.userMessage,
        conversationContext: params.recentMessages,
        timeoutMs: params.timeoutMs,
      });
      return classifiedSuitability;
    });
  const decision = await decideVoiceDelivery({
    userId: params.userId,
    userPreferences: params.userPreferences,
    planConfig: params.planConfig,
    requestIntent,
    suitability,
    systemLoad: getSystemLoad,
    channel: "WEB",
    chatId: params.chatId,
  });

  return {
    mode: decision.shouldGenerateVoice ? "VOICE" : "TEXT",
    reason: decision.reason.message,
    source: classifierInvoked ? "classifier" : "deterministic",
    category: decision.category,
    capacityState: decision.capacityState,
    reasonCode: decision.reason.code,
    suitabilityReason: (deterministic ?? classifiedSuitability)?.reason,
    suitabilityConfidence: (deterministic ?? classifiedSuitability)?.confidence,
  };
}
