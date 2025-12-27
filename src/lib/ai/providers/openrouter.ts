import { devToolsMiddleware } from "@ai-sdk/devtools";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { wrapLanguageModel } from "ai";

// Create OpenRouter provider instance with API key from environment
export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
});

// Model configuration based on Clerk subscription plan
// Note: All Gemini models support vision, so we just use the orchestrator models
const MODEL_CONFIG = {
  // No subscription / trial users
  trial: {
    orchestrator: "google/gemini-2.0-flash-lite-001",
    subAgent: "google/gemini-2.0-flash-lite-001",
  },
  // Basic plan ($7/month)
  basic: {
    orchestrator: "google/gemini-2.0-flash-001",
    subAgent: "google/gemini-2.0-flash-lite-001",
  },
  // Basic Plus plan ($12/month)
  basic_plus: {
    orchestrator: "google/gemini-2.0-flash-001",
    subAgent: "google/gemini-2.0-flash-001",
  },
  // Pro plan ($25/month)
  pro: {
    orchestrator: "google/gemini-2.5-flash-lite-preview-09-2025",
    subAgent: "google/gemini-2.5-flash-lite-preview-09-2025",
  },
  // Admin (unlimited)
  admin: {
    orchestrator: "google/gemini-2.5-flash-lite-preview-09-2025",
    subAgent: "google/gemini-2.5-flash-lite-preview-09-2025",
  },
} as const;

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

// Default models (for backward compatibility - uses trial tier)
const _orchestratorModel = withDevTools(
  openrouter(MODEL_CONFIG.trial.orchestrator),
);
export const subAgentModel = withDevTools(
  openrouter(MODEL_CONFIG.trial.subAgent),
);

/**
 * Resolves the plan key based on user's subscription plan and role.
 * Centralizes the logic to avoid duplication.
 */
function resolvePlanKey(
  planId: string | null | undefined,
  userRole?: string,
): keyof typeof MODEL_CONFIG {
  // Admin/Super Admin always get best models
  if (userRole === "ADMIN" || userRole === "SUPER_ADMIN") {
    return "admin";
  }

  if (!planId) {
    return "trial";
  }

  // Match plan IDs from Clerk (basic, basic_plus, pro)
  const normalizedPlanId = planId.toLowerCase();
  if (normalizedPlanId.includes("pro")) {
    return "pro";
  }
  if (normalizedPlanId.includes("basic_plus")) {
    return "basic_plus";
  }
  if (normalizedPlanId.includes("basic")) {
    return "basic";
  }

  return "trial";
}

/**
 * Get the appropriate model based on user's subscription plan from Clerk
 */
export function getModelForUser(
  planId: string | null | undefined,
  userRole?: string,
  modelType: "orchestrator" | "subAgent" = "orchestrator",
) {
  const planKey = resolvePlanKey(planId, userRole);
  return withDevTools(openrouter(MODEL_CONFIG[planKey][modelType]));
}

/**
 * Get model ID string for a given plan (useful for logging/tracking)
 */
export function getModelIdForPlan(
  planId: string | null | undefined,
  userRole?: string,
  modelType: "orchestrator" | "subAgent" = "orchestrator",
): string {
  const planKey = resolvePlanKey(planId, userRole);
  return MODEL_CONFIG[planKey][modelType];
}

// Model IDs for reference
const _ORCHESTRATOR_MODEL_ID = MODEL_CONFIG.trial.orchestrator;
const _SUB_AGENT_MODEL_ID = MODEL_CONFIG.trial.subAgent;

// Dedicated low-cost model for background maintenance tasks
export const maintenanceModel = withDevTools(
  openrouter("google/gemini-2.0-flash-lite-001"),
);
