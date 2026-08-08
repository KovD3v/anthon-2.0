import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  objectOutput: vi.fn((input) => input),
  openrouter: vi.fn(),
  trackSupportAiUsage: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: { object: mocks.objectOutput },
}));

vi.mock("@/lib/ai/providers/openrouter", () => ({
  openrouter: mocks.openrouter,
}));

vi.mock("@/lib/ai/usage-meter", () => ({
  trackSupportAiUsage: mocks.trackSupportAiUsage,
}));

import { generateChatMetadata } from "./chat-title";

const messages = [
  {
    role: "user" as const,
    text: "Ho sbagliato il rigore, devo resettare",
  },
];

describe("ai/chat-title", () => {
  beforeEach(() => {
    mocks.generateText.mockReset();
    mocks.openrouter.mockReset();
    mocks.objectOutput.mockClear();
    mocks.trackSupportAiUsage.mockReset();
    mocks.openrouter.mockReturnValue("metadata-model");
    mocks.trackSupportAiUsage.mockResolvedValue(undefined);
    mocks.generateText.mockResolvedValue({
      output: {
        title: "Reset mentale dopo rigore.",
        icon: "REFRESH_CCW",
      },
      usage: { inputTokens: 40, outputTokens: 8 },
      providerMetadata: undefined,
    });
  });

  it("returns cleaned structured metadata and meters the selected model", async () => {
    const metadata = await generateChatMetadata(
      messages,
      "Ho sbagliato il rigore, devo resettare",
      { userId: "user-1" },
    );

    expect(metadata).toEqual({
      title: "Reset mentale dopo rigore",
      icon: "REFRESH_CCW",
    });
    expect(mocks.trackSupportAiUsage).toHaveBeenCalledWith({
      userId: "user-1",
      modelId: "deepseek/deepseek-v4-flash",
      usage: { inputTokens: 40, outputTokens: 8 },
      providerMetadata: undefined,
    });
  });

  it("requests schema-constrained output with low metadata variance", async () => {
    await generateChatMetadata(messages, messages[0].text);

    expect(mocks.objectOutput).toHaveBeenCalledOnce();
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "metadata-model",
        temperature: 0.2,
        maxOutputTokens: 80,
        output: expect.objectContaining({ schema: expect.anything() }),
      }),
    );
  });

  it("normalizes noisy model titles without changing the selected icon", async () => {
    mocks.generateText.mockResolvedValueOnce({
      output: {
        title: '"Titolo: Piano Preparazione Partita!!!"',
        icon: "TROPHY",
      },
      usage: { inputTokens: 40, outputTokens: 8 },
    });

    await expect(
      generateChatMetadata(messages, messages[0].text),
    ).resolves.toEqual({
      title: "Piano Preparazione Partita",
      icon: "TROPHY",
    });
  });

  it("trims generated titles without cutting through a word", async () => {
    mocks.generateText.mockResolvedValueOnce({
      output: {
        title:
          "Programmazione allenamenti settimanali per maratona autunnale con recupero",
        icon: "CALENDAR_DAYS",
      },
      usage: { inputTokens: 40, outputTokens: 12 },
    });

    const metadata = await generateChatMetadata(
      [
        {
          role: "user",
          text: "Voglio preparare una maratona autunnale",
        },
      ],
      "Voglio preparare una maratona autunnale",
    );

    expect(metadata.title).toBe(
      "Programmazione allenamenti settimanali per maratona",
    );
    expect(metadata.title.length).toBeLessThanOrEqual(55);
    expect(metadata.icon).toBe("CALENDAR_DAYS");
  });

  it("uses a cleaned neutral fallback when generation fails", async () => {
    mocks.generateText.mockRejectedValueOnce(new Error("provider down"));

    await expect(
      generateChatMetadata(
        [
          {
            role: "user",
            text: "Ciao, vorrei preparare una routine di stretching per la schiena",
          },
        ],
        "Ciao, vorrei preparare una routine di stretching per la schiena",
      ),
    ).resolves.toEqual({
      title: "Ciao vorrei preparare una routine",
      icon: "MESSAGE_SQUARE",
    });
  });

  it("uses the neutral fallback when the cleaned title is empty", async () => {
    mocks.generateText.mockResolvedValueOnce({
      output: { title: "Titolo:", icon: "TARGET" },
      usage: { inputTokens: 20, outputTokens: 3 },
    });

    await expect(
      generateChatMetadata(messages, messages[0].text),
    ).resolves.toEqual({
      title: "Ho sbagliato il rigore devo resettare",
      icon: "MESSAGE_SQUARE",
    });
  });

  it("uses the neutral fallback when structured metadata is invalid", async () => {
    mocks.generateText.mockResolvedValueOnce({
      output: { title: "Reset dopo errore", icon: "UNKNOWN" },
      usage: { inputTokens: 20, outputTokens: 4 },
    });

    await expect(
      generateChatMetadata(messages, messages[0].text),
    ).resolves.toEqual({
      title: "Ho sbagliato il rigore devo resettare",
      icon: "MESSAGE_SQUARE",
    });
  });
});
