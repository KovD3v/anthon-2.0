import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  outputObject: vi.fn(),
  memoryFindMany: vi.fn(),
  transaction: vi.fn(),
  invalidateMemoriesForPromptCache: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: {
    object: mocks.outputObject,
  },
}));

vi.mock("@/lib/ai/providers/openrouter", () => ({
  maintenanceModel: "maintenance-model",
}));

vi.mock("@/lib/ai/tools/memory", () => ({
  invalidateMemoriesForPromptCache: mocks.invalidateMemoriesForPromptCache,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    memory: {
      findMany: mocks.memoryFindMany,
    },
    $transaction: mocks.transaction,
  },
}));

import { consolidateMemories } from "./memory-consolidation";

function buildMemories(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `memory-${i + 1}`,
    key: `key-${i + 1}`,
    value: {
      content: `content-${i + 1}`,
      category: "preference",
      confidence: 0.8,
    },
  }));
}

describe("maintenance/memory-consolidation", () => {
  beforeEach(() => {
    mocks.generateText.mockReset();
    mocks.outputObject.mockReset();
    mocks.memoryFindMany.mockReset();
    mocks.transaction.mockReset();
    mocks.invalidateMemoriesForPromptCache.mockReset();

    mocks.outputObject.mockReturnValue({ schema: "mocked-schema" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns early when there are fewer than 5 memories", async () => {
    mocks.memoryFindMany.mockResolvedValue(buildMemories(4));

    await consolidateMemories("user-1");

    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.invalidateMemoriesForPromptCache).not.toHaveBeenCalled();
  });

  it("returns without applying changes when AI output has no consolidations", async () => {
    mocks.memoryFindMany.mockResolvedValue(buildMemories(5));
    mocks.generateText.mockResolvedValue({
      output: {
        memories: [],
      },
    });

    await consolidateMemories("user-1");

    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.invalidateMemoriesForPromptCache).not.toHaveBeenCalled();
  });

  it("applies consolidation changes in a transaction and invalidates prompt cache", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-17T12:00:00.000Z"));

    mocks.memoryFindMany.mockResolvedValue(buildMemories(5));
    mocks.generateText.mockResolvedValue({
      output: {
        memories: [
          {
            originalKeys: ["key-1", "key-2"],
            newKey: "user_sport",
            newValue: "tennis",
            category: "sport",
            confidence: 0.95,
            reasoning: "Merged duplicate sport facts",
          },
          {
            originalKeys: ["key-3"],
            newKey: "user_goal",
            newValue: "increase endurance",
            category: "goal",
            confidence: 0.9,
            reasoning: "Higher confidence and specificity",
          },
        ],
      },
    });

    const tx = {
      memory: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };

    mocks.transaction.mockImplementation(
      async (fn: (client: typeof tx) => Promise<unknown>) => await fn(tx),
    );

    await consolidateMemories("user-1");

    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "maintenance-model",
        prompt: expect.stringContaining("- [key-1]"),
      }),
    );
    expect(tx.memory.deleteMany).toHaveBeenNthCalledWith(1, {
      where: {
        userId: "user-1",
        key: { in: ["key-1", "key-2"] },
      },
    });
    expect(tx.memory.upsert).toHaveBeenNthCalledWith(1, {
      where: {
        userId_key: { userId: "user-1", key: "user_sport" },
      },
      update: {
        value: {
          content: "tennis",
          category: "sport",
          confidence: 0.95,
          consolidatedAt: "2026-02-17T12:00:00.000Z",
          reasoning: "Merged duplicate sport facts",
        },
      },
      create: {
        userId: "user-1",
        key: "user_sport",
        value: {
          content: "tennis",
          category: "sport",
          confidence: 0.95,
          consolidatedAt: "2026-02-17T12:00:00.000Z",
          reasoning: "Merged duplicate sport facts",
          createdAt: "2026-02-17T12:00:00.000Z",
        },
      },
    });
    expect(tx.memory.deleteMany).toHaveBeenCalledTimes(2);
    expect(tx.memory.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.invalidateMemoriesForPromptCache).toHaveBeenCalledWith(
      "user-1",
    );
  });

  it("swallows AI errors and does not throw", async () => {
    mocks.memoryFindMany.mockResolvedValue(buildMemories(7));
    mocks.generateText.mockRejectedValue(new Error("ai unavailable"));

    await expect(consolidateMemories("user-1")).resolves.toBeUndefined();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.invalidateMemoriesForPromptCache).not.toHaveBeenCalled();
  });
});
