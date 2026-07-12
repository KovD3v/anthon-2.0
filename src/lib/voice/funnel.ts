import type { Channel } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { LatencyLogger } from "@/lib/latency-logger";
import { createLogger } from "@/lib/logger";
import { incrementVoiceUsage } from "@/lib/rate-limit/usage";
import type { VoicePlanConfig } from "./config";
import {
  decideVoiceDelivery,
  type VoiceCapacityState,
  type VoiceDecisionReasonCode,
  type VoiceSuitability,
  type VoiceSuitabilityHint,
} from "./decision";
import {
  detectVoiceRequestIntent,
  getVoiceUnavailability,
  type VoiceUnavailability,
  type VoiceUnavailableCode,
} from "./policy";
import {
  classifyVoiceSuitability,
  getDeterministicVoiceSuitability,
} from "./suitability";

const voiceLogger = createLogger("voice");

export type FunnelBlockedAt =
  | "L1_PREFERENCE"
  | "L2_STRUCTURE"
  | "L3_SEMANTIC"
  | "L4_BUSINESS";

export interface FunnelResult {
  shouldGenerateVoice: boolean;
  blockedAt?: FunnelBlockedAt;
  reason?: string;
  explicitVoiceRequest?: boolean;
  unavailability?: VoiceUnavailability;
  category: VoiceSuitability;
  capacityState: VoiceCapacityState;
  reasonCode: VoiceDecisionReasonCode;
}

export interface FunnelParams {
  userId: string;
  userMessage: string;
  assistantText: string;
  conversationContext?: Array<{ role: string; content: string }>;
  userPreferences: { voiceEnabled?: boolean | null };
  planConfig: VoicePlanConfig;
  systemLoad: number | Promise<number> | (() => Promise<number>);
  planId?: string | null;
  channel?: Channel;
  chatId?: string | null;
  excludeMessageId?: string;
  suitabilityHint?: VoiceSuitabilityHint;
}

function getLegacyBlockedAt(
  code: VoiceDecisionReasonCode,
): FunnelBlockedAt | undefined {
  if (code === "PLAN_NOT_ELIGIBLE" || code === "QUIET_MODE") {
    return "L1_PREFERENCE";
  }
  if (code === "TEXT_REQUIRED") return "L2_STRUCTURE";
  if (
    code === "EXPLICIT_TEXT" ||
    code === "TEXT_PREFERRED" ||
    code === "LOW_SUITABILITY_CONFIDENCE"
  ) {
    return "L3_SEMANTIC";
  }
  if (
    code !== "EXPLICIT_VOICE" &&
    code !== "STRONG_MOMENT" &&
    code !== "NATURAL_MOMENT" &&
    code !== "ANTI_DROUGHT"
  ) {
    return "L4_BUSINESS";
  }
  return undefined;
}

function getExplicitUnavailability(
  code: VoiceDecisionReasonCode,
): VoiceUnavailableCode | null {
  if (code === "PLAN_NOT_ELIGIBLE") return "PLAN_NOT_ELIGIBLE";
  if (code === "QUIET_MODE") return "QUIET_MODE";
  if (code === "QUOTA_REACHED") return "QUOTA_REACHED";
  if (code === "PROVIDER_RED") return "PROVIDER_UNAVAILABLE";
  return null;
}

export async function shouldGenerateVoice(
  params: FunnelParams,
): Promise<FunnelResult> {
  return await LatencyLogger.measure("Voice: Full Funnel", async () => {
    const requestIntent = detectVoiceRequestIntent(params.userMessage);
    const ineligibleSuitability =
      !params.planConfig.enabled ||
      params.userPreferences.voiceEnabled === false
        ? ({
            category: "TEXT_PREFERRED",
            confidence: 1,
            reason: "eligibility_fast_path",
          } satisfies VoiceSuitabilityHint)
        : null;
    const deterministicSuitability =
      params.suitabilityHint ??
      ineligibleSuitability ??
      getDeterministicVoiceSuitability({
        userMessage: params.userMessage,
        assistantText: params.assistantText,
        requestIntent,
      });
    const suitability =
      deterministicSuitability ??
      (() =>
        classifyVoiceSuitability({
          userId: params.userId,
          userMessage: params.userMessage,
          assistantText: params.assistantText,
          conversationContext: params.conversationContext,
        }));
    const decision = await decideVoiceDelivery({
      userId: params.userId,
      userPreferences: params.userPreferences,
      planConfig: params.planConfig,
      requestIntent,
      suitability,
      systemLoad: params.systemLoad,
      channel: params.channel,
      chatId: params.chatId,
      excludeMessageId: params.excludeMessageId,
    });
    const blockedAt = getLegacyBlockedAt(decision.reason.code);
    const unavailableCode = getExplicitUnavailability(decision.reason.code);

    voiceLogger.info(
      decision.shouldGenerateVoice
        ? "voice.funnel.allowed"
        : "voice.funnel.blocked",
      decision.reason.message,
      {
        userId: params.userId,
        category: decision.category,
        capacityState: decision.capacityState,
        reasonCode: decision.reason.code,
      },
    );

    return {
      shouldGenerateVoice: decision.shouldGenerateVoice,
      category: decision.category,
      capacityState: decision.capacityState,
      reasonCode: decision.reason.code,
      reason: decision.reason.message,
      ...(blockedAt && { blockedAt }),
      ...(decision.explicitVoiceRequest && { explicitVoiceRequest: true }),
      ...(decision.explicitVoiceRequest &&
        !decision.shouldGenerateVoice &&
        unavailableCode && {
          unavailability: getVoiceUnavailability(unavailableCode),
        }),
    };
  });
}

export async function trackVoiceUsage(
  userId: string,
  characterCount: number,
  channel: Channel = "TELEGRAM",
  costUsd?: number,
): Promise<void> {
  await prisma.voiceUsage.create({
    data: { userId, characterCount, costUsd, channel },
  });

  if (costUsd && costUsd > 0) {
    await incrementVoiceUsage(userId, costUsd);
  }
}
