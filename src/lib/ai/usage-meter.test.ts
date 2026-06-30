import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calculateCost: vi.fn(),
  incrementTokenUsage: vi.fn(),
}));

vi.mock("@/lib/ai/tokenlens", () => ({
  calculateCost: mocks.calculateCost,
}));

vi.mock("@/lib/rate-limit", () => ({
  incrementTokenUsage: mocks.incrementTokenUsage,
}));

import { trackSupportAiUsage } from "./usage-meter";

describe("ai/usage-meter", () => {
  beforeEach(() => {
    mocks.calculateCost.mockReset();
    mocks.incrementTokenUsage.mockReset();
  });

  it("tracks support AI usage without incrementing request count", async () => {
    mocks.calculateCost.mockReturnValue({ totalCost: 0.004 });
    mocks.incrementTokenUsage.mockResolvedValue({});

    await trackSupportAiUsage({
      userId: "user-1",
      modelId: "model-a",
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        outputTokenDetails: { textTokens: undefined, reasoningTokens: 3 },
      },
    });

    expect(mocks.calculateCost).toHaveBeenCalledWith("model-a", 100, 20);
    expect(mocks.incrementTokenUsage).toHaveBeenCalledWith(
      "user-1",
      100,
      20,
      0.004,
      3,
    );
  });

  it("prefers provider cost metadata when available", async () => {
    mocks.incrementTokenUsage.mockResolvedValue({});

    await trackSupportAiUsage({
      userId: "user-1",
      modelId: "model-a",
      usage: {
        inputTokens: 100,
        outputTokens: 20,
      },
      providerMetadata: {
        openrouter: {
          usage: {
            promptTokens: 110,
            completionTokens: 22,
            cost: 0.006,
          },
        },
      },
    });

    expect(mocks.calculateCost).not.toHaveBeenCalled();
    expect(mocks.incrementTokenUsage).toHaveBeenCalledWith(
      "user-1",
      110,
      22,
      0.006,
      0,
    );
  });

  it("reads OpenRouter snake_case provider usage", async () => {
    mocks.incrementTokenUsage.mockResolvedValue({});

    await trackSupportAiUsage({
      userId: "user-1",
      modelId: "model-a",
      providerMetadata: {
        openrouter: {
          usage: {
            prompt_tokens: 110,
            completion_tokens: 22,
            cost: 0.006,
          },
        },
      },
    });

    expect(mocks.calculateCost).not.toHaveBeenCalled();
    expect(mocks.incrementTokenUsage).toHaveBeenCalledWith(
      "user-1",
      110,
      22,
      0.006,
      0,
    );
  });

  it("skips when there are no billable tokens or cost", async () => {
    await trackSupportAiUsage({
      userId: "user-1",
      modelId: "model-a",
      usage: {},
    });

    expect(mocks.incrementTokenUsage).not.toHaveBeenCalled();
  });
});
