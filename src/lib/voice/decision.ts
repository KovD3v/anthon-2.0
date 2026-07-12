import type { Channel } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import type { VoicePlanConfig } from "./config";
import type { VoiceRequestIntent } from "./policy";

export type VoiceSuitability =
  | "VOICE_REQUIRED"
  | "VOICE_STRONG"
  | "VOICE_NATURAL"
  | "TEXT_PREFERRED"
  | "TEXT_REQUIRED"
  | "TEXT_REQUESTED";

export type VoiceCapacityState = "GREEN" | "YELLOW" | "RED";

export type VoiceDecisionReasonCode =
  | "PLAN_NOT_ELIGIBLE"
  | "QUIET_MODE"
  | "EXPLICIT_TEXT"
  | "TEXT_REQUIRED"
  | "TEXT_PREFERRED"
  | "PROVIDER_RED"
  | "PROVIDER_YELLOW"
  | "QUOTA_REACHED"
  | "AUTOMATIC_BUDGET_REACHED"
  | "LOW_SUITABILITY_CONFIDENCE"
  | "CADENCE_COOLDOWN"
  | "ANTI_SPAM_LIMIT"
  | "CONSECUTIVE_AUDIO_LIMIT"
  | "EXPLICIT_VOICE"
  | "STRONG_MOMENT"
  | "NATURAL_MOMENT"
  | "ANTI_DROUGHT";

export interface VoiceSuitabilityHint {
  category: VoiceSuitability;
  confidence: number;
  reason?: string;
}

export interface VoiceDecisionReason {
  code: VoiceDecisionReasonCode;
  message: string;
}

export interface VoiceDeliveryDecision {
  shouldGenerateVoice: boolean;
  category: VoiceSuitability;
  capacityState: VoiceCapacityState;
  reason: VoiceDecisionReason;
  explicitVoiceRequest: boolean;
}

export interface VoiceDeliveryParams {
  userId: string;
  userPreferences: { voiceEnabled?: boolean | null };
  planConfig: VoicePlanConfig;
  requestIntent: VoiceRequestIntent;
  suitability: VoiceSuitabilityHint | (() => Promise<VoiceSuitabilityHint>);
  systemLoad: number | Promise<number> | (() => Promise<number>);
  channel?: Channel;
  chatId?: string | null;
  excludeMessageId?: string;
  now?: Date;
}

interface CadenceHistory {
  voiceCountInPlanWindow: number;
  voiceCountLastHour: number;
  turnsSinceAudio: number;
  millisecondsSinceAudio: number;
  consecutiveAudio: number;
}

const REASON_MESSAGES: Record<VoiceDecisionReasonCode, string> = {
  PLAN_NOT_ELIGIBLE: "Voice not enabled for plan",
  QUIET_MODE: "Quiet mode enabled",
  EXPLICIT_TEXT: "User explicitly requested text",
  TEXT_REQUIRED: "Response requires visible text",
  TEXT_PREFERRED: "Text is the better delivery format",
  PROVIDER_RED: "Voice provider capacity is unavailable",
  PROVIDER_YELLOW: "Voice provider capacity is constrained",
  QUOTA_REACHED: "Voice cap reached for window",
  AUTOMATIC_BUDGET_REACHED:
    "Automatic voice budget reserved for explicit requests",
  LOW_SUITABILITY_CONFIDENCE: "Voice suitability confidence below threshold",
  CADENCE_COOLDOWN: "Conversation voice cooldown is active",
  ANTI_SPAM_LIMIT: "Automatic voice hourly limit reached",
  CONSECUTIVE_AUDIO_LIMIT: "Consecutive audio limit reached",
  EXPLICIT_VOICE: "User explicitly requested voice",
  STRONG_MOMENT: "Voice adds value for this conversational moment",
  NATURAL_MOMENT: "Voice fits the natural conversation cadence",
  ANTI_DROUGHT: "Voice fits after an extended text-only exchange",
};

