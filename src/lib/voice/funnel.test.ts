import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VoicePlanConfig } from "./config";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  outputObject: vi.fn(),
  voiceCount: vi.fn(),
  voiceCreate: vi.fn(),
  dailyUsageUpsert: vi.fn(),
  measure: vi.fn(),
  trackSupportAiUsage: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: {
    object: mocks.outputObject,
  },
}));

vi.mock("@/lib/ai/providers/openrouter", () => ({
  maintenanceModel: "mock-maintenance-model",
  MAINTENANCE_MODEL_ID: "maintenance-model-id",
}));

vi.mock("@/lib/ai/usage-meter", () => ({
  trackSupportAiUsage: mocks.trackSupportAiUsage,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    voiceUsage: {
      count: mocks.voiceCount,
      create: mocks.voiceCreate,
    },
    dailyUsage: {
      upsert: mocks.dailyUsageUpsert,
    },
  },
}));

vi.mock("@/lib/latency-logger", () => ({
  LatencyLogger: {
    measure: mocks.measure,
  },
}));

import { shouldGenerateVoice, trackVoiceUsage } from "./funnel";

const enabledPlanConfig: VoicePlanConfig = {
  enabled: true,
  baseProbability: 0.5,
  decayFactor: 1,
  capWindowMs: 10 * 60 * 1000,
  maxPerWindow: 10,
};

function baseParams() {
  return {
    userId: "user-1",
    userMessage: "Puoi spiegarmelo meglio?",
    assistantText:
      "Certo, ti spiego passo passo in modo semplice e discorsivo per aiutarti.",
    conversationContext: [
      { role: "user", content: "Ciao" },
      { role: "assistant", content: "Ciao, come posso aiutarti?" },
    ],
    userPreferences: { voiceEnabled: true },
    planConfig: enabledPlanConfig,
    systemLoad: 1,
    planId: "my-basic-plan",
  };
}

