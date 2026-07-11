import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VoicePlanConfig } from "./config";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  outputObject: vi.fn(),
  voiceCount: vi.fn(),
  voiceCreate: vi.fn(),
  messageFindMany: vi.fn(),
  dailyUsageUpsert: vi.fn(),
  measure: vi.fn(),
  trackSupportAiUsage: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: { object: mocks.outputObject },
}));
vi.mock("@/lib/ai/providers/openrouter", () => ({
  openrouter: vi.fn(() => "mock-suitability-model"),
}));
vi.mock("@/lib/ai/usage-meter", () => ({
  trackSupportAiUsage: mocks.trackSupportAiUsage,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    voiceUsage: { count: mocks.voiceCount, create: mocks.voiceCreate },
    message: { findMany: mocks.messageFindMany },
    dailyUsage: { upsert: mocks.dailyUsageUpsert },
  },
}));
vi.mock("@/lib/latency-logger", () => ({
  LatencyLogger: { measure: mocks.measure },
}));

import { shouldGenerateVoice, trackVoiceUsage } from "./funnel";

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
    userMessage: "Puoi spiegarmelo meglio?",
    assistantText:
      "Certo, esploriamo insieme questa situazione in modo semplice e discorsivo.",
    conversationContext: [{ role: "user", content: "Ciao" }],
    userPreferences: { voiceEnabled: true },
    planConfig: enabledPlanConfig,
    systemLoad: vi.fn().mockResolvedValue(1),
    planId: "my-basic-plan",
    channel: "TELEGRAM" as const,
  };
}

describe("voice/funnel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T12:00:00.000Z"));
    vi.clearAllMocks();
    mocks.outputObject.mockImplementation(
      ({ schema }: { schema: unknown }) => ({ schema }),
    );
    mocks.measure.mockImplementation(
      async (_name: string, fn: () => unknown | Promise<unknown>) => fn(),
    );
    mocks.voiceCount.mockResolvedValue(0);
    mocks.messageFindMany.mockResolvedValue([]);
    mocks.trackSupportAiUsage.mockResolvedValue(undefined);
    mocks.generateText.mockResolvedValue({
      output: {
        category: "VOICE_NATURAL",
        reason: "reflective_coaching",
        confidence: 0.85,
      },
      usage: { inputTokens: 70, outputTokens: 9 },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("fails eligibility without classifier, provider, or history work", async () => {
    const params = baseParams();
    const result = await shouldGenerateVoice({
      ...params,
      planConfig: { ...enabledPlanConfig, enabled: false },
    });

    expect(result).toMatchObject({
      shouldGenerateVoice: false,
      category: "TEXT_PREFERRED",
      reasonCode: "PLAN_NOT_ELIGIBLE",
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(params.systemLoad).not.toHaveBeenCalled();
    expect(mocks.voiceCount).not.toHaveBeenCalled();
  });

  it("honors explicit voice deterministically when capacity and quota allow", async () => {
    const result = await shouldGenerateVoice({
      ...baseParams(),
      userMessage: "Please send me a voice message",
      assistantText: "Short",
    });

    expect(result).toMatchObject({
      shouldGenerateVoice: true,
      explicitVoiceRequest: true,
      category: "VOICE_REQUIRED",
      capacityState: "GREEN",
      reasonCode: "EXPLICIT_VOICE",
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("returns provider unavailability for an explicit request in red state", async () => {
    const result = await shouldGenerateVoice({
      ...baseParams(),
      userMessage: "Mandami un vocale",
      systemLoad: 0.04,
    });

    expect(result).toMatchObject({
      shouldGenerateVoice: false,
      explicitVoiceRequest: true,
      reasonCode: "PROVIDER_RED",
      unavailability: { code: "PROVIDER_UNAVAILABLE" },
    });
    expect(mocks.voiceCount).not.toHaveBeenCalled();
  });

  it("rejects visually precise content before provider and classifier work", async () => {
    const params = baseParams();
    const result = await shouldGenerateVoice({
      ...params,
      assistantText: "Run this exact command:\n```sh\nbun run build\n```",
    });

    expect(result).toMatchObject({
      shouldGenerateVoice: false,
      category: "TEXT_REQUIRED",
      reasonCode: "TEXT_REQUIRED",
    });
    expect(params.systemLoad).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("uses a deterministic strong-moment fast path", async () => {
    const result = await shouldGenerateVoice({
      ...baseParams(),
      userMessage: "I feel anxious and overwhelmed before tomorrow",
    });

    expect(result).toMatchObject({
      shouldGenerateVoice: true,
      category: "VOICE_STRONG",
      reasonCode: "STRONG_MOMENT",
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("suppresses natural audio, but not strong audio, in yellow capacity", async () => {
    const natural = await shouldGenerateVoice({
      ...baseParams(),
      systemLoad: 0.2,
    });
    const strong = await shouldGenerateVoice({
      ...baseParams(),
      userMessage: "I need emotional support right now",
      systemLoad: 0.2,
    });

    expect(natural.reasonCode).toBe("PROVIDER_YELLOW");
    expect(strong.reasonCode).toBe("STRONG_MOMENT");
    expect(strong.shouldGenerateVoice).toBe(true);
  });

  it("does not classify when the automatic budget is already exhausted", async () => {
    mocks.voiceCount.mockResolvedValue(6);

    const result = await shouldGenerateVoice(baseParams());

    expect(result.reasonCode).toBe("AUTOMATIC_BUDGET_REACHED");
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("tracks voice usage and cost", async () => {
    await trackVoiceUsage("user-9", 123, "WEB", 0.12);

    expect(mocks.voiceCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-9",
        characterCount: 123,
        costUsd: 0.12,
        channel: "WEB",
      },
    });
  });
});