export function getVoiceCapacityState(systemLoad: number): VoiceCapacityState {
  if (systemLoad < 0.05) return "RED";
  if (systemLoad < 0.3) return "YELLOW";
  return "GREEN";
}

function result(
  shouldGenerateVoice: boolean,
  category: VoiceSuitability,
  capacityState: VoiceCapacityState,
  code: VoiceDecisionReasonCode,
  explicitVoiceRequest: boolean,
): VoiceDeliveryDecision {
  return {
    shouldGenerateVoice,
    category,
    capacityState,
    reason: { code, message: REASON_MESSAGES[code] },
    explicitVoiceRequest,
  };
}

async function getCadenceHistory(
  params: VoiceDeliveryParams,
  now: Date,
): Promise<CadenceHistory> {
  const planWindowStart = new Date(
    now.getTime() - params.planConfig.capWindowMs,
  );
  const hourStart = new Date(now.getTime() - 60 * 60 * 1000);
  const messageScope =
    params.channel === "WEB" && params.chatId
      ? { chatId: params.chatId }
      : params.channel
        ? { channel: params.channel }
        : {};

  const [voiceCountInPlanWindow, voiceCountLastHour, messages] =
    await Promise.all([
      prisma.voiceUsage.count({
        where: { userId: params.userId, generatedAt: { gte: planWindowStart } },
      }),
      prisma.voiceUsage.count({
        where: { userId: params.userId, generatedAt: { gte: hourStart } },
      }),
      prisma.message.findMany({
        where: {
          userId: params.userId,
          role: "ASSISTANT",
          direction: "OUTBOUND",
          deletedAt: null,
          ...(params.excludeMessageId
            ? { id: { not: params.excludeMessageId } }
            : {}),
          ...messageScope,
        },
        orderBy: { createdAt: "desc" },
        take: Math.max(params.planConfig.cadence.antiDroughtTurns + 2, 12),
        select: { type: true, createdAt: true },
      }),
    ]);

  const lastAudioIndex = messages.findIndex(
    (message) => message.type === "AUDIO",
  );
  const lastAudio = lastAudioIndex >= 0 ? messages[lastAudioIndex] : undefined;
  const consecutiveAudio = messages.findIndex(
    (message) => message.type !== "AUDIO",
  );

  return {
    voiceCountInPlanWindow,
    voiceCountLastHour,
    turnsSinceAudio: lastAudioIndex < 0 ? messages.length : lastAudioIndex,
    millisecondsSinceAudio: lastAudio
      ? Math.max(0, now.getTime() - lastAudio.createdAt.getTime())
      : Number.POSITIVE_INFINITY,
    consecutiveAudio: consecutiveAudio < 0 ? messages.length : consecutiveAudio,
  };
}

