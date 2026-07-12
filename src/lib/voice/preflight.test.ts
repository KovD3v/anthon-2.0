import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VoicePlanConfig } from "./config";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  outputObject: vi.fn(),
  openrouter: vi.fn(),
  voiceCount: vi.fn(),
  messageFindMany: vi.fn(),
  getSystemLoad: vi.fn(),
  trackSupportAiUsage: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: { object: mocks.outputObject },
}));
vi.mock("@/lib/ai/providers/openrouter", () => ({
  openrouter: mocks.openrouter,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    voiceUsage: { count: mocks.voiceCount },
    message: { findMany: mocks.messageFindMany },
  },
}));
vi.mock("./elevenlabs", () => ({ getSystemLoad: mocks.getSystemLoad }));
vi.mock("@/lib/ai/usage-meter", () => ({
  trackSupportAiUsage: mocks.trackSupportAiUsage,
}));

import { decideWebVoiceMode } from "./preflight";

const enabledPlanConfig: VoicePlanConfig = {
  enabled: true,
  capWindowMs: 12 * 60 * 60 * 1000,
  maxPerWindow: 10,
  automaticBudgetRatio: 0.65,
  cadence: {
    strongMinTurns: 1,
    strongCooldownMs: 5 * 60 * 1000,
    naturalMinTurns: 3,
    naturalCooldownMs: 15 * 60 * 1000,
    maxAutomaticPerHour: 3,
    maxConsecutiveAudio: 2,
    antiDroughtTurns: 8,
    naturalConfidence: 0.7,
    antiDroughtConfidence: 0.6,
  },
};

function baseParams() {
  return {
    userId: "user-1",
    userMessage: "What do you think about what happened today?",
    userPreferences: { voiceEnabled: true },
    planConfig: enabledPlanConfig,
    planId: "basic-plan",
    chatId: "chat-1",
    recentMessages: [
      { role: "user", content: "I had a complicated day" },
      { role: "assistant", content: "Tell me what stood out." },
    ],
  };
}

