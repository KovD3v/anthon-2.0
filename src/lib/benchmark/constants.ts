/**
 * Benchmark Constants
 */

// Models to benchmark by default (current production models)
export const DEFAULT_MODELS = [
  "google/gemini-2.0-flash-lite-001",
  "google/gemini-2.0-flash-001",
] as const;

// All models available for benchmarking in UI
export const AVAILABLE_MODELS = [
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-flash",
  "google/gemini-2.0-flash-001",
  "google/gemini-2.0-flash-lite-001",
  "openai/gpt-oss-120b",
  "minimax/minimax-m2.1",
  "minimax/minimax-m2.5",
  "minimax/minimax-m2-her",
  "z-ai/glm-4.7",
  "z-ai/glm-5",
  "stepfun/step-3.5-flash",
  "xiaomi/mimo-v2-flash:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "moonshotai/kimi-k2-thinking",
  "moonshotai/kimi-k2.5",
  "deepseek/deepseek-v3.2"
] as const;

export type BenchmarkModelId = (typeof AVAILABLE_MODELS)[number];
