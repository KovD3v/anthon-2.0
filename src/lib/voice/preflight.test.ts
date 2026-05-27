import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VoicePlanConfig } from "./config";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  outputObject: vi.fn(),
  openrouter: vi.fn(),
  voiceCount: vi.fn(),
  getSystemLoad: vi.fn(),
  trackSupportAiUsage: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: {
    object: mocks.outputObject,
  },
}));

vi.mock("@/lib/ai/providers/openrouter", () => ({
  openrouter: mocks.openrouter,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    voiceUsage: {
      count: mocks.voiceCount,
    },
  },
}));

vi.mock("./elevenlabs", () => ({
  getSystemLoad: mocks.getSystemLoad,
}));

vi.mock("@/lib/ai/usage-meter", () => ({
  trackSupportAiUsage: mocks.trackSupportAiUsage,
}));

import { decideWebVoiceMode } from "./preflight";

const enabledPlanConfig: VoicePlanConfig = {
  enabled: true,
  baseProbability: 1,
  decayFactor: 1,
  capWindowMs: 10 * 60 * 1000,
  maxPerWindow: 10,
};

function baseParams() {
  return {
    userId: "user-1",
    userMessage: "Puoi aiutarmi a rimanere calmo prima della gara?",
    userPreferences: { voiceEnabled: true },
    planConfig: enabledPlanConfig,
    planId: "basic-plan",
    recentMessages: [
      { role: "user", content: "Sono un po' teso" },
      { role: "assistant", content: "Facciamo un reset rapido." },
    ],
  };
}

describe("voice/preflight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T18:00:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValue(0);

    mocks.generateText.mockReset();
    mocks.outputObject.mockReset();
    mocks.openrouter.mockReset();
    mocks.voiceCount.mockReset();
    mocks.getSystemLoad.mockReset();
    mocks.trackSupportAiUsage.mockReset();

    mocks.outputObject.mockImplementation(
      ({ schema }: { schema: unknown }) => ({ schema }),
    );
    mocks.openrouter.mockReturnValue("preflight-model");
    mocks.voiceCount.mockResolvedValue(0);
    mocks.getSystemLoad.mockResolvedValue(1);
    mocks.trackSupportAiUsage.mockResolvedValue(undefined);
    mocks.generateText.mockResolvedValue({
      output: {
        mode: "VOICE",
        reason: "conversational_support",
        confidence: 0.88,
      },
      usage: { inputTokens: 90, outputTokens: 10 },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns TEXT without calling the classifier when voice is disabled for the plan", async () => {
    const result = await decideWebVoiceMode({
      ...baseParams(),
      planConfig: { ...enabledPlanConfig, enabled: false },
    });

    expect(result).toEqual({
      mode: "TEXT",
      reason: "Voice not enabled for plan",
      source: "deterministic",
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("returns VOICE from the explicit user intent fast path", async () => {
    const result = await decideWebVoiceMode({
      ...baseParams(),
      userMessage: "Mandami un vocale breve per calmarmi",
    });

    expect(result).toEqual({
      mode: "VOICE",
      reason: "User explicitly requested voice",
      source: "deterministic",
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("returns TEXT when the classifier is unsure", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        mode: "VOICE",
        reason: "conversational_support",
        confidence: 0.52,
      },
    });

    const result = await decideWebVoiceMode(baseParams());

    expect(result).toEqual({
      mode: "TEXT",
      reason: "Classifier confidence below threshold",
      source: "classifier",
    });
    expect(mocks.getSystemLoad).not.toHaveBeenCalled();
    expect(mocks.voiceCount).not.toHaveBeenCalled();
  });

  it("uses Qwen Flash as the default classifier model", async () => {
    await decideWebVoiceMode(baseParams());

    expect(mocks.openrouter).toHaveBeenCalledWith("qwen/qwen3.5-flash-02-23");
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "preflight-model",
        timeout: { totalMs: 1000 },
      }),
    );
    expect(mocks.trackSupportAiUsage).toHaveBeenCalledWith({
      userId: "user-1",
      modelId: "qwen/qwen3.5-flash-02-23",
      usage: { inputTokens: 90, outputTokens: 10 },
      providerMetadata: undefined,
    });
  });
});
