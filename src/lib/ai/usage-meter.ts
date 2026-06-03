import type { LanguageModelUsage } from "ai";
import { createLogger } from "@/lib/logger";
import { incrementTokenUsage } from "@/lib/rate-limit";
import { calculateCost } from "./tokenlens";

const usageMeterLogger = createLogger("usage");

type ProviderMetadata = Record<string, unknown> | undefined;

interface TrackSupportAiUsageInput {
  userId: string;
  modelId: string;
  usage?: Partial<LanguageModelUsage> & {
    promptTokens?: number;
    completionTokens?: number;
  };
  providerMetadata?: ProviderMetadata;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function getOpenRouterUsage(providerMetadata: ProviderMetadata) {
  const openrouter = providerMetadata?.openrouter as
    | Record<string, unknown>
    | undefined;
  return openrouter?.usage as Record<string, unknown> | undefined;
}

export async function trackSupportAiUsage({
  userId,
  modelId,
  usage,
  providerMetadata,
}: TrackSupportAiUsageInput): Promise<void> {
  const openrouterUsage = getOpenRouterUsage(providerMetadata);
  const inputTokens =
    asNumber(openrouterUsage?.promptTokens) ??
    asNumber(openrouterUsage?.prompt_tokens) ??
    asNumber(openrouterUsage?.inputTokens) ??
    asNumber(openrouterUsage?.input_tokens) ??
    asNumber(usage?.inputTokens) ??
    asNumber(usage?.promptTokens) ??
    0;
  const outputTokens =
    asNumber(openrouterUsage?.completionTokens) ??
    asNumber(openrouterUsage?.completion_tokens) ??
    asNumber(openrouterUsage?.outputTokens) ??
    asNumber(openrouterUsage?.output_tokens) ??
    asNumber(usage?.outputTokens) ??
    asNumber(usage?.completionTokens) ??
    0;
  const reasoningTokens = asNumber(usage?.reasoningTokens) ?? 0;
  const providerCostUsd = asNumber(openrouterUsage?.cost);

  if (
    inputTokens === 0 &&
    outputTokens === 0 &&
    reasoningTokens === 0 &&
    providerCostUsd === undefined
  ) {
    return;
  }

  const costUsd =
    providerCostUsd ??
    calculateCost(modelId, inputTokens, outputTokens).totalCost;

  try {
    await incrementTokenUsage(
      userId,
      inputTokens,
      outputTokens,
      costUsd,
      reasoningTokens,
    );
  } catch (error) {
    usageMeterLogger.error(
      "support_ai_usage.increment_failed",
      "Failed to track support AI usage",
      { error, userId, modelId },
    );
  }
}
