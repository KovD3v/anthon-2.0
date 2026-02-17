import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calculateCost: vi.fn(),
}));

vi.mock("./tokenlens", () => ({
  calculateCost: mocks.calculateCost,
}));

import { extractAIMetrics } from "./cost-calculator";

describe("ai/cost-calculator", () => {
  beforeEach(() => {
    mocks.calculateCost.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-17T12:00:10.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("prefers OpenRouter usage metadata and cost when available", () => {
    const startTime = new Date("2026-02-17T12:00:00.000Z").getTime();

    const result = extractAIMetrics(
      "model-1",
      startTime,
      {
        text: "done",
        usage: {
          promptTokens: 10,
          completionTokens: 20,
        },
        providerMetadata: {
          openrouter: {
            usage: {
              promptTokens: 120,
              completionTokens: 60,
              cost: 1.25,
            },
            reasoningTokens: 7,
            reasoning: "Reasoning text",
          },
        },
        collectedToolCalls: [{ name: "saveMemory", args: { key: "k" } }],
        ragUsed: true,
        ragChunksCount: 3,
      },
      15,
      5,
    );

    expect(mocks.calculateCost).not.toHaveBeenCalled();
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(60);
    expect(result.reasoningTokens).toBe(7);
    expect(result.reasoningContent).toBe("Reasoning text");
    expect(result.toolCalls).toEqual([{ name: "saveMemory", args: { key: "k" } }]);
    expect(result.ragUsed).toBe(true);
    expect(result.ragChunksCount).toBe(3);
    expect(result.costUsd).toBe(1.25);
    expect(result.generationTimeMs).toBe(10_000);
  });

  it("falls back to TokenLens cost calculation without provider cost metadata", () => {
    mocks.calculateCost.mockReturnValue({
      inputCost: 0.1,
      outputCost: 0.2,
      totalCost: 0.3,
      model: "model-2",
    });

    const startTime = new Date("2026-02-17T12:00:05.000Z").getTime();
    const result = extractAIMetrics("model-2", startTime, {
      text: "done",
      usage: {
        promptTokens: 40,
        completionTokens: 11,
      },
      providerMetadata: {
        openrouter: {
          reasoningTokens: 4,
        },
      },
      collectedToolCalls: [],
    });

    expect(mocks.calculateCost).toHaveBeenCalledWith("model-2", 40, 11);
    expect(result.inputTokens).toBe(40);
    expect(result.outputTokens).toBe(11);
    expect(result.costUsd).toBe(0.3);
    expect(result.toolCalls).toBeNull();
    expect(result.reasoningTokens).toBe(4);
  });

  it("never returns negative adjusted input tokens", () => {
    mocks.calculateCost.mockReturnValue({
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      model: "model-3",
    });

    const startTime = new Date("2026-02-17T12:00:08.000Z").getTime();
    const result = extractAIMetrics(
      "model-3",
      startTime,
      {
        text: "done",
        usage: {
          promptTokens: 5,
          completionTokens: 2,
        },
      },
      10,
      10,
    );

    expect(result.inputTokens).toBe(0);
  });
});
