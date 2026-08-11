import { describe, expect, it } from "vitest";
import {
  LIGHT_EXECUTION_MODEL_ID,
  resolveExecutionAttemptModelId,
} from "./execution-model";

describe("ai/execution-model", () => {
  it("selects DeepSeek for production light attempts", () => {
    expect(
      resolveExecutionAttemptModelId({
        profile: "light",
        standardModelId: "openai/gpt-5.6-luna",
      }),
    ).toBe("deepseek/deepseek-v4-flash-0731");
    expect(LIGHT_EXECUTION_MODEL_ID).toBe(
      "deepseek/deepseek-v4-flash-0731",
    );
  });

  it("preserves the plan-resolved model for standard attempts", () => {
    expect(
      resolveExecutionAttemptModelId({
        profile: "standard",
        standardModelId: "openai/gpt-5.6-luna",
      }),
    ).toBe("openai/gpt-5.6-luna");
  });

  it.each(["light", "standard"] as const)(
    "preserves an explicit benchmark model for %s attempts",
    (profile) => {
      expect(
        resolveExecutionAttemptModelId({
          profile,
          standardModelId: "openai/gpt-5.6-luna",
          explicitModelId: "candidate/model",
        }),
      ).toBe("candidate/model");
    },
  );
});
