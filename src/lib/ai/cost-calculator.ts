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
export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  _reasoningTokens?: number, // Kept for API compatibility
): number {
  const result = tokenlensCost(modelId, inputTokens, outputTokens);
  return result.totalCost;
}

/**
 * Calculate cost with full breakdown.
 */
export function calculateCostDetailed(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): CostResult {
  return tokenlensCost(modelId, inputTokens, outputTokens);
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
  };
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
): AIMetrics {
  const endTime = Date.now();
  const generationTimeMs = endTime - startTime;

  // Extract token usage - AI SDK v5 uses different property names
  const inputTokens = finishResult.usage?.promptTokens ?? 0;
  const outputTokens = finishResult.usage?.completionTokens ?? 0;

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

  // Calculate cost using TokenLens (synchronous now)
  const costUsd = calculateCost(
    modelId,
    inputTokens,
    outputTokens,
    reasoningTokens ?? undefined,
  );

  return {
    model: modelId,
    inputTokens,
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

/**
 * Pre-warm the TokenLens catalog cache.
 * Note: TokenLens now uses a built-in catalog, no warmup needed.
 */
export function warmPricingCache(): void {
  // No-op - tokenlens uses embedded catalog
}

// Re-export for convenience
export type { CostResult };
