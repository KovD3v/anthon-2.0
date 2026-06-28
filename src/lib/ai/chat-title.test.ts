import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  openrouter: vi.fn(),
  trackSupportAiUsage: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
}));

vi.mock("@/lib/ai/providers/openrouter", () => ({
  openrouter: mocks.openrouter,
}));

vi.mock("@/lib/ai/usage-meter", () => ({
  trackSupportAiUsage: mocks.trackSupportAiUsage,
}));

import { generateChatTitle } from "./chat-title";

describe("ai/chat-title", () => {
  beforeEach(() => {
    mocks.generateText.mockReset();
    mocks.openrouter.mockReset();
    mocks.trackSupportAiUsage.mockReset();
    mocks.openrouter.mockReturnValue("title-model");
    mocks.trackSupportAiUsage.mockResolvedValue(undefined);
    mocks.generateText.mockResolvedValue({
      text: "Piano Preparazione Partita.",
      usage: { inputTokens: 40, outputTokens: 5 },
    });
  });

  it("generates a cleaned title and tracks support usage when userId is provided", async () => {
    const title = await generateChatTitle("USER: help me prepare", {
      userId: "user-1",
    });

    expect(title).toBe("Piano Preparazione Partita");
    expect(mocks.trackSupportAiUsage).toHaveBeenCalledWith({
      userId: "user-1",
      modelId: "google/gemini-2.5-flash-lite",
      usage: { inputTokens: 40, outputTokens: 5 },
      providerMetadata: undefined,
    });
  });

  it("instructs the model to generate Italian chat titles", async () => {
    await generateChatTitle("USER: help me prepare");

    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("titolo in italiano"),
      }),
    );
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Non usare inglese"),
      }),
    );
  });

  it("normalizes noisy model output into a compact title", async () => {
    mocks.generateText.mockResolvedValueOnce({
      text: '"Titolo: Piano Preparazione Partita!!!"',
      usage: { inputTokens: 40, outputTokens: 8 },
    });

    const title = await generateChatTitle("USER: help me prepare");

    expect(title).toBe("Piano Preparazione Partita");
  });

  it("trims generated titles without cutting through a word", async () => {
    mocks.generateText.mockResolvedValueOnce({
      text: "Programmazione allenamenti settimanali per maratona autunnale con recupero",
      usage: { inputTokens: 40, outputTokens: 12 },
    });

    const title = await generateChatTitle(
      "USER: voglio preparare una maratona autunnale",
    );

    expect(title).toBe("Programmazione allenamenti settimanali per maratona");
    expect(title.length).toBeLessThanOrEqual(55);
  });

  it("uses a cleaned fallback title when generation fails", async () => {
    mocks.generateText.mockRejectedValueOnce(new Error("provider down"));

    const title = await generateChatTitle(
      "USER: ciao, vorrei preparare una routine di stretching per la schiena",
    );

    expect(title).toBe("Ciao vorrei preparare una routine");
  });
});
