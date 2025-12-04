import { createOpenRouter } from "@openrouter/ai-sdk-provider";

// Create OpenRouter provider instance with API key from environment
export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
});

// Orchestrator model: GPT-4.1-mini for main agent
export const orchestratorModel = openrouter("x-ai/grok-4.1-fast:free");

// Sub-agent model: Gemini 2.5 Flash for memory extraction and summarization
export const subAgentModel = openrouter("google/gemini-2.5-flash");

// Model IDs for reference
export const ORCHESTRATOR_MODEL_ID = "x-ai/grok-4.1-fast:free";
export const SUB_AGENT_MODEL_ID = "google/gemini-2.5-flash";
