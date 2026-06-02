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
      text: "Match Prep Plan.",
      usage: { inputTokens: 40, outputTokens: 5 },
    });
  });

  it("generates a cleaned title and tracks support usage when userId is provided", async () => {
    const title = await generateChatTitle("USER: help me prepare", {
      userId: "user-1",
    });

    expect(title).toBe("Match Prep Plan");
    expect(mocks.trackSupportAiUsage).toHaveBeenCalledWith({
      userId: "user-1",
      modelId: "google/gemini-2.5-flash",
      usage: { inputTokens: 40, outputTokens: 5 },
      providerMetadata: undefined,
    });
  });
});