describe("voice/funnel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-16T12:00:00.000Z"));
    mocks.generateText.mockReset();
    mocks.outputObject.mockReset();
    mocks.voiceCount.mockReset();
    mocks.voiceCreate.mockReset();
    mocks.measure.mockReset();
    mocks.trackSupportAiUsage.mockReset();

    mocks.outputObject.mockImplementation(
      ({ schema }: { schema: unknown }) => ({ schema }),
    );
    mocks.measure.mockImplementation(
      async (_name: string, fn: () => unknown | Promise<unknown>) => fn(),
    );
    mocks.voiceCount.mockResolvedValue(0);
    mocks.trackSupportAiUsage.mockResolvedValue(undefined);
    mocks.generateText.mockResolvedValue({
      output: {
        decision: "VOICE",
        reason: "conversational",
        confidence: 0.9,
      },
      usage: { inputTokens: 70, outputTokens: 9 },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("blocks at L1 when plan voice is disabled", async () => {
    const result = await shouldGenerateVoice({
      ...baseParams(),
      planConfig: { ...enabledPlanConfig, enabled: false },
    });

    expect(result).toEqual({
      shouldGenerateVoice: false,
      blockedAt: "L1_PREFERENCE",
      reason: "Voice not enabled for plan",
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.voiceCount).not.toHaveBeenCalled();
  });

  it("blocks at L1 when quiet mode is enabled", async () => {
    const result = await shouldGenerateVoice({
      ...baseParams(),
      userPreferences: { voiceEnabled: false },
    });

    expect(result).toEqual({
      shouldGenerateVoice: false,
      blockedAt: "L1_PREFERENCE",
      reason: "Quiet mode enabled",
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.voiceCount).not.toHaveBeenCalled();
  });

  it("blocks at L2 for structurally invalid text", async () => {
    const result = await shouldGenerateVoice({
      ...baseParams(),
      assistantText: "Too short",
    });

    expect(result).toEqual({
      shouldGenerateVoice: false,
      blockedAt: "L2_STRUCTURE",
      reason: "Text too short",
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.voiceCount).not.toHaveBeenCalled();
  });

  it("blocks at L3 when semantic model returns TEXT", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        decision: "TEXT",
        reason: "technical_list",
        confidence: 0.95,
      },
    });

    const result = await shouldGenerateVoice(baseParams());

    expect(result).toEqual({
      shouldGenerateVoice: false,
      blockedAt: "L3_SEMANTIC",
      reason: "Semantic: technical_list",
    });
  });

  it("blocks at L3 when semantic confidence is low", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        decision: "VOICE",
        reason: "conversational",
        confidence: 0.4,
      },
    });

    const result = await shouldGenerateVoice(baseParams());

    expect(result).toEqual({
      shouldGenerateVoice: false,
      blockedAt: "L3_SEMANTIC",
      reason: "Low confidence, defaulting to text",
    });
  });

  it("blocks at L3 when semantic classification throws", async () => {
    mocks.generateText.mockRejectedValue(new Error("semantic unavailable"));

    const result = await shouldGenerateVoice(baseParams());

    expect(result).toEqual({
      shouldGenerateVoice: false,
      blockedAt: "L3_SEMANTIC",
      reason: "Semantic classification error",
    });
  });

  it("blocks at L4 under critical load for non-pro plans", async () => {
    const result = await shouldGenerateVoice({
      ...baseParams(),
      systemLoad: 0.2,
      planId: "my-basic-plan",
    });

    expect(result).toEqual({
      shouldGenerateVoice: false,
      blockedAt: "L4_BUSINESS",
      reason: "System load critical, pro users only",
    });
    expect(mocks.voiceCount).not.toHaveBeenCalled();
  });

  it("blocks at L4 when voice cap has been reached", async () => {
    mocks.voiceCount.mockResolvedValue(10);

    const result = await shouldGenerateVoice(baseParams());

    expect(result).toEqual({
      shouldGenerateVoice: false,
      blockedAt: "L4_BUSINESS",
      reason: "Voice cap reached for window",
    });
  });

  it("blocks at L4 when probability check fails", async () => {
    mocks.voiceCount.mockResolvedValue(0);
    vi.spyOn(Math, "random").mockReturnValue(0.9);

    const result = await shouldGenerateVoice(baseParams());

    expect(result.shouldGenerateVoice).toBe(false);
    expect(result.blockedAt).toBe("L4_BUSINESS");
    expect(result.reason).toContain("Probability check failed");
  });

  it("honors an explicit voice request without semantic or probability gates", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const result = await shouldGenerateVoice({
      ...baseParams(),
      userMessage: "Please send me a voice message",
      assistantText: "Short",
    });

    expect(result).toEqual({
      shouldGenerateVoice: true,
      explicitVoiceRequest: true,
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(Math.random).not.toHaveBeenCalled();
  });

  it("returns a structured quota explanation for an explicit request", async () => {
    mocks.voiceCount.mockResolvedValue(enabledPlanConfig.maxPerWindow);

    const result = await shouldGenerateVoice({
      ...baseParams(),
      userMessage: "Mandami un vocale",
    });

    expect(result).toMatchObject({
      shouldGenerateVoice: false,
      explicitVoiceRequest: true,
      unavailability: {
        code: "QUOTA_REACHED",
        userMessage: expect.stringContaining("limit"),
      },
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("passes all levels when semantic and business checks pass", async () => {
    mocks.voiceCount.mockResolvedValue(0);
    vi.spyOn(Math, "random").mockReturnValue(0.1);

    const result = await shouldGenerateVoice(baseParams());

    expect(result).toEqual({ shouldGenerateVoice: true });
    expect(mocks.trackSupportAiUsage).toHaveBeenCalledWith({
      userId: "user-1",
      modelId: "maintenance-model-id",
      usage: { inputTokens: 70, outputTokens: 9 },
      providerMetadata: undefined,
    });
  });

  it("tracks voice usage with the expected payload", async () => {
    mocks.voiceCreate.mockResolvedValue({});
    mocks.dailyUsageUpsert.mockResolvedValue({});

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