describe("voice/preflight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T18:00:00.000Z"));
    vi.clearAllMocks();
    mocks.outputObject.mockImplementation(
      ({ schema }: { schema: unknown }) => ({ schema }),
    );
    mocks.openrouter.mockReturnValue("preflight-model");
    mocks.voiceCount.mockResolvedValue(0);
    mocks.messageFindMany.mockResolvedValue([]);
    mocks.getSystemLoad.mockResolvedValue(1);
    mocks.trackSupportAiUsage.mockResolvedValue(undefined);
    mocks.generateText.mockResolvedValue({
      output: {
        category: "VOICE_NATURAL",
        reason: "reflective_coaching",
        confidence: 0.85,
      },
      usage: { inputTokens: 90, outputTokens: 10 },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("fails eligibility without classifier or provider work", async () => {
    const result = await decideWebVoiceMode({
      ...baseParams(),
      planConfig: { ...enabledPlanConfig, enabled: false },
    });

    expect(result).toMatchObject({
      mode: "TEXT",
      reasonCode: "PLAN_NOT_ELIGIBLE",
      source: "deterministic",
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.getSystemLoad).not.toHaveBeenCalled();
  });

  it("honors explicit voice without classifier inference", async () => {
    const result = await decideWebVoiceMode({
      ...baseParams(),
      userMessage: "Please send me a voice message",
    });

    expect(result).toMatchObject({
      mode: "VOICE",
      category: "VOICE_REQUIRED",
      reasonCode: "EXPLICIT_VOICE",
      source: "deterministic",
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("classifies ordinary conversation without requiring keywords", async () => {
    const result = await decideWebVoiceMode(baseParams());

    expect(result).toMatchObject({
      mode: "VOICE",
      category: "VOICE_NATURAL",
      reasonCode: "NATURAL_MOMENT",
      source: "classifier",
      suitabilityReason: "reflective_coaching",
      suitabilityConfidence: 0.85,
    });
    expect(mocks.openrouter).toHaveBeenCalledWith("qwen/qwen3.5-flash-02-23");
  });

  it("exposes classifier failure details for persisted diagnostics", async () => {
    const timeoutError = new Error("request timed out");
    timeoutError.name = "TimeoutError";
    mocks.generateText.mockRejectedValue(timeoutError);

    const result = await decideWebVoiceMode(baseParams());

    expect(result).toMatchObject({
      mode: "TEXT",
      reasonCode: "TEXT_PREFERRED",
      source: "classifier",
      suitabilityReason: "classifier_failed",
      suitabilityConfidence: 0,
      classifierDiagnostics: {
        outcome: "failed",
        model: "qwen/qwen3.5-flash-02-23",
        durationMs: 0,
        timeoutMs: 1000,
        failureCode: "timeout",
        errorName: "TimeoutError",
      },
    });
  });

  it("records provider failure details without persisting response content", async () => {
    const providerError = Object.assign(new Error("provider unavailable"), {
      name: "AI_APICallError",
      statusCode: 503,
      isRetryable: true,
      responseBody: "sensitive provider response",
    });
    mocks.generateText.mockRejectedValue(providerError);

    const result = await decideWebVoiceMode(baseParams());

    expect(result.classifierDiagnostics).toEqual({
      outcome: "failed",
      model: "qwen/qwen3.5-flash-02-23",
      durationMs: 0,
      timeoutMs: 1000,
      failureCode: "provider_error",
      errorName: "AI_APICallError",
      statusCode: 503,
      retryable: true,
    });
    expect(result.classifierDiagnostics).not.toHaveProperty("responseBody");
  });

  it("unwraps an AI SDK retry error to record its timeout cause", async () => {
    const timeoutCause = new Error("The operation timed out");
    timeoutCause.name = "TimeoutError";
    const retryError = Object.assign(new Error("Failed after 1 attempt"), {
      name: "AI_RetryError",
      reason: "abort",
      lastError: timeoutCause,
      errors: [timeoutCause],
    });
    mocks.generateText.mockRejectedValue(retryError);

    const result = await decideWebVoiceMode(baseParams());

    expect(result.classifierDiagnostics).toMatchObject({
      outcome: "failed",
      failureCode: "timeout",
      errorName: "AI_RetryError",
      causeName: "TimeoutError",
    });
  });

  it("records invalid structured output separately from provider failures", async () => {
    const invalidOutputError = new Error("No object generated");
    invalidOutputError.name = "AI_NoObjectGeneratedError";
    mocks.generateText.mockRejectedValue(invalidOutputError);

    const result = await decideWebVoiceMode(baseParams());

    expect(result.classifierDiagnostics).toMatchObject({
      outcome: "failed",
      failureCode: "invalid_output",
      errorName: "AI_NoObjectGeneratedError",
    });
  });

  it("records empty classifier output as an invalid-output outcome", async () => {
    mocks.generateText.mockResolvedValue({
      output: undefined,
      usage: { inputTokens: 90, outputTokens: 0 },
    });

    const result = await decideWebVoiceMode(baseParams());

    expect(result).toMatchObject({
      mode: "TEXT",
      suitabilityReason: "classifier_empty",
      classifierDiagnostics: {
        outcome: "empty",
        failureCode: "invalid_output",
      },
    });
  });

  it("does not classify when provider capacity is red", async () => {
    mocks.getSystemLoad.mockResolvedValue(0.04);

    const result = await decideWebVoiceMode(baseParams());

    expect(result).toMatchObject({
      mode: "TEXT",
      capacityState: "RED",
      reasonCode: "PROVIDER_RED",
      source: "deterministic",
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("allows strong moments but suppresses natural audio in yellow state", async () => {
    mocks.getSystemLoad.mockResolvedValue(0.2);

    const natural = await decideWebVoiceMode(baseParams());
    const strong = await decideWebVoiceMode({
      ...baseParams(),
      userMessage: "I feel anxious and need support",
    });

    expect(natural.reasonCode).toBe("PROVIDER_YELLOW");
    expect(strong).toMatchObject({
      mode: "VOICE",
      category: "VOICE_STRONG",
      reasonCode: "STRONG_MOMENT",
    });
  });

  it("does not classify when the hourly anti-spam gate is reached", async () => {
    mocks.voiceCount.mockResolvedValue(3);

    const result = await decideWebVoiceMode(baseParams());

    expect(result.reasonCode).toBe("ANTI_SPAM_LIMIT");
    expect(result.source).toBe("deterministic");
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("keeps explicit text requests deterministic", async () => {
    const result = await decideWebVoiceMode({
      ...baseParams(),
      userMessage: "Write the answer in text only",
    });

    expect(result).toMatchObject({
      mode: "TEXT",
      category: "TEXT_REQUESTED",
      reasonCode: "EXPLICIT_TEXT",
    });
    expect(mocks.getSystemLoad).not.toHaveBeenCalled();
  });
});
