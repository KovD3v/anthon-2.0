import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VoicePlanConfig } from "./config";

const mocks = vi.hoisted(() => ({
  voiceCount: vi.fn(),
  messageFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    voiceUsage: { count: mocks.voiceCount },
    message: { findMany: mocks.messageFindMany },
  },
}));

import { decideVoiceDelivery, getVoiceCapacityState } from "./decision";

const config: VoicePlanConfig = {
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
const now = new Date("2026-07-11T12:00:00.000Z");

function baseParams() {
  return {
    userId: "user-1",
    userPreferences: { voiceEnabled: true },
    planConfig: config,
    requestIntent: "UNSPECIFIED" as const,
    suitability: {
      category: "VOICE_NATURAL" as const,
      confidence: 0.8,
    },
    systemLoad: 1,
    channel: "WEB" as const,
    chatId: "chat-1",
    now,
  };
}

describe("voice/decision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.voiceCount.mockResolvedValue(0);
    mocks.messageFindMany.mockResolvedValue([]);
  });

  it("maps provider capacity into stable operating states", () => {
    expect(getVoiceCapacityState(0.3)).toBe("GREEN");
    expect(getVoiceCapacityState(0.29)).toBe("YELLOW");
    expect(getVoiceCapacityState(0.05)).toBe("YELLOW");
    expect(getVoiceCapacityState(0.049)).toBe("RED");
  });

  it.each([
    { load: 1, expected: "EXPLICIT_VOICE" },
    { load: 0.2, expected: "EXPLICIT_VOICE" },
    { load: 0.04, expected: "PROVIDER_RED" },
  ])(
    "handles explicit voice at load $load with $expected",
    async ({ load, expected }) => {
      const decision = await decideVoiceDelivery({
        ...baseParams(),
        requestIntent: "VOICE",
        suitability: { category: "VOICE_REQUIRED", confidence: 1 },
        systemLoad: load,
      });

      expect(decision.reason.code).toBe(expected);
    },
  );

  it.each([
    {
      overrides: { planConfig: { ...config, enabled: false } },
      expected: "PLAN_NOT_ELIGIBLE",
    },
    {
      overrides: { userPreferences: { voiceEnabled: false } },
      expected: "QUIET_MODE",
    },
    {
      overrides: { requestIntent: "TEXT" as const },
      expected: "EXPLICIT_TEXT",
    },
  ])(
    "returns $expected without lazy provider or suitability work",
    async ({ overrides, expected }) => {
      const load = vi.fn().mockResolvedValue(1);
      const classify = vi.fn().mockResolvedValue({
        category: "VOICE_NATURAL" as const,
        confidence: 0.9,
      });

      const decision = await decideVoiceDelivery({
        ...baseParams(),
        ...overrides,
        suitability: classify,
        systemLoad: load,
      });

      expect(decision.reason.code).toBe(expected);
      expect(load).not.toHaveBeenCalled();
      expect(classify).not.toHaveBeenCalled();
    },
  );

  it("enforces the hard rolling quota", async () => {
    mocks.voiceCount.mockResolvedValue(config.maxPerWindow);

    const decision = await decideVoiceDelivery(baseParams());

    expect(decision.reason.code).toBe("QUOTA_REACHED");
  });

  it("uses the more permissive of turn and time cadence", async () => {
    mocks.messageFindMany.mockResolvedValue([
      { type: "TEXT", createdAt: new Date("2026-07-11T11:59:30.000Z") },
      { type: "AUDIO", createdAt: new Date("2026-07-11T11:59:00.000Z") },
    ]);
    const blocked = await decideVoiceDelivery(baseParams());

    mocks.messageFindMany.mockResolvedValue([
      { type: "AUDIO", createdAt: new Date("2026-07-11T11:40:00.000Z") },
    ]);
    const allowedByTime = await decideVoiceDelivery(baseParams());

    expect(blocked.reason.code).toBe("CADENCE_COOLDOWN");
    expect(allowedByTime.reason.code).toBe("NATURAL_MOMENT");
  });

  it("uses the shorter strong cadence without allowing back-to-back audio", async () => {
    const strongParams = {
      ...baseParams(),
      suitability: { category: "VOICE_STRONG" as const, confidence: 0.9 },
    };
    mocks.messageFindMany.mockResolvedValue([
      { type: "AUDIO", createdAt: new Date("2026-07-11T11:59:00.000Z") },
    ]);
    const blocked = await decideVoiceDelivery(strongParams);

    mocks.messageFindMany.mockResolvedValue([
      { type: "TEXT", createdAt: new Date("2026-07-11T11:59:30.000Z") },
      { type: "AUDIO", createdAt: new Date("2026-07-11T11:59:00.000Z") },
    ]);
    const allowed = await decideVoiceDelivery(strongParams);

    expect(blocked.reason.code).toBe("CADENCE_COOLDOWN");
    expect(allowed.reason.code).toBe("STRONG_MOMENT");
  });

  it("prevents consecutive audio spam", async () => {
    mocks.messageFindMany.mockResolvedValue([
      { type: "AUDIO", createdAt: new Date("2026-07-11T11:59:00.000Z") },
      { type: "AUDIO", createdAt: new Date("2026-07-11T11:50:00.000Z") },
      { type: "TEXT", createdAt: new Date("2026-07-11T11:40:00.000Z") },
    ]);

    const decision = await decideVoiceDelivery(baseParams());

    expect(decision.reason.code).toBe("CONSECUTIVE_AUDIO_LIMIT");
  });

  it("lowers only the natural confidence threshold after a text drought", async () => {
    mocks.messageFindMany.mockResolvedValue(
      Array.from({ length: 8 }, (_, index) => ({
        type: "TEXT",
        createdAt: new Date(now.getTime() - index * 60_000),
      })),
    );

    const decision = await decideVoiceDelivery({
      ...baseParams(),
      suitability: { category: "VOICE_NATURAL", confidence: 0.62 },
    });

    expect(decision.shouldGenerateVoice).toBe(true);
    expect(decision.reason.code).toBe("ANTI_DROUGHT");
  });

  it("reserves the final quota share for explicit requests", async () => {
    mocks.voiceCount.mockResolvedValue(6);
    const automatic = await decideVoiceDelivery(baseParams());
    const explicit = await decideVoiceDelivery({
      ...baseParams(),
      requestIntent: "VOICE",
      suitability: { category: "VOICE_REQUIRED", confidence: 1 },
    });

    expect(automatic.reason.code).toBe("AUTOMATIC_BUDGET_REACHED");
    expect(explicit.reason.code).toBe("EXPLICIT_VOICE");
  });

  it("skips lazy suitability inference when hard business gates block audio", async () => {
    const classify = vi.fn().mockResolvedValue({
      category: "VOICE_NATURAL" as const,
      confidence: 0.9,
    });
    mocks.voiceCount.mockResolvedValue(3);

    const decision = await decideVoiceDelivery({
      ...baseParams(),
      suitability: classify,
    });

    expect(decision.reason.code).toBe("ANTI_SPAM_LIMIT");
    expect(classify).not.toHaveBeenCalled();
  });

  it("scopes web cadence by chat and external cadence by channel", async () => {
    await decideVoiceDelivery(baseParams());
    expect(mocks.messageFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ chatId: "chat-1" }),
      }),
    );

    await decideVoiceDelivery({
      ...baseParams(),
      channel: "TELEGRAM",
      chatId: "external-id",
    });
    expect(mocks.messageFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ channel: "TELEGRAM" }),
      }),
    );
    expect(
      mocks.messageFindMany.mock.calls.at(-1)?.[0].where.chatId,
    ).toBeUndefined();
  });

  it("excludes the assistant message being evaluated from cadence history", async () => {
    await decideVoiceDelivery({
      ...baseParams(),
      excludeMessageId: "assistant-current",
    });

    expect(mocks.messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: "assistant-current" },
        }),
      }),
    );
  });
});