export async function decideVoiceDelivery(
  params: VoiceDeliveryParams,
): Promise<VoiceDeliveryDecision> {
  const explicitVoiceRequest = params.requestIntent === "VOICE";
  let capacityState: VoiceCapacityState = "GREEN";
  let suitability =
    typeof params.suitability === "function" ? null : params.suitability;
  let category: VoiceSuitability = suitability?.category ?? "VOICE_NATURAL";

  if (params.requestIntent === "VOICE") category = "VOICE_REQUIRED";
  if (params.requestIntent === "TEXT") category = "TEXT_REQUESTED";

  if (!params.planConfig.enabled) {
    return result(
      false,
      category,
      capacityState,
      "PLAN_NOT_ELIGIBLE",
      explicitVoiceRequest,
    );
  }
  if (params.userPreferences.voiceEnabled === false) {
    return result(
      false,
      category,
      capacityState,
      "QUIET_MODE",
      explicitVoiceRequest,
    );
  }
  if (category === "TEXT_REQUESTED") {
    return result(false, category, capacityState, "EXPLICIT_TEXT", false);
  }
  if (category === "TEXT_REQUIRED") {
    return result(
      false,
      category,
      capacityState,
      "TEXT_REQUIRED",
      explicitVoiceRequest,
    );
  }
  if (category === "TEXT_PREFERRED") {
    return result(
      false,
      category,
      capacityState,
      "TEXT_PREFERRED",
      explicitVoiceRequest,
    );
  }
  const systemLoad =
    typeof params.systemLoad === "function"
      ? await params.systemLoad()
      : typeof params.systemLoad === "number"
        ? params.systemLoad
        : await params.systemLoad;
  capacityState = getVoiceCapacityState(systemLoad);
  if (capacityState === "RED") {
    return result(
      false,
      category,
      capacityState,
      "PROVIDER_RED",
      explicitVoiceRequest,
    );
  }

  const history = await getCadenceHistory(params, params.now ?? new Date());
  if (history.voiceCountInPlanWindow >= params.planConfig.maxPerWindow) {
    return result(
      false,
      category,
      capacityState,
      "QUOTA_REACHED",
      explicitVoiceRequest,
    );
  }
  if (explicitVoiceRequest) {
    return result(true, category, capacityState, "EXPLICIT_VOICE", true);
  }

  const automaticLimit = Number.isFinite(params.planConfig.maxPerWindow)
    ? Math.floor(
        params.planConfig.maxPerWindow * params.planConfig.automaticBudgetRatio,
      )
    : Number.POSITIVE_INFINITY;
  if (history.voiceCountInPlanWindow >= automaticLimit) {
    return result(
      false,
      category,
      capacityState,
      "AUTOMATIC_BUDGET_REACHED",
      false,
    );
  }
  if (
    history.voiceCountLastHour >= params.planConfig.cadence.maxAutomaticPerHour
  ) {
    return result(false, category, capacityState, "ANTI_SPAM_LIMIT", false);
  }
  if (
    history.consecutiveAudio >= params.planConfig.cadence.maxConsecutiveAudio
  ) {
    return result(
      false,
      category,
      capacityState,
      "CONSECUTIVE_AUDIO_LIMIT",
      false,
    );
  }

  if (!suitability) {
    suitability = await (
      params.suitability as () => Promise<VoiceSuitabilityHint>
    )();
  }
  category = suitability.category;
  if (category === "TEXT_REQUIRED") {
    return result(false, category, capacityState, "TEXT_REQUIRED", false);
  }
  if (category === "TEXT_PREFERRED") {
    return result(false, category, capacityState, "TEXT_PREFERRED", false);
  }
  if (capacityState === "YELLOW" && category !== "VOICE_STRONG") {
    return result(false, category, capacityState, "PROVIDER_YELLOW", false);
  }

  const isAntiDrought =
    category === "VOICE_NATURAL" &&
    history.turnsSinceAudio >= params.planConfig.cadence.antiDroughtTurns;
  const confidenceThreshold = isAntiDrought
    ? params.planConfig.cadence.antiDroughtConfidence
    : category === "VOICE_STRONG"
      ? 0.6
      : params.planConfig.cadence.naturalConfidence;
  if (suitability.confidence < confidenceThreshold) {
    return result(
      false,
      category,
      capacityState,
      "LOW_SUITABILITY_CONFIDENCE",
      false,
    );
  }

  const minTurns =
    category === "VOICE_STRONG"
      ? params.planConfig.cadence.strongMinTurns
      : params.planConfig.cadence.naturalMinTurns;
  const cooldownMs =
    category === "VOICE_STRONG"
      ? params.planConfig.cadence.strongCooldownMs
      : params.planConfig.cadence.naturalCooldownMs;
  if (
    history.turnsSinceAudio < minTurns &&
    history.millisecondsSinceAudio < cooldownMs
  ) {
    return result(false, category, capacityState, "CADENCE_COOLDOWN", false);
  }

  return result(
    true,
    category,
    capacityState,
    isAntiDrought
      ? "ANTI_DROUGHT"
      : category === "VOICE_STRONG"
        ? "STRONG_MOMENT"
        : "NATURAL_MOMENT",
    false,
  );
}
