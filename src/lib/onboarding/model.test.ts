import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  getModelById: vi.fn(() => "onboarding-model"),
  getProviderOptions: vi.fn(() => ({ provider: { order: ["CoreWeave"] } })),
  getExecutionProviderOptions: vi.fn(() => ({
    provider: { order: ["CoreWeave"] },
    reasoning: { enabled: false, max_tokens: 1 },
  })),
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
  getOpenRouterProviderOptionsForExecution: mocks.getExecutionProviderOptions,
}));
vi.mock("@/lib/ai/usage-meter", () => ({
  trackSupportAiUsage: mocks.trackSupportAiUsage,
}));

import { interpretOnboardingAnswer, ONBOARDING_MODEL_ID } from "./model";

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
    expect(mocks.getExecutionProviderOptions).toHaveBeenCalledWith(
      ONBOARDING_MODEL_ID,
      "light",
    );
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

  it("passes recent clarification context to preserve previously stated details", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        extracted: {
          sport: "palestra",
          experience: "secondo anno di università",
        },
        currentFieldStatus: "accepted",
        clarification: null,
        assistantMessage: "Perfetto.",
      },
      usage: { inputTokens: 10, outputTokens: 5 },
      providerMetadata: { openrouter: { provider: "CoreWeave" } },
    });

    await interpretOnboardingAnswer({
      userId: "user-1",
      currentField: "sportOrSchool",
      question:
        "Se pratichi uno sport, quale pratichi e a che livello? Se studi, in che classe o anno sei?",
      userText: "università perdonami",
      draft: {
        name: "Antonio",
        age: 20,
        occupation: "studente di ingegneria informatica",
        sport: null,
        experience: null,
        goal: null,
      },
      context: [
        {
          role: "assistant",
          content:
            "Se pratichi uno sport, quale pratichi e a che livello? Se studi, in che classe o anno sei?",
        },
        {
          role: "user",
          content: "faccio palestra e sono al secondo anno",
        },
        {
          role: "assistant",
          content:
            "Per 'secondo anno' intendi il secondo anno di università o il livello di esperienza in palestra?",
        },
      ],
    });

    const call = mocks.generateText.mock.calls.at(-1)?.[0] as {
      instructions: string;
      prompt: string;
    };
    expect(call.prompt).toContain("faccio palestra e sono al secondo anno");
    expect(call.prompt).toContain("università perdonami");
    expect(call.instructions).toContain("richiesta di chiarimento");
    expect(call.instructions).toContain("ha già detto");
    expect(call.instructions).toContain("secondo anno di università");
  });
});
