import { describe, expect, it } from "vitest";
import { AVAILABLE_MODELS, DEFAULT_MODELS } from "./constants";

const TARGET_MODELS = [
  "openai/gpt-5.5",
  "minimax/minimax-m2.5",
  "x-ai/grok-4.3",
  "z-ai/glm-5.1",
  "openai/gpt-chat-latest",
  "qwen/qwen3.6-plus",
  "openai/gpt-5.5-pro",
  "google/gemini-3.1-flash-lite",
] as const;

describe("benchmark/constants", () => {
  it("exposes only the curated target models", () => {
    expect(AVAILABLE_MODELS).toEqual(TARGET_MODELS);
    expect(new Set(AVAILABLE_MODELS).size).toBe(AVAILABLE_MODELS.length);
  });

  it("runs the full curated target set by default", () => {
    expect(DEFAULT_MODELS).toEqual(TARGET_MODELS);
  });
});
