import { generateText, Output } from "ai";
import { z } from "zod";
import { openrouter } from "@/lib/ai/providers/openrouter";
import { getOpenRouterProviderOptionsForModel } from "@/lib/ai/providers/openrouter-routing";
import { trackSupportAiUsage } from "@/lib/ai/usage-meter";
import { createLogger } from "@/lib/logger";
import type { VoiceSuitabilityHint } from "./decision";
import type { VoiceRequestIntent } from "./policy";

const voiceLogger = createLogger("voice");
const DEFAULT_SUITABILITY_MODEL =
  process.env.VOICE_SUITABILITY_MODEL_ID ||
  process.env.VOICE_PREFLIGHT_MODEL_ID ||
  "qwen/qwen3.5-flash-02-23";
const DEFAULT_TIMEOUT_MS = 1000;
const CODE_BLOCK_REGEX = /```[\s\S]*?```/;
const TABLE_REGEX = /\|[-:]+\|/;
const DENSE_LIST_REGEX = /(?:^|\n)\s*(?:[-*]|\d+[.)])\s+/gm;
const EXACT_COMMAND_REGEX =
  /(?:^|\n)\s*(?:bun|npm|npx|pnpm|yarn|git|curl|docker|kubectl)\s+/im;
const STRONG_MOMENT_REGEX =
  /\b(ansia|ansioso|panico|paura|stress|calma|calmarmi|respira|respiro|conforto|supporto|motivazione|incoraggia|overwhelm(?:ed|ing)?|anxious|panic|afraid|scared|breathe|breathing|comfort|support|encourag(?:e|ement)|grief|grieving)\b/i;

const suitabilitySchema = z.object({
  category: z.enum([
    "VOICE_STRONG",
    "VOICE_NATURAL",
    "TEXT_PREFERRED",
    "TEXT_REQUIRED",
  ]),
  reason: z.enum([
    "emotional_support",
    "brief_motivation",
    "reflective_coaching",
    "storytelling",
    "natural_conversation",
    "short_factual",
    "technical_or_structured",
    "needs_visual_precision",
    "unclear",
  ]),
  confidence: z.number().min(0).max(1),
});

export interface DeterministicSuitabilityParams {
  userMessage: string;
  requestIntent: VoiceRequestIntent;
  assistantText?: string;
}

export interface ClassifySuitabilityParams {
  userId: string;
  userMessage: string;
  assistantText?: string;
  conversationContext?: Array<{ role: string; content: string }>;
  timeoutMs?: number;
}

export function getDeterministicVoiceSuitability(
  params: DeterministicSuitabilityParams,
): VoiceSuitabilityHint | null {
  if (params.requestIntent === "VOICE") {
    return {
      category: "VOICE_REQUIRED",
      confidence: 1,
      reason: "explicit_voice",
    };
  }
  if (params.requestIntent === "TEXT") {
    return {
      category: "TEXT_REQUESTED",
      confidence: 1,
      reason: "explicit_text",
    };
  }
  if (!params.userMessage.trim()) {
    return { category: "TEXT_PREFERRED", confidence: 1, reason: "empty" };
  }

  const assistantText = params.assistantText ?? "";
  const denseListCount = assistantText.match(DENSE_LIST_REGEX)?.length ?? 0;
  if (
    CODE_BLOCK_REGEX.test(params.userMessage) ||
    CODE_BLOCK_REGEX.test(assistantText) ||
    TABLE_REGEX.test(assistantText) ||
    EXACT_COMMAND_REGEX.test(params.userMessage) ||
    EXACT_COMMAND_REGEX.test(assistantText) ||
    denseListCount >= 4
  ) {
    return {
      category: "TEXT_REQUIRED",
      confidence: 1,
      reason: "visual_precision_required",
    };
  }
  if (assistantText && assistantText.trim().length < 15) {
    return { category: "TEXT_PREFERRED", confidence: 1, reason: "too_brief" };
  }
  if (
    STRONG_MOMENT_REGEX.test(
      `${params.userMessage}\n${params.assistantText ?? ""}`,
    )
  ) {
    return {
      category: "VOICE_STRONG",
      confidence: 0.9,
      reason: "strong_conversational_signal",
    };
  }
  return null;
}

export async function classifyVoiceSuitability(
  params: ClassifySuitabilityParams,
): Promise<VoiceSuitabilityHint> {
  try {
    const context =
      params.conversationContext
        ?.slice(-4)
        .map((message) => `${message.role}: ${message.content.slice(0, 180)}`)
        .join("\n") || "No recent context.";
    const result = await generateText({
      model: openrouter(DEFAULT_SUITABILITY_MODEL),
      output: Output.object({ schema: suitabilitySchema }),
      temperature: 0,
      maxOutputTokens: 80,
      timeout: { totalMs: params.timeoutMs ?? DEFAULT_TIMEOUT_MS },
      providerOptions: {
        openrouter: getOpenRouterProviderOptionsForModel(
          DEFAULT_SUITABILITY_MODEL,
        ),
      },
      prompt: `Classify the best delivery format for this coaching response.

VOICE_STRONG: emotional support, grounding, motivation, or a moment where tone materially helps.
VOICE_NATURAL: reflective coaching, storytelling, or natural conversational explanation.
TEXT_REQUIRED: code, dense data, exact commands, complex tables, or content that must be seen precisely.
TEXT_PREFERRED: short factual or coordination content where audio adds little value.

Do not reject voice merely because of one link, light formatting, an attachment, or the absence of emotional keywords. Judge whether spoken delivery improves this conversational moment.

Recent conversation:
${context}

User: ${params.userMessage}
${params.assistantText ? `Assistant: ${params.assistantText.slice(0, 700)}` : "Assistant response has not been generated yet."}`,
    });
    await trackSupportAiUsage({
      userId: params.userId,
      modelId: DEFAULT_SUITABILITY_MODEL,
      usage: result.usage,
      providerMetadata: result.providerMetadata,
    });
    return (
      result.output ?? {
        category: "TEXT_PREFERRED",
        confidence: 0,
        reason: "classifier_empty",
      }
    );
  } catch (error) {
    voiceLogger.warn(
      "voice.suitability.classifier_failed",
      "Voice suitability classification failed; defaulting to text",
      { error },
    );
    return {
      category: "TEXT_PREFERRED",
      confidence: 0,
      reason: "classifier_failed",
    };
  }
}
