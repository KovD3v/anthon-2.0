import { createOpenRouter } from "@openrouter/ai-sdk-provider";

// Create OpenRouter provider instance with API key from environment
export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
});

// Orchestrator model: Gemini 2.0 Flash for main agent (free tier available)
export const orchestratorModel = openrouter("google/gemini-2.0-flash-001");

// Sub-agent model: Gemini 2.0 Flash Lite for memory extraction and summarization
export const subAgentModel = openrouter("google/gemini-2.0-flash-lite-001");

// Model IDs for reference
export const ORCHESTRATOR_MODEL_ID = "google/gemini-2.0-flash-001";
export const SUB_AGENT_MODEL_ID = "google/gemini-2.0-flash-lite-001";
