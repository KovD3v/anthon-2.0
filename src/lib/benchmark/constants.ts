/**
 * Benchmark Constants
 */

export const AVAILABLE_MODELS = [
  "openai/gpt-5.5",
  "minimax/minimax-m2.5",
  "x-ai/grok-4.3",
  "z-ai/glm-5.1",
  "openai/gpt-chat-latest",
  "qwen/qwen3.6-plus",
  "openai/gpt-5.5-pro",
  "google/gemini-3.1-flash-lite",
] as const;

// Models to benchmark by default: exactly the curated target set.
export const DEFAULT_MODELS = AVAILABLE_MODELS;
