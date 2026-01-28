/**
 * Benchmark Constants
 */

// Models to benchmark by default (current production models)
export const DEFAULT_MODELS = [
  "google/gemini-2.0-flash-lite-001",
  "google/gemini-2.0-flash-001",
  "google/gemini-2.5-flash-lite-preview-09-2025",
] as const;

// All models available for benchmarking in UI
export const AVAILABLE_MODELS = [
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite-preview-09-2025",
  "google/gemini-2.0-flash-001",
  "google/gemini-2.0-flash-lite-001",
  "openai/gpt-oss-120b",
  "minimax/minimax-m2.1",
  "z-ai/glm-4.7",
  "xiaomi/mimo-v2-flash:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "moonshotai/kimi-k2-thinking",
  "deepseek/deepseek-v3.2"
] as const;

export type BenchmarkModelId = (typeof AVAILABLE_MODELS)[number];
