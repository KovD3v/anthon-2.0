/**
 * AI Cost Calculator
 * Calculates the cost of AI API calls based on token usage and model pricing.
 */

import { prisma } from "@/lib/db";

// Cache model pricing to avoid DB lookups on every request
let pricingCache: Map<
  string,
  {
    inputPricePerMillion: number;
    outputPricePerMillion: number;
    reasoningPricePerMillion: number | null;
  }
> | null = null;

let pricingCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get model pricing from database with caching.
 */
async function getModelPricing(modelId: string) {
  const now = Date.now();

  // Refresh cache if expired or not initialized
  if (!pricingCache || now - pricingCacheTime > CACHE_TTL) {
    const pricing = await prisma.modelPricing.findMany({
      where: { isActive: true },
    });

    pricingCache = new Map();
    for (const p of pricing) {
      pricingCache.set(p.modelId, {
        inputPricePerMillion: p.inputPricePerMillion,
        outputPricePerMillion: p.outputPricePerMillion,
        reasoningPricePerMillion: p.reasoningPricePerMillion,
      });
    }
    pricingCacheTime = now;
  }

  return pricingCache.get(modelId) ?? null;
}

/**
 * Calculate cost for a single AI call.
 */
export async function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  reasoningTokens?: number
): Promise<number> {
  const pricing = await getModelPricing(modelId);

  if (!pricing) {
    console.warn(`[Cost] No pricing found for model: ${modelId}`);
    return 0;
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPricePerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPricePerMillion;
  const reasoningCost =
    reasoningTokens && pricing.reasoningPricePerMillion
      ? (reasoningTokens / 1_000_000) * pricing.reasoningPricePerMillion
      : 0;

  return inputCost + outputCost + reasoningCost;
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

export async function extractAIMetrics(
  modelId: string,
  startTime: number,
  finishResult: FinishResultInput
): Promise<AIMetrics> {
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

  // Calculate cost
  const costUsd = await calculateCost(
    modelId,
    inputTokens,
    outputTokens,
    reasoningTokens ?? undefined
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
 * Clear the pricing cache (useful for testing or after updates).
 */
export function clearPricingCache() {
  pricingCache = null;
  pricingCacheTime = 0;
}
