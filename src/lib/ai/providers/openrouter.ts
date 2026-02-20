import { devToolsMiddleware } from "@ai-sdk/devtools";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { wrapLanguageModel } from "ai";
import type { LanguageModel } from "ai";
import type { OrganizationModelTier } from "@/lib/organizations/types";
import { resolvePlanSnapshot } from "@/lib/plans";

// Create OpenRouter provider instance with API key from environment
// biome-ignore lint/suspicious/noExplicitAny: @openrouter/ai-sdk-provider uses a nested @ai-sdk/provider with different LanguageModelV2 types
export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
}) as unknown as (modelId: string, settings?: Record<string, unknown>) => LanguageModel;

type ModelType = "orchestrator" | "subAgent";

// Helper to wrap model with devtools in development
// biome-ignore lint/suspicious/noExplicitAny: model type is internal to AI SDK wrapLanguageModel
function withDevTools(model: any) {
  if (process.env.NODE_ENV === "development") {
    return wrapLanguageModel({
      model,
      middleware: devToolsMiddleware(),
    });
  }
  return model;
}

function resolveModelRouting(
  subscriptionStatus?: string,
  planId?: string | null,
  userRole?: string,
  modelTier?: OrganizationModelTier,
) {
  return resolvePlanSnapshot({
    subscriptionStatus,
    planId,
    userRole,
    modelTier,
  }).policies.modelRouting;
}

const trialRouting = resolveModelRouting("TRIAL");

// Default models (for backward compatibility - uses trial tier)
const _orchestratorModel = withDevTools(openrouter(trialRouting.orchestrator));
export const subAgentModel = withDevTools(openrouter(trialRouting.subAgent));

/**
 * Get the appropriate model based on the resolved plan snapshot.
 */
export function getModelForUser(
  planId: string | null | undefined,
  userRole?: string,
  modelType: ModelType = "orchestrator",
  modelTier?: OrganizationModelTier,
  subscriptionStatus?: string,
) {
  const routing = resolveModelRouting(
    subscriptionStatus,
    planId,
    userRole,
    modelTier,
  );

  return withDevTools(openrouter(routing[modelType]));
}

/**
 * Get model ID string for a given user context (useful for logging/tracking)
 */
export function getModelIdForPlan(
  planId: string | null | undefined,
  userRole?: string,
  modelType: ModelType = "orchestrator",
  modelTier?: OrganizationModelTier,
  subscriptionStatus?: string,
): string {
  const routing = resolveModelRouting(
    subscriptionStatus,
    planId,
    userRole,
    modelTier,
  );

  return routing[modelType];
}

// Model IDs for reference
const _ORCHESTRATOR_MODEL_ID = trialRouting.orchestrator;
const _SUB_AGENT_MODEL_ID = trialRouting.subAgent;

// Dedicated low-cost model for background maintenance tasks
export const maintenanceModel = withDevTools(
  openrouter(trialRouting.maintenance),
);
