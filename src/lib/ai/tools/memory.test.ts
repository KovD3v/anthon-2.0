import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tool: vi.fn(),
  memoryFindMany: vi.fn(),
  memoryFindFirst: vi.fn(),
  memoryUpdate: vi.fn(),
  memoryCreate: vi.fn(),
  memoryDelete: vi.fn(),
}));

vi.mock("ai", () => ({
  tool: mocks.tool,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    memory: {
      findMany: mocks.memoryFindMany,
      findFirst: mocks.memoryFindFirst,
      update: mocks.memoryUpdate,
      create: mocks.memoryCreate,
      delete: mocks.memoryDelete,
    },
  },
}));

import {
  createMemoryTools,
  formatMemoriesForPrompt,
  invalidateMemoriesForPromptCache,
} from "./memory";

describe("ai/tools/memory", () => {
  beforeEach(() => {
    mocks.tool.mockReset();
    mocks.tool.mockImplementation((definition) => definition);
    mocks.memoryFindMany.mockReset();
    mocks.memoryFindFirst.mockReset();
    mocks.memoryUpdate.mockReset();
    mocks.memoryCreate.mockReset();
    mocks.memoryDelete.mockReset();
  });

  it("saveMemory creates a record when key does not exist", async () => {
    mocks.memoryFindFirst.mockResolvedValue(null);
    mocks.memoryCreate.mockResolvedValue({ id: "m1" });

    const tools = createMemoryTools("user-1");
    type SaveResult = { success: boolean; message: string };
    const saveExec = tools.saveMemory.execute as unknown as (args: object) => Promise<SaveResult>;
    const result = await saveExec({
      key: "knee_injury",
      value: "left knee pain",
      category: "health",
    });

    expect(result.success).toBe(true);
    expect(mocks.memoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          key: "knee_injury",
        }),
      }),
    );
  });

  it("saveMemory updates existing key", async () => {
    mocks.memoryFindFirst.mockResolvedValue({ id: "existing-1" });
    mocks.memoryUpdate.mockResolvedValue({ id: "existing-1" });

    const tools = createMemoryTools("user-1");
    type SaveResult = { success: boolean; message: string };
    const saveExec = tools.saveMemory.execute as unknown as (args: object) => Promise<SaveResult>;
    const result = await saveExec({
      key: "training_schedule",
      value: "Tuesday/Thursday",
      category: "schedule",
    });

    expect(result.success).toBe(true);
    expect(mocks.memoryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "existing-1" },
      }),
    );
  });

  it("deleteMemory returns not found when key is missing", async () => {
    mocks.memoryFindFirst.mockResolvedValue(null);

    const tools = createMemoryTools("user-1");
    type DeleteResult = { success: boolean; message: string };
    const deleteExec = tools.deleteMemory.execute as unknown as (args: object) => Promise<DeleteResult>;
    const result = await deleteExec({ key: "unknown" });

    expect(result.success).toBe(false);
    expect(result.message).toContain("non trovata");
    expect(mocks.memoryDelete).not.toHaveBeenCalled();
  });

  it("formatMemoriesForPrompt caches output and supports invalidation", async () => {
    const userId = "user-cache";
    mocks.memoryFindMany.mockResolvedValue([
      {
        key: "favorite_exercise",
        value: {
          content: "Back squat",
          category: "sport",
          confidence: 0.9,
        },
      },
    ]);

    const first = await formatMemoriesForPrompt(userId);
    const second = await formatMemoriesForPrompt(userId);

    expect(first).toContain("Back squat");
    expect(second).toContain("Back squat");
    expect(mocks.memoryFindMany).toHaveBeenCalledTimes(1);

    invalidateMemoriesForPromptCache(userId);
    await formatMemoriesForPrompt(userId);
    expect(mocks.memoryFindMany).toHaveBeenCalledTimes(2);
  });
});
