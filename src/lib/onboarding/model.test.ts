import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  getModelById: vi.fn(() => "onboarding-model"),
  getProviderOptions: vi.fn(() => ({ provider: { order: ["CoreWeave"] } })),
  trackSupportAiUsage: vi.fn(),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return { ...actual, generateText: mocks.generateText };
});
vi.mock("@/lib/ai/providers/openrouter", () => ({
  getModelById: mocks.getModelById,
}));
vi.mock("@/lib/ai/providers/openrouter-routing", () => ({
  getOpenRouterProviderOptionsForModel: mocks.getProviderOptions,
}));
vi.mock("@/lib/ai/usage-meter", () => ({
  trackSupportAiUsage: mocks.trackSupportAiUsage,
}));

import {
  interpretOnboardingAnswer,
  ONBOARDING_MODEL_ID,
} from "./model";

describe("onboarding model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.trackSupportAiUsage.mockResolvedValue(undefined);
  });

  it("uses the explicit DeepSeek model and returns structured extraction", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        extracted: { name: "Giulia", age: 29 },
        currentFieldStatus: "accepted",
        clarification: null,
        assistantMessage: "Piacere Giulia.",
      },
      usage: { inputTokens: 10, outputTokens: 5 },
      providerMetadata: { openrouter: { provider: "CoreWeave" } },
    });

    const result = await interpretOnboardingAnswer({
      userId: "user-1",
      currentField: "name",
      question: "Come vuoi che ti chiami?",
      userText: "Mi chiamo Giulia e ho 29 anni",
      draft: {
        name: null,
        age: null,
        occupation: null,
        sport: null,
        experience: null,
        goal: null,
      },
    });

    expect(ONBOARDING_MODEL_ID).toBe("deepseek/deepseek-v4-flash-0731");
    expect(mocks.getModelById).toHaveBeenCalledWith(ONBOARDING_MODEL_ID);
    expect(mocks.getProviderOptions).toHaveBeenCalledWith(ONBOARDING_MODEL_ID);
    expect(result).toMatchObject({
      currentFieldStatus: "accepted",
      extracted: { name: "Giulia", age: 29 },
    });
    expect(mocks.trackSupportAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        modelId: ONBOARDING_MODEL_ID,
      }),
    );
  });

  it("returns a non-advancing fallback when generation fails", async () => {
    mocks.generateText.mockRejectedValue(new Error("provider unavailable"));

    await expect(
      interpretOnboardingAnswer({
        userId: "user-1",
        currentField: "age",
        question: "Quanti anni hai?",
        userText: "29",
        draft: {
          name: "Giulia",
          age: null,
          occupation: null,
          sport: null,
          experience: null,
          goal: null,
        },
      }),
    ).resolves.toEqual({
      currentFieldStatus: "clarify",
      extracted: {},
      clarification: "Quanti anni hai?",
      assistantMessage: "Quanti anni hai?",
      unavailable: true,
    });
  });
});
