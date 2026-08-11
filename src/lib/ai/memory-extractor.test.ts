import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  trackSupportAiUsage: vi.fn(),
}));

vi.mock("ai", () => ({ generateText: mocks.generateText }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
  }),
}));
vi.mock("@/lib/ai/providers/openrouter", () => ({
  subAgentModel: "sub-agent-model",
  SUB_AGENT_MODEL_ID: "sub-agent-model-id",
}));
vi.mock("@/lib/ai/usage-meter", () => ({
  trackSupportAiUsage: mocks.trackSupportAiUsage,
}));

import { extractMemoryCandidates } from "./memory-extractor";

describe("ai/memory-extractor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.trackSupportAiUsage.mockResolvedValue(undefined);
  });

  it("skips messages too short to contain a supported durable fact", async () => {
    await expect(
      extractMemoryCandidates({
        userId: "user-1",
        userText: "ciao",
        assistantText: "Ciao!",
      }),
    ).resolves.toEqual([]);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("extracts strict user-supported candidates and records model usage", async () => {
    mocks.generateText.mockResolvedValue({
      text: JSON.stringify({
        facts: [
          {
            key: "training_schedule",
            value: "Martedì sera",
            category: "schedule",
            confidence: 0.94,
            sensitivity: "LOW",
            origin: "EXPLICIT",
            explicitSetting: false,
            durability: "DURABLE",
            evidence: "mi alleno ogni martedì sera",
          },
        ],
      }),
      usage: { inputTokens: 80, outputTokens: 20 },
      providerMetadata: { openrouter: { usage: { cost: 0.001 } } },
    });

    const result = await extractMemoryCandidates({
      userId: "user-1",
      userText: "Da questo mese mi alleno ogni martedì sera.",
      assistantText: "Perfetto, organizziamo la settimana.",
    });

    expect(result).toEqual([
      expect.objectContaining({
        key: "training_schedule",
        value: "Martedì sera",
        evidence: "mi alleno ogni martedì sera",
      }),
    ]);
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0,
        maxOutputTokens: 700,
        instructions: expect.stringContaining(
          "L'assistente non è mai la fonte",
        ),
      }),
    );
    expect(mocks.trackSupportAiUsage).toHaveBeenCalledWith({
      userId: "user-1",
      modelId: "sub-agent-model-id",
      usage: { inputTokens: 80, outputTokens: 20 },
      providerMetadata: { openrouter: { usage: { cost: 0.001 } } },
    });
  });

  it("rejects a candidate whose evidence is absent from the user message", async () => {
    mocks.generateText.mockResolvedValue({
      text: JSON.stringify({
        facts: [
          {
            key: "favorite_surface",
            value: "Terra rossa",
            category: "preference",
            confidence: 0.95,
            sensitivity: "LOW",
            origin: "INFERRED",
            explicitSetting: false,
            durability: "DURABLE",
            evidence: "preferisci la terra rossa",
          },
        ],
      }),
      usage: {},
      providerMetadata: {},
    });

    await expect(
      extractMemoryCandidates({
        userId: "user-1",
        userText: "Non so quale superficie scegliere per il prossimo torneo.",
        assistantText: "Probabilmente preferisci la terra rossa.",
      }),
    ).resolves.toEqual([]);
  });

  it("returns no candidates for malformed structured output", async () => {
    mocks.generateText.mockResolvedValue({
      text: '```json\n{"facts":[{"key":"missing-fields"}]}\n```',
      usage: {},
      providerMetadata: {},
    });

    await expect(
      extractMemoryCandidates({
        userId: "user-1",
        userText: "Mi alleno stabilmente tre volte ogni settimana.",
        assistantText: "Ottimo.",
      }),
    ).resolves.toEqual([]);
    expect(mocks.loggerWarn).toHaveBeenCalled();
  });

  it("fails open without logging conversation content", async () => {
    mocks.generateText.mockRejectedValue(new Error("provider unavailable"));

    await expect(
      extractMemoryCandidates({
        userId: "user-1",
        userText: "Informazione privata che non deve entrare nei log.",
        assistantText: "Ricevuto.",
      }),
    ).resolves.toEqual([]);
    expect(JSON.stringify(mocks.loggerError.mock.calls)).not.toContain(
      "Informazione privata",
    );
  });
});
