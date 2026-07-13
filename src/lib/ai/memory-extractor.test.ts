import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  memoryUpsert: vi.fn(),
  userUpdate: vi.fn(),
  invalidateMemoriesForPromptCache: vi.fn(),
  trackSupportAiUsage: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
}));

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
    mocks.loggerWarn.mockReset();
    mocks.loggerError.mockReset();
    mocks.memoryUpsert.mockReset();
    mocks.userUpdate.mockReset();
    mocks.invalidateMemoriesForPromptCache.mockReset();
    mocks.trackSupportAiUsage.mockReset();

    mocks.memoryUpsert.mockResolvedValue({});
    mocks.userUpdate.mockResolvedValue({});
    mocks.trackSupportAiUsage.mockResolvedValue(undefined);
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
      text: JSON.stringify({
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
      }),
      usage: { inputTokens: 120, outputTokens: 30 },
      providerMetadata: { openrouter: { usage: { cost: 0.002 } } },
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
    expect(mocks.trackSupportAiUsage).toHaveBeenCalledWith({
      userId: "user-1",
      modelId: "sub-agent-model-id",
      usage: { inputTokens: 120, outputTokens: 30 },
      providerMetadata: { openrouter: { usage: { cost: 0.002 } } },
    });
  });

  it("persists distinct facts in bounded concurrent batches", async () => {
    const resolveWrites: Array<() => void> = [];
    mocks.memoryUpsert.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveWrites.push(resolve);
        }),
    );
    mocks.generateText.mockResolvedValue({
      text: JSON.stringify({
        facts: [
          {
            key: "user_name",
            value: "Ada",
            category: "identity",
            confidence: 0.95,
          },
          {
            key: "user_sport",
            value: "tennis",
            category: "sport",
            confidence: 0.9,
          },
          {
            key: "user_goal",
            value: "win a match",
            category: "goal",
            confidence: 0.9,
          },
          {
            key: "user_schedule",
            value: "Sunday morning",
            category: "schedule",
            confidence: 0.9,
          },
          {
            key: "user_preference",
            value: "outdoor training",
            category: "preference",
            confidence: 0.9,
          },
        ],
      }),
    });

    const extraction = extractAndSaveMemories(
      "user-1",
      "My name is Ada, I play tennis, and I want to win a match this season.",
      "We can build a schedule that supports your tennis goal.",
    );

    await vi.waitFor(() => {
      expect(mocks.memoryUpsert).toHaveBeenCalledTimes(4);
    });
    expect(
      mocks.memoryUpsert.mock.calls.map(([args]) => args.where.userId_key.key),
    ).toEqual(["user_name", "user_sport", "user_goal", "user_schedule"]);

    for (const resolve of resolveWrites.splice(0)) {
      resolve();
    }

    await vi.waitFor(() => {
      expect(mocks.memoryUpsert).toHaveBeenCalledTimes(5);
    });
    for (const resolve of resolveWrites.splice(0)) {
      resolve();
    }

    await extraction;

    expect(mocks.invalidateMemoriesForPromptCache).toHaveBeenCalledWith(
      "user-1",
    );
    expect(mocks.userUpdate).toHaveBeenCalledTimes(1);
  });

  it("keeps only the latest accepted fact for duplicate keys", async () => {
    mocks.generateText.mockResolvedValue({
      text: JSON.stringify({
        facts: [
          {
            key: "user_sport",
            value: "running",
            category: "sport",
            confidence: 0.9,
          },
          {
            key: "user_sport",
            value: "cycling",
            category: "sport",
            confidence: 0.95,
          },
          {
            key: "user_sport",
            value: "not-saved",
            category: "sport",
            confidence: 0.4,
          },
        ],
      }),
    });

    await extractAndSaveMemories(
      "user-1",
      "I have switched from running to cycling as my main sport this year.",
      "Cycling can be a great primary training focus.",
    );

    expect(mocks.memoryUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.memoryUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_key: { userId: "user-1", key: "user_sport" },
        },
        update: expect.objectContaining({
          value: expect.objectContaining({ content: "cycling" }),
        }),
        create: expect.objectContaining({
          value: expect.objectContaining({ content: "cycling" }),
        }),
      }),
    );
  });

  it("keeps the cache and activity untouched after a partial persistence failure", async () => {
    const writeError = new Error("database unavailable");
    mocks.memoryUpsert.mockImplementation((args) => {
      if (args.where.userId_key.key === "user_goal") {
        return Promise.reject(writeError);
      }

      return Promise.resolve({});
    });
    mocks.generateText.mockResolvedValue({
      text: JSON.stringify({
        facts: [
          {
            key: "user_name",
            value: "Ada",
            category: "identity",
            confidence: 0.95,
          },
          {
            key: "user_sport",
            value: "tennis",
            category: "sport",
            confidence: 0.9,
          },
          {
            key: "user_goal",
            value: "win a match",
            category: "goal",
            confidence: 0.9,
          },
          {
            key: "user_schedule",
            value: "Sunday morning",
            category: "schedule",
            confidence: 0.9,
          },
          {
            key: "user_preference",
            value: "outdoor training",
            category: "preference",
            confidence: 0.9,
          },
        ],
      }),
    });

    await expect(
      extractAndSaveMemories(
        "user-1",
        "My name is Ada, I play tennis, and I want to win a match this season.",
        "We can build a schedule that supports your tennis goal.",
      ),
    ).resolves.toBeUndefined();

    expect(mocks.memoryUpsert).toHaveBeenCalledTimes(5);
    expect(mocks.invalidateMemoriesForPromptCache).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "memory_persistence_failed",
      "One or more memory facts could not be persisted",
      {
        error: [writeError],
        failedKeys: ["user_goal"],
        userId: "user-1",
      },
    );
  });

  it("updates last activity even when no facts pass confidence threshold", async () => {
    mocks.generateText.mockResolvedValue({
      text: JSON.stringify({
        facts: [
          {
            key: "user_goal",
            value: "win next match",
            category: "goal",
            confidence: 0.5,
          },
        ],
      }),
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

  it("skips invalid extractor output without logging an error", async () => {
    mocks.generateText.mockResolvedValue({
      text: "",
      usage: { inputTokens: 20, outputTokens: 0 },
      providerMetadata: { openrouter: { usage: { cost: 0.0001 } } },
    });

    await extractAndSaveMemories(
      "user-1",
      "I play football every week and want to improve endurance quickly.",
      "Let's build a progressive training plan.",
    );

    expect(mocks.memoryUpsert).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.trackSupportAiUsage).toHaveBeenCalledWith({
      userId: "user-1",
      modelId: "sub-agent-model-id",
      usage: { inputTokens: 20, outputTokens: 0 },
      providerMetadata: { openrouter: { usage: { cost: 0.0001 } } },
    });
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "extraction_skipped",
      "Memory extractor returned no parseable output",
      expect.objectContaining({ userId: "user-1" }),
    );
    expect(mocks.loggerError).not.toHaveBeenCalled();
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
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "extraction_failed",
      "Error extracting memories",
      expect.objectContaining({ userId: "user-1" }),
    );
  });
});
