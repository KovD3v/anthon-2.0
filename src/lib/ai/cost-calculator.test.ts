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
    expect(result.toolCalls).toEqual([
      { name: "saveMemory", args: { key: "k" } },
    ]);
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

  it("uses OpenRouter pricing fallback for newer model ids missing from TokenLens", () => {
    mocks.calculateCost.mockReturnValue({
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      model: "deepseek/deepseek-v4-flash",
    });

    const startTime = new Date("2026-02-17T12:00:05.000Z").getTime();
    const result = extractAIMetrics("deepseek/deepseek-v4-flash", startTime, {
      text: "done",
      usage: {
        promptTokens: 1000,
        completionTokens: 500,
      },
    });

    expect(result.costUsd).toBeCloseTo(0.00018);
  });

  it("uses Tencent Hy3 OpenRouter pricing fallback", () => {
    mocks.calculateCost.mockReturnValue({
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      model: "tencent/hy3-preview",
    });

    const startTime = new Date("2026-02-17T12:00:05.000Z").getTime();
    const result = extractAIMetrics("tencent/hy3-preview", startTime, {
      text: "done",
      usage: {
        promptTokens: 1000,
        completionTokens: 500,
      },
    });

    expect(result.costUsd).toBeCloseTo(0.000196);
  });

  it("uses Gemini OpenRouter pricing fallbacks", () => {
    mocks.calculateCost.mockReturnValue({
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      model: "google/gemini-3.1-flash-lite",
    });

    const startTime = new Date("2026-02-17T12:00:05.000Z").getTime();
    const flashLite31 = extractAIMetrics(
      "google/gemini-3.1-flash-lite",
      startTime,
      {
        text: "done",
        usage: {
          promptTokens: 1000,
          completionTokens: 500,
        },
      },
    );

    const flash3 = extractAIMetrics(
      "google/gemini-3-flash-preview",
      startTime,
      {
        text: "done",
        usage: {
          promptTokens: 1000,
          completionTokens: 500,
        },
      },
    );

    const flashLite25 = extractAIMetrics(
      "google/gemini-2.5-flash-lite",
      startTime,
      {
        text: "done",
        usage: {
          promptTokens: 1000,
          completionTokens: 500,
        },
      },
    );

    expect(flashLite31.costUsd).toBeCloseTo(0.001);
    expect(flash3.costUsd).toBeCloseTo(0.002);
    expect(flashLite25.costUsd).toBeCloseTo(0.0003);
  });

  it("reads AI SDK v5 input and output usage fields", () => {
    mocks.calculateCost.mockReturnValue({
      inputCost: 0.1,
      outputCost: 0.2,
      totalCost: 0.3,
      model: "model-v5",
    });

    const startTime = new Date("2026-02-17T12:00:05.000Z").getTime();
    const result = extractAIMetrics("model-v5", startTime, {
      text: "done",
      usage: {
        inputTokens: 1832,
        outputTokens: 244,
      },
    });

    expect(mocks.calculateCost).toHaveBeenCalledWith("model-v5", 1832, 244);
    expect(result.inputTokens).toBe(1832);
    expect(result.outputTokens).toBe(244);
    expect(result.costUsd).toBe(0.3);
  });

  it("uses OpenRouter snake_case usage when caller usage is empty", () => {
    const startTime = new Date("2026-02-17T12:00:05.000Z").getTime();
    const result = extractAIMetrics("model-openrouter", startTime, {
      text: "done",
      usage: {
        inputTokens: 0,
        outputTokens: 0,
      },
      providerMetadata: {
        openrouter: {
          usage: {
            prompt_tokens: 1832,
            completion_tokens: 244,
            cost: 0.0101,
          },
        },
      },
      preferProviderUsage: false,
    });

    expect(mocks.calculateCost).not.toHaveBeenCalled();
    expect(result.inputTokens).toBe(1832);
    expect(result.outputTokens).toBe(244);
    expect(result.costUsd).toBe(0.0101);
  });

  it("can keep caller-provided aggregate usage instead of final-step provider usage", () => {
    mocks.calculateCost.mockReturnValue({
      inputCost: 0.4,
      outputCost: 0.5,
      totalCost: 0.9,
      model: "model-aggregate",
    });

    const startTime = new Date("2026-02-17T12:00:05.000Z").getTime();
    const result = extractAIMetrics("model-aggregate", startTime, {
      text: "done",
      usage: {
        promptTokens: 400,
        completionTokens: 100,
      },
      providerMetadata: {
        openrouter: {
          usage: {
            promptTokens: 40,
            completionTokens: 10,
            cost: 0.1,
          },
        },
      },
      preferProviderUsage: false,
    });

    expect(mocks.calculateCost).toHaveBeenCalledWith(
      "model-aggregate",
      400,
      100,
    );
    expect(result.inputTokens).toBe(400);
    expect(result.outputTokens).toBe(100);
    expect(result.costUsd).toBe(0.9);
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
