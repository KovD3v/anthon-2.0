/**
 * AI Cost Calculator
 *
 * Calculates the cost of AI API calls based on token usage.
 * Uses TokenLens for pricing data from OpenRouter API.
 */

import { type CostResult, calculateCost as tokenlensCost } from "./tokenlens";

/**
 * Calculate cost for a single AI call.
 * Returns the total cost in USD.
 */
function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  _reasoningTokens?: number, // Kept for API compatibility
): number {
  const result = tokenlensCost(modelId, inputTokens, outputTokens);
  if (result.totalCost > 0) {
    return result.totalCost;
  }

  return calculateOpenRouterFallbackCost(modelId, inputTokens, outputTokens);
}

const OPENROUTER_PRICE_FALLBACKS: Record<
  string,
  { prompt: number; completion: number }
> = {
  "anthropic/claude-haiku-4.5": { prompt: 0.000001, completion: 0.000005 },
  "deepseek/deepseek-v4-flash": {
    prompt: 0.00000009,
    completion: 0.00000018,
  },
  "google/gemini-2.5-flash-lite": {
    prompt: 0.0000001,
    completion: 0.0000004,
  },
  "google/gemini-3-flash-preview": {
    prompt: 0.0000005,
    completion: 0.000003,
  },
  "google/gemini-3.1-flash-lite": {
    prompt: 0.00000025,
    completion: 0.0000015,
  },
  "moonshotai/kimi-k2.7-code": {
    prompt: 0.00000074,
    completion: 0.0000035,
  },
  "openai/gpt-5.4-nano": { prompt: 0.0000002, completion: 0.00000125 },
  "openai/gpt-chat-latest": { prompt: 0.000005, completion: 0.00003 },
  "tencent/hy3-preview": { prompt: 0.000000066, completion: 0.00000026 },
  "z-ai/glm-5.2": { prompt: 0.0000014, completion: 0.0000044 },
};

function calculateOpenRouterFallbackCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
) {
  const pricing = OPENROUTER_PRICE_FALLBACKS[modelId];
  if (!pricing) {
    return 0;
  }

  return inputTokens * pricing.prompt + outputTokens * pricing.completion;
}

/**
 * Extract AI metrics from the AI SDK response.
 * Works with streamText and generateText responses.
 */
export interface AIMetrics {
  model: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number | null;
  reasoningContent: string | null;
  toolCalls: Array<{
    name: string;
    args: unknown;
    result?: unknown;
  }> | null;
  ragUsed: boolean;
  ragChunksCount: number;
  costUsd: number;
  generationTimeMs: number;
  reasoningTimeMs: number | null;
}

interface FinishResultInput {
  text: string;
  usage?: {
    totalTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
  };
  /**
   * OpenRouter provider metadata is exact for single-step calls, but can describe
   * only the final step in multi-step tool loops. Set false when caller passes
   * AI SDK totalUsage so aggregate tokens are preserved.
   */
  preferProviderUsage?: boolean;
  providerMetadata?: Record<string, unknown>;
  collectedToolCalls?: Array<{
    name: string;
    args: unknown;
    result?: unknown;
  }>;
  ragUsed?: boolean;
  ragChunksCount?: number;
}

/**
 * Extract and calculate AI metrics from a finish result.
 */
export function extractAIMetrics(
  modelId: string,
  startTime: number,
  finishResult: FinishResultInput,
  excludePromptTokens: number = 0,
  excludeToolTokens: number = 0,
): AIMetrics {
  const endTime = Date.now();
  const generationTimeMs = endTime - startTime;

  const usageTokens = getUsageTokens(finishResult.usage);
  let inputTokens = usageTokens.inputTokens ?? 0;
  let outputTokens = usageTokens.outputTokens ?? 0;

  // Try to extract cost and tokens from OpenRouter metadata
  let costFromOpenRouter: number | undefined;
  const preferProviderUsage = finishResult.preferProviderUsage ?? true;
  const hasCallerUsage = inputTokens > 0 || outputTokens > 0;
  if (finishResult.providerMetadata) {
    const openrouterMeta = finishResult.providerMetadata.openrouter as
      | Record<string, unknown>
      | undefined;
    if (openrouterMeta) {
      // Extract from nested usage object if available
      const usage = openrouterMeta.usage as Record<string, unknown> | undefined;
      const providerUsage = getOpenRouterUsageTokens(usage);
      if (providerUsage && (preferProviderUsage || !hasCallerUsage)) {
        inputTokens = providerUsage.inputTokens ?? inputTokens;
        outputTokens = providerUsage.outputTokens ?? outputTokens;
      }

      const providerCost = asNumber(usage?.cost);
      if (
        providerCost !== undefined &&
        (preferProviderUsage || !hasCallerUsage)
      ) {
        costFromOpenRouter = providerCost;
      }
    }
  }

  // Extract reasoning info from provider metadata (if available)
  // OpenRouter may provide this in experimental metadata
  const providerMeta = finishResult.providerMetadata;
  const openrouterMeta = providerMeta?.openrouter as
    | { reasoningTokens?: number; reasoning?: string }
    | undefined;
  const reasoningTokens = openrouterMeta?.reasoningTokens ?? null;
  const reasoningContent = openrouterMeta?.reasoning ?? null;

  // Use collected tool calls
  const toolCalls = finishResult.collectedToolCalls ?? null;

  // Calculate cost: prefer OpenRouter's cost if available, otherwise calculate with TokenLens
  // NOTE: We use the FULL input tokens for cost calculation before subtraction
  const costUsd =
    costFromOpenRouter ??
    calculateCost(
      modelId,
      inputTokens,
      outputTokens,
      reasoningTokens ?? undefined,
    );

  // Adjust input tokens to exclude system prompt AND tools (for user display/quota)
  // Ensure we don't go below 0
  const adjustedInputTokens = Math.max(
    0,
    inputTokens - excludePromptTokens - excludeToolTokens,
  );

  return {
    model: modelId,
    inputTokens: adjustedInputTokens,
    outputTokens,
    reasoningTokens,
    reasoningContent,
    toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : null,
    ragUsed: finishResult.ragUsed ?? false,
    ragChunksCount: finishResult.ragChunksCount ?? 0,
    costUsd,
    generationTimeMs,
    reasoningTimeMs: null, // Not available from OpenRouter currently
  };
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function getUsageTokens(
  usage:
    | {
        promptTokens?: number;
        completionTokens?: number;
        inputTokens?: number;
        outputTokens?: number;
      }
    | undefined,
) {
  if (!usage) {
    return {};
  }

  return {
    inputTokens: asNumber(usage.promptTokens) ?? asNumber(usage.inputTokens),
    outputTokens:
      asNumber(usage.completionTokens) ?? asNumber(usage.outputTokens),
  };
}

function getOpenRouterUsageTokens(usage: Record<string, unknown> | undefined) {
  if (!usage) {
    return undefined;
  }

  return {
    inputTokens:
      asNumber(usage.promptTokens) ??
      asNumber(usage.prompt_tokens) ??
      asNumber(usage.inputTokens) ??
      asNumber(usage.input_tokens),
    outputTokens:
      asNumber(usage.completionTokens) ??
      asNumber(usage.completion_tokens) ??
      asNumber(usage.outputTokens) ??
      asNumber(usage.output_tokens),
  };
}

// Re-export for convenience
export type { CostResult };
