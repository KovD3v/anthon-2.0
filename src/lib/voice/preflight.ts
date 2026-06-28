import { generateText, Output } from "ai";
import { z } from "zod";
import { openrouter } from "@/lib/ai/providers/openrouter";
import { getOpenRouterProviderOptionsForModel } from "@/lib/ai/providers/openrouter-routing";
import { trackSupportAiUsage } from "@/lib/ai/usage-meter";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { parseCanonicalPlanFromPlanId } from "@/lib/plans";
import type { VoicePlanConfig } from "./config";
import { getSystemLoad } from "./elevenlabs";

const voiceLogger = createLogger("voice");

export type WebVoiceMode = "TEXT" | "VOICE";

export interface WebVoiceModeDecision {
  mode: WebVoiceMode;
  reason: string;
  source: "deterministic" | "classifier";
}

export interface WebVoiceModeParams {
  userId: string;
  userMessage: string;
  recentMessages?: Array<{ role: string; content: string }>;
  userPreferences: { voiceEnabled?: boolean | null };
  planConfig: VoicePlanConfig;
  planId?: string | null;
  hasAttachments?: boolean;
  timeoutMs?: number;
}

const DEFAULT_PREFLIGHT_MODEL =
  process.env.VOICE_PREFLIGHT_MODEL_ID || "qwen/qwen3.5-flash-02-23";
const DEFAULT_PREFLIGHT_TIMEOUT_MS = 1000;
const MIN_CLASSIFIER_CONFIDENCE = 0.65;

const explicitVoiceRegex =
  /\b(vocale|audio|nota vocale|messaggio vocale|mandamelo a voce|rispondimi a voce)\b/i;
const explicitTextRegex =
  /\b(scrivi|scritto|testo|lista|schema|tabella|link|codice|markdown)\b/i;
const voiceCandidateRegex =
  /\b(ansia|ansioso|calma|calmo|calmarmi|teso|tensione|stress|paura|panico|motiv|carica|incoraggia|respiro|respira|supporto|conforto|colpa|giù|male)\b/i;

const classifierSchema = z.object({
  mode: z.enum(["TEXT", "VOICE"]),
  reason: z.enum([
    "explicit_voice_request",
    "explicit_text_request",
    "conversational_support",
    "emotional_support",
    "brief_motivation",
    "technical_or_structured",
    "needs_visual_text",
    "unclear",
  ]),
  confidence: z.number().min(0).max(1),
});

export async function decideWebVoiceMode(
  params: WebVoiceModeParams,
): Promise<WebVoiceModeDecision> {
  const deterministic = await runDeterministicPreflight(params);
  if (deterministic) {
    return deterministic;
  }

  try {
    const context =
      params.recentMessages
        ?.slice(-4)
        .map((message) => `${message.role}: ${message.content.slice(0, 180)}`)
        .join("\n") || "No recent context.";

    const result = await generateText({
      model: openrouter(DEFAULT_PREFLIGHT_MODEL),
      output: Output.object({ schema: classifierSchema }),
      temperature: 0,
      maxOutputTokens: 80,
      timeout: { totalMs: params.timeoutMs ?? DEFAULT_PREFLIGHT_TIMEOUT_MS },
      providerOptions: {
        openrouter: getOpenRouterProviderOptionsForModel(
          DEFAULT_PREFLIGHT_MODEL,
        ),
      },
      prompt: `Decide whether Anthon should answer the next WEB chat turn as TEXT or VOICE.

Return VOICE only when a short spoken reply would feel natural, useful, and not surprising.
Return TEXT when the answer may need lists, markdown, links, technical details, exact instructions, attachments, or if unsure.

Recent conversation:
${context}

User message:
"${params.userMessage}"`,
    });

    const output = result.output;
    await trackSupportAiUsage({
      userId: params.userId,
      modelId: DEFAULT_PREFLIGHT_MODEL,
      usage: result.usage,
      providerMetadata: result.providerMetadata,
    });

    if (!output || output.mode === "TEXT") {
      return {
        mode: "TEXT",
        reason: output?.reason
          ? `Classifier: ${output.reason}`
          : "Classifier returned text",
        source: "classifier",
      };
    }

    if (output.confidence < MIN_CLASSIFIER_CONFIDENCE) {
      return {
        mode: "TEXT",
        reason: "Classifier confidence below threshold",
        source: "classifier",
      };
    }

    const businessResult = await checkBusinessGate(params);
    if (!businessResult.pass) {
      return {
        mode: "TEXT",
        reason: businessResult.reason,
        source: "deterministic",
      };
    }

    return {
      mode: "VOICE",
      reason: `Classifier: ${output.reason}`,
      source: "classifier",
    };
  } catch (error) {
    voiceLogger.warn(
      "voice.preflight.classifier_failed",
      "Web voice preflight classifier failed; defaulting to text",
      { error },
    );
    return {
      mode: "TEXT",
      reason: "Classifier failed or timed out",
      source: "classifier",
    };
  }
}

async function runDeterministicPreflight(
  params: WebVoiceModeParams,
): Promise<WebVoiceModeDecision | null> {
  if (!params.planConfig.enabled) {
    return {
      mode: "TEXT",
      reason: "Voice not enabled for plan",
      source: "deterministic",
    };
  }

  if (params.userPreferences.voiceEnabled === false) {
    return {
      mode: "TEXT",
      reason: "Quiet mode enabled",
      source: "deterministic",
    };
  }

  if (params.hasAttachments) {
    return {
      mode: "TEXT",
      reason: "Attachments require visible context",
      source: "deterministic",
    };
  }

  const userMessage = params.userMessage.trim();
  if (!userMessage) {
    return {
      mode: "TEXT",
      reason: "Empty text message",
      source: "deterministic",
    };
  }

  if (explicitTextRegex.test(userMessage)) {
    return {
      mode: "TEXT",
      reason: "User explicitly requested text",
      source: "deterministic",
    };
  }

  if (explicitVoiceRegex.test(userMessage)) {
    const businessResult = await checkBusinessGate(params);
    if (!businessResult.pass) {
      return {
        mode: "TEXT",
        reason: businessResult.reason,
        source: "deterministic",
      };
    }

    return {
      mode: "VOICE",
      reason: "User explicitly requested voice",
      source: "deterministic",
    };
  }

  if (!voiceCandidateRegex.test(userMessage)) {
    return {
      mode: "TEXT",
      reason: "No voice intent detected",
      source: "deterministic",
    };
  }

  return null;
}

async function checkBusinessGate(params: WebVoiceModeParams): Promise<{
  pass: boolean;
  reason: string;
}> {
  const load = await getSystemLoad();
  const isPro = parseCanonicalPlanFromPlanId(params.planId) === "PRO";
  if (load < 0.3 && !isPro) {
    return { pass: false, reason: "System load critical, pro users only" };
  }

  const windowStart = new Date(Date.now() - params.planConfig.capWindowMs);
  const voiceCount = await prisma.voiceUsage.count({
    where: {
      userId: params.userId,
      generatedAt: { gte: windowStart },
    },
  });

  if (voiceCount >= params.planConfig.maxPerWindow) {
    return { pass: false, reason: "Voice cap reached for window" };
  }

  const probability =
    params.planConfig.baseProbability *
    params.planConfig.decayFactor ** voiceCount *
    load;

  if (Math.random() >= probability) {
    return { pass: false, reason: "Voice probability gate returned text" };
  }

  return { pass: true, reason: "Voice business gate passed" };
}
