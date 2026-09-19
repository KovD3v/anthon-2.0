import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calculateCost: vi.fn(),
  incrementTokenUsage: vi.fn(),
}));

vi.mock("@/lib/ai/cost-attribution", () => ({
  recordAiOperation: vi.fn().mockResolvedValue(undefined),
  recordAiOperationFailure: vi.fn().mockResolvedValue(undefined),
  scheduleCostAttribution: vi.fn(),
}));

vi.mock("@/lib/ai/tokenlens", () => ({
  calculateCost: mocks.calculateCost,
}));

vi.mock("@/lib/rate-limit", () => ({
  incrementTokenUsage: mocks.incrementTokenUsage,
}));

import { recordAiOperation } from "./cost-attribution";
import {
  scheduleSupportAiUsage,
  scheduleTypedDecisionUsage,
  trackSupportAiUsage,
} from "./usage-meter";

describe("ai/usage-meter", () => {
  beforeEach(() => {
    mocks.calculateCost.mockReset();
    mocks.incrementTokenUsage.mockReset();
  });

  it("tracks support AI usage without incrementing request count", async () => {
    mocks.calculateCost.mockReturnValue({ totalCost: 0.004 });
    mocks.incrementTokenUsage.mockResolvedValue({});

    await trackSupportAiUsage({
      operation: "memory_extraction",
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
    expect(mocks.incrementTokenUsage).toHaveBeenCalledTimes(1);
    expect(recordAiOperation).toHaveBeenCalledTimes(1);
  });

  it("prefers provider cost metadata when available", async () => {
    mocks.incrementTokenUsage.mockResolvedValue({});

    await trackSupportAiUsage({
      operation: "memory_extraction",
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
      operation: "memory_extraction",
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
      operation: "memory_extraction",
      userId: "user-1",
      modelId: "model-a",
      usage: {},
    });

    expect(mocks.incrementTokenUsage).not.toHaveBeenCalled();
  });

  it("attributes anonymous work without creating quota usage", async () => {
    await trackSupportAiUsage({
      operation: "chat_metadata",
      modelId: "model-a",
      usage: { inputTokens: 100, outputTokens: 20 },
    });
    expect(mocks.incrementTokenUsage).not.toHaveBeenCalled();
    expect(recordAiOperation).toHaveBeenCalledTimes(1);
  });

  it("hands support usage accounting to the request scheduler without awaiting it", () => {
    const waitUntil = vi.fn();
    mocks.calculateCost.mockReturnValue({ totalCost: 0.004 });
    mocks.incrementTokenUsage.mockImplementation(
      () => new Promise(() => undefined),
    );

    scheduleSupportAiUsage(
      {
        operation: "memory_extraction",
        userId: "user-1",
        modelId: "model-a",
        usage: { inputTokens: 100, outputTokens: 20 },
      },
      waitUntil,
    );

    expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
    expect(mocks.incrementTokenUsage).toHaveBeenCalledTimes(1);
  });

  it("meters typed provider usage once and keeps failed attempts outside quota totals", () => {
    mocks.incrementTokenUsage.mockResolvedValue({});
    const waitUntil = vi.fn();
    const metadata = {
      modelId: "typesafe/jev-1.13",
      durationMs: 300,
      attempted: true,
      usage: { input_tokens: 100, output_tokens: 20, cost: 0.0000042 },
    };
    scheduleTypedDecisionUsage(
      { ...metadata, ok: true, choice: "candidate", confidence: 1 },
      { userId: "user-1", operation: "memory_gate", waitUntil },
    );
    expect(mocks.incrementTokenUsage).toHaveBeenCalledExactlyOnceWith(
      "user-1",
      100,
      20,
      0.0000042,
      0,
    );
    expect(waitUntil).toHaveBeenCalledOnce();
    scheduleTypedDecisionUsage(
      { ...metadata, ok: false, failureCode: "provider_error" },
      { userId: "user-1", operation: "memory_gate" },
    );
    expect(mocks.incrementTokenUsage).toHaveBeenCalledOnce();
    expect(recordAiOperation).toHaveBeenLastCalledWith(
      expect.objectContaining({ failed: true, operation: "memory_gate" }),
    );
  });
});
