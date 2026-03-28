/**
 * TokenLens Integration
 *
 * Provides AI cost calculation and context budgeting using TokenLens.
 * Uses the built-in default catalog (tokenlens embeds OpenRouter pricing).
 */

import { estimateCost } from "tokenlens";
import { createLogger } from "@/lib/logger";

const tokenlensLogger = createLogger("ai");

// -----------------------------------------------------
// COST CALCULATION
// -----------------------------------------------------

export interface CostResult {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  model: string;
}

/**
 * Calculate the cost for a given AI usage.
 *
 * @param modelId - The model identifier (e.g., "x-ai/grok-4.1-fast:free")
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Cost breakdown in USD
 */
export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): CostResult {
  try {
    const cost = estimateCost({
      modelId,
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
      },
    });

    return {
      inputCost: cost.inputUSD ?? 0,
      outputCost: cost.outputUSD ?? 0,
      totalCost: cost.totalUSD ?? 0,
      model: modelId,
    };
  } catch (error) {
    tokenlensLogger.error("cost.calculation_failed", "Error calculating cost", { modelId, error });
    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      model: modelId,
    };
  }
}

