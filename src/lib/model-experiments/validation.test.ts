import { describe, expect, it } from "vitest";
import {
  createModelExperimentSchema,
  generationConfigSchema,
} from "./validation";

describe("model experiment validation", () => {
  it("sanitizes an exact no-fallback configuration", () => {
    expect(
      generationConfigSchema.parse({ temperature: 0.3, maxOutputTokens: 900 }),
    ).toEqual({ temperature: 0.3, maxOutputTokens: 900, fallbacks: false });
  });

  it("rejects fallback-enabled and unknown generation settings", () => {
    expect(() => generationConfigSchema.parse({ fallbacks: true })).toThrow();
    expect(() => generationConfigSchema.parse({ seed: 42 })).toThrow();
  });

  it("requires exact provider/model ids for both roles", () => {
    const base = {
      key: "luna-italy",
      name: "Luna Italy",
      posthogFlagKey: "model-comparison-italy",
      control: {
        modelId: "z-ai/glm-5.2",
        generationConfig: { fallbacks: false as const },
      },
      candidate: {
        modelId: "openai/gpt-5.6-luna-max",
        generationConfig: { fallbacks: false as const },
      },
    };
    expect(createModelExperimentSchema.parse(base).targetCountry).toBe("IT");
    expect(
      createModelExperimentSchema.safeParse({
        ...base,
        candidate: { ...base.candidate, modelId: "gpt-5.6" },
      }).success,
    ).toBe(false);
  });
});
