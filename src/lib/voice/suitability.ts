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
  "google/gemini-2.5-flash-lite";
const DEFAULT_TIMEOUT_MS = 1500;
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

export type VoiceClassifierFailureCode =
  | "timeout"
  | "provider_error"
  | "invalid_output"
  | "configuration_error"
  | "unknown";

export interface VoiceClassifierDiagnostics {
  outcome: "success" | "empty" | "failed";
  model: string;
  durationMs: number;
  timeoutMs: number;
  failureCode?: VoiceClassifierFailureCode;
  errorName?: string;
  causeName?: string;
  statusCode?: number;
  retryable?: boolean;
}

export interface VoiceSuitabilityClassification extends VoiceSuitabilityHint {
  classifierDiagnostics: VoiceClassifierDiagnostics;
}

function getClassifierProviderOptions(modelId: string) {
  const providerOptions = getOpenRouterProviderOptionsForModel(modelId);
  const provider =
    providerOptions.provider && typeof providerOptions.provider === "object"
      ? providerOptions.provider
      : {};

  return {
    ...providerOptions,
    provider: {
      ...provider,
      require_parameters: true,
    },
  };
}

const INVALID_OUTPUT_ERROR_NAMES = new Set([
  "AI_NoObjectGeneratedError",
  "AI_NoOutputGeneratedError",
  "AI_JSONParseError",
  "AI_TypeValidationError",
  "AI_InvalidResponseDataError",
]);

const CONFIGURATION_ERROR_NAMES = new Set([
  "AI_LoadAPIKeyError",
  "AI_LoadSettingError",
  "AI_NoSuchModelError",
  "AI_NoSuchProviderError",
]);

function asErrorRecord(error: unknown): Record<string, unknown> | null {
  return error && typeof error === "object"
    ? (error as Record<string, unknown>)
    : null;
}

function getErrorName(error: unknown): string | undefined {
  const record = asErrorRecord(error);
  return typeof record?.name === "string" ? record.name : undefined;
}

function getErrorMessage(error: unknown): string {
  const record = asErrorRecord(error);
  return typeof record?.message === "string" ? record.message : "";
}

function getNestedClassifierError(error: unknown): unknown {
  const record = asErrorRecord(error);
  return record?.lastError ?? record?.cause;
}

function getClassifierErrorChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && chain.length < 5 && !seen.has(current)) {
    chain.push(current);
    seen.add(current);
    current = getNestedClassifierError(current);
  }

  return chain;
}

function classifyClassifierFailure(
  errorChain: unknown[],
): VoiceClassifierFailureCode {
  const names = errorChain.map(getErrorName).filter(Boolean) as string[];
  const messages = errorChain.map(getErrorMessage).join(" ").toLowerCase();
  const records = errorChain.map(asErrorRecord).filter(Boolean) as Record<
    string,
    unknown
  >[];
  const statusCode = records.find(
    (record) => typeof record.statusCode === "number",
  )?.statusCode;
  const retryReason = records.find(
    (record) => typeof record.reason === "string",
  )?.reason;

  if (
    names.some((name) => name === "AbortError" || name === "TimeoutError") ||
    retryReason === "abort" ||
    statusCode === 408 ||
    statusCode === 504 ||
    /timed?\s*out|timeout|aborted/.test(messages)
  ) {
    return "timeout";
  }
  if (names.some((name) => INVALID_OUTPUT_ERROR_NAMES.has(name))) {
    return "invalid_output";
  }
  if (names.some((name) => CONFIGURATION_ERROR_NAMES.has(name))) {
    return "configuration_error";
  }
  if (
    typeof statusCode === "number" ||
    names.some(
      (name) =>
        name === "AI_APICallError" ||
        name.includes("Provider") ||
        name.includes("API"),
    )
  ) {
    return "provider_error";
  }
  return "unknown";
}

function buildFailureDiagnostics(
  error: unknown,
  startedAtMs: number,
  timeoutMs: number,
): VoiceClassifierDiagnostics {
  const errorChain = getClassifierErrorChain(error);
  const records = errorChain.map(asErrorRecord).filter(Boolean) as Record<
    string,
    unknown
  >[];
  const statusCode = records.find(
    (record) => typeof record.statusCode === "number",
  )?.statusCode;
  const retryable = records.find(
    (record) => typeof record.isRetryable === "boolean",
  )?.isRetryable;
  const errorName = getErrorName(errorChain[0]);
  const causeName = getErrorName(errorChain[errorChain.length - 1]);

  return {
    outcome: "failed",
    model: DEFAULT_SUITABILITY_MODEL,
    durationMs: Math.max(0, Date.now() - startedAtMs),
    timeoutMs,
    failureCode: classifyClassifierFailure(errorChain),
    ...(errorName ? { errorName } : {}),
    ...(causeName && causeName !== errorName ? { causeName } : {}),
    ...(typeof statusCode === "number" ? { statusCode } : {}),
    ...(typeof retryable === "boolean" ? { retryable } : {}),
  };
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
): Promise<VoiceSuitabilityClassification> {
  const startedAtMs = Date.now();
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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
      maxRetries: 0,
      timeout: { totalMs: timeoutMs },
      providerOptions: {
        openrouter: getClassifierProviderOptions(DEFAULT_SUITABILITY_MODEL),
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
    if (!result.output) {
      return {
        category: "TEXT_PREFERRED",
        confidence: 0,
        reason: "classifier_empty",
        classifierDiagnostics: {
          outcome: "empty",
          model: DEFAULT_SUITABILITY_MODEL,
          durationMs: Math.max(0, Date.now() - startedAtMs),
          timeoutMs,
          failureCode: "invalid_output",
        },
      };
    }

    return {
      ...result.output,
      classifierDiagnostics: {
        outcome: "success",
        model: DEFAULT_SUITABILITY_MODEL,
        durationMs: Math.max(0, Date.now() - startedAtMs),
        timeoutMs,
      },
    };
  } catch (error) {
    const classifierDiagnostics = buildFailureDiagnostics(
      error,
      startedAtMs,
      timeoutMs,
    );
    voiceLogger.warn(
      "voice.suitability.classifier_failed",
      "Voice suitability classification failed; defaulting to text",
      { error, classifierDiagnostics },
    );
    return {
      category: "TEXT_PREFERRED",
      confidence: 0,
      reason: "classifier_failed",
      classifierDiagnostics,
    };
  }
}
