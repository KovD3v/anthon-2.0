import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  outputObject: vi.fn(),
  memoryUpsert: vi.fn(),
  userUpdate: vi.fn(),
  invalidateMemoriesForPromptCache: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: {
    object: mocks.outputObject,
  },
}));

vi.mock("@/lib/ai/providers/openrouter", () => ({
  subAgentModel: "sub-agent-model",
}));

vi.mock("@/lib/ai/tools/memory", () => ({
  invalidateMemoriesForPromptCache: mocks.invalidateMemoriesForPromptCache,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    memory: {
      upsert: mocks.memoryUpsert,
    },
    user: {
      update: mocks.userUpdate,
    },
  },
}));

import { extractAndSaveMemories } from "./memory-extractor";

describe("ai/memory-extractor", () => {
  beforeEach(() => {
    mocks.generateText.mockReset();
    mocks.outputObject.mockReset();
    mocks.memoryUpsert.mockReset();
    mocks.userUpdate.mockReset();
    mocks.invalidateMemoriesForPromptCache.mockReset();

    mocks.outputObject.mockReturnValue({ schema: "mocked" });
    mocks.memoryUpsert.mockResolvedValue({});
    mocks.userUpdate.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns early for short/low-word user messages", async () => {
    await extractAndSaveMemories("user-1", "ciao", "Ciao!");

    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.memoryUpsert).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.invalidateMemoriesForPromptCache).not.toHaveBeenCalled();
  });

  it("saves only high-confidence facts, invalidates cache, and updates activity", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-17T15:00:00.000Z"));

    mocks.generateText.mockResolvedValue({
      output: {
        facts: [
          {
            key: "user_sport",
            value: "tennis",
            category: "sport",
            confidence: 0.9,
          },
          {
            key: "user_note",
            value: "likes training",
            category: "preference",
            confidence: 0.3,
          },
        ],
      },
    });

    await extractAndSaveMemories(
      "user-1",
      "I play tennis every Sunday and train consistently with my coach.",
      "Great, we can structure your week around tennis sessions.",
    );

    expect(mocks.memoryUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.memoryUpsert).toHaveBeenCalledWith({
      where: {
        userId_key: { userId: "user-1", key: "user_sport" },
      },
      update: {
        value: {
          content: "tennis",
          category: "sport",
          confidence: 0.9,
          updatedAt: "2026-02-17T15:00:00.000Z",
        },
      },
      create: {
        userId: "user-1",
        key: "user_sport",
        value: {
          content: "tennis",
          category: "sport",
          confidence: 0.9,
          createdAt: "2026-02-17T15:00:00.000Z",
        },
      },
    });
    expect(mocks.invalidateMemoriesForPromptCache).toHaveBeenCalledWith(
      "user-1",
    );
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { lastActivityAt: new Date("2026-02-17T15:00:00.000Z") },
    });
  });

  it("updates last activity even when no facts pass confidence threshold", async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        facts: [
          {
            key: "user_goal",
            value: "win next match",
            category: "goal",
            confidence: 0.5,
          },
        ],
      },
    });

    await extractAndSaveMemories(
      "user-1",
      "I may have a goal but I am not sure yet about specifics.",
      "Thanks, we can refine your goals together.",
    );

    expect(mocks.memoryUpsert).not.toHaveBeenCalled();
    expect(mocks.invalidateMemoriesForPromptCache).not.toHaveBeenCalled();
    expect(mocks.userUpdate).toHaveBeenCalledTimes(1);
  });

  it("swallows extraction errors and does not throw", async () => {
    mocks.generateText.mockRejectedValue(new Error("extractor unavailable"));

    await expect(
      extractAndSaveMemories(
        "user-1",
        "I play football every week and want to improve endurance quickly.",
        "Let's build a progressive training plan.",
      ),
    ).resolves.toBeUndefined();

    expect(mocks.memoryUpsert).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});
