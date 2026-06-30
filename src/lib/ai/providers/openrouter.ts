import { devToolsMiddleware } from "@ai-sdk/devtools";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { wrapLanguageModel } from "ai";
import type { OrganizationModelTier } from "@/lib/organizations/types";
import { resolvePlanSnapshot } from "@/lib/plans";
import type { ResolvedPlanPolicies } from "@/lib/plans/types";

// Create OpenRouter provider instance with API key from environment.
// The double cast is required because @openrouter/ai-sdk-provider bundles its own copy of
// @ai-sdk/provider, whose LanguageModelV2 type conflicts with the one in the `ai` package.
// Remove this cast once @openrouter/ai-sdk-provider aligns its peer dependency.
export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
}) as unknown as (
  modelId: string,
  settings?: Record<string, unknown>,
) => LanguageModel;

type ModelType = "orchestrator" | "subAgent";
type OpenRouterModelSettings = Record<string, unknown>;

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

function getOpenRouterModelSettings(
  routing: ResolvedPlanPolicies["modelRouting"],
  modelType: ModelType,
  settings?: OpenRouterModelSettings,
) {
  const baseSettings =
    modelType !== "orchestrator" || !routing.orchestratorFallbacks?.length
      ? undefined
      : { models: routing.orchestratorFallbacks };

  if (!settings) {
    return baseSettings;
  }

  return {
    ...baseSettings,
    ...settings,
  };
}

function getOpenRouterModel(
  routing: ResolvedPlanPolicies["modelRouting"],
  modelType: ModelType,
  settingsOverride?: OpenRouterModelSettings,
) {
  const modelId = routing[modelType];
  const settings = getOpenRouterModelSettings(
    routing,
    modelType,
    settingsOverride,
  );
  return settings ? openrouter(modelId, settings) : openrouter(modelId);
}

const trialRouting = resolveModelRouting("TRIAL");
export const ORCHESTRATOR_MODEL_ID = trialRouting.orchestrator;
export const SUB_AGENT_MODEL_ID = trialRouting.subAgent;
export const MAINTENANCE_MODEL_ID = trialRouting.maintenance;

// Default models (for backward compatibility - uses trial tier)
const _orchestratorModel = withDevTools(
  getOpenRouterModel(trialRouting, "orchestrator"),
);
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
  settingsOverride?: OpenRouterModelSettings,
) {
  const routing = resolveModelRouting(
    subscriptionStatus,
    planId,
    userRole,
    modelTier,
  );

  return withDevTools(getOpenRouterModel(routing, modelType, settingsOverride));
}

/**
 * Build a model directly from an explicit provider id.
 * Intended for internal benchmark/reality-evaluation flows where the runtime
 * routing table must stay unchanged while candidate models are compared.
 */
export function getModelById(
  modelId: string,
  settingsOverride?: OpenRouterModelSettings,
) {
  return withDevTools(
    settingsOverride
      ? openrouter(modelId, settingsOverride)
      : openrouter(modelId),
  );
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
const _ORCHESTRATOR_MODEL_ID = ORCHESTRATOR_MODEL_ID;
const _SUB_AGENT_MODEL_ID = SUB_AGENT_MODEL_ID;

// Dedicated low-cost model for background maintenance tasks
export const maintenanceModel = withDevTools(openrouter(MAINTENANCE_MODEL_ID));
