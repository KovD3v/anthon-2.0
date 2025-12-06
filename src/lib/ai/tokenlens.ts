/**
 * TokenLens Integration
 *
 * Provides AI cost calculation and context budgeting using TokenLens.
 * Uses the built-in default catalog (tokenlens embeds OpenRouter pricing).
 */

import {
  contextHealth,
  estimateCost,
  getContext,
  remainingContext,
} from "tokenlens";

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
      usage: { promptTokens: inputTokens, completionTokens: outputTokens },
    });

    return {
      inputCost: cost.inputUSD ?? 0,
      outputCost: cost.outputUSD ?? 0,
      totalCost: cost.totalUSD ?? 0,
      model: modelId,
    };
  } catch (error) {
    console.error(
      `[TokenLens] Error calculating cost for model ${modelId}:`,
      error,
    );
    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      model: modelId,
    };
  }
}

// -----------------------------------------------------
// CONTEXT BUDGET
// -----------------------------------------------------

export interface ContextBudgetResult {
  percentUsed: number;
  tokensUsed: number;
  contextLength: number;
  isNearLimit: boolean; // > 80%
  isOverLimit: boolean; // > 100%
}

/**
 * Calculate how much of the model's context window is being used.
 *
 * @param modelId - The model identifier
 * @param tokenCount - Current token count in the conversation
 * @returns Context budget information
 */
export function getContextBudget(
  modelId: string,
  tokenCount: number,
): ContextBudgetResult {
  const context = getContext({ modelId });
  const remaining = remainingContext({
    modelId,
    usage: { promptTokens: tokenCount, completionTokens: 0 },
  });

  const contextLength = context.maxTotal ?? context.maxInput ?? 128000;
  const percentUsed = remaining.percentUsed;

  return {
    percentUsed,
    tokensUsed: tokenCount,
    contextLength,
    isNearLimit: percentUsed >= 80,
    isOverLimit: percentUsed >= 100,
  };
}

/**
 * Get health status of context usage.
 */
export function getContextHealthStatus(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): {
  percentUsed: number;
  remaining?: number;
  status: "ok" | "warn" | "compact";
} {
  return contextHealth({
    modelId,
    usage: { promptTokens: inputTokens, completionTokens: outputTokens },
  });
}

// -----------------------------------------------------
// MODEL INFO
// -----------------------------------------------------

/**
 * Get the context length for a model.
 */
export function getModelContextLength(modelId: string): number {
  const context = getContext({ modelId });
  return context.maxTotal ?? context.maxInput ?? 128000;
}

// -----------------------------------------------------
// USAGE DATA FOR STREAMING
// -----------------------------------------------------

export interface StreamUsageData {
  cost: CostResult;
  contextBudget: ContextBudgetResult;
}

/**
 * Build usage data to stream to the client after a response.
 * This is sent as a data event with useChat.
 */
export function buildStreamUsageData(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  totalConversationTokens: number,
): StreamUsageData {
  const cost = calculateCost(modelId, inputTokens, outputTokens);
  const contextBudget = getContextBudget(modelId, totalConversationTokens);

  return { cost, contextBudget };
}
