import { beforeEach, describe, expect, it, vi } from "vitest";

const memoryFindMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    memory: { findMany: memoryFindMany },
  },
}));

import { resolveExactMemoryDeleteTarget } from "./memory-target";

describe("ai/memory-target", () => {
  beforeEach(() => {
    memoryFindMany.mockReset();
  });

  it("resolves one exact stable key from an explicit natural forget request", async () => {
    memoryFindMany.mockResolvedValue([
      {
        key: "training_schedule",
        category: "schedule",
        value: { content: "Mi alleno al mattino" },
      },
    ]);

    await expect(
      resolveExactMemoryDeleteTarget({
        userId: "user-1",
        userMessage: "Dimentica la mia preferenza: mi alleno al mattino.",
      }),
    ).resolves.toBe("training_schedule");
  });

  it("does nothing when the natural forget request is ambiguous", async () => {
    memoryFindMany.mockResolvedValue([
      {
        key: "training_schedule",
        category: "schedule",
        value: { content: "Mi alleno al mattino" },
      },
      {
        key: "training_goal",
        category: "goal",
        value: { content: "Voglio migliorare la concentrazione" },
      },
    ]);

    await expect(
      resolveExactMemoryDeleteTarget({
        userId: "user-1",
        userMessage: "Dimentica questa informazione.",
      }),
    ).resolves.toBeNull();
  });

  it("fails closed when two stored memories tie for the same forget request", async () => {
    memoryFindMany.mockResolvedValue([
      {
        key: "training_schedule",
        category: "schedule",
        value: { content: "Mi alleno al mattino" },
      },
      {
        key: "preferred_training_time",
        category: "schedule",
        value: { content: "Mi alleno al mattino" },
      },
    ]);

    await expect(
      resolveExactMemoryDeleteTarget({
        userId: "user-1",
        userMessage: "Dimentica la mia preferenza: mi alleno al mattino.",
      }),
    ).resolves.toBeNull();
  });

  it("does nothing when an explicit forget request matches no memory", async () => {
    memoryFindMany.mockResolvedValue([
      {
        key: "training_goal",
        category: "goal",
        value: { content: "Voglio migliorare la concentrazione" },
      },
    ]);

    await expect(
      resolveExactMemoryDeleteTarget({
        userId: "user-1",
        userMessage: "Dimentica che mi alleno al mattino.",
      }),
    ).resolves.toBeNull();
  });

  it("does not treat a coaching instruction as a memory deletion request", async () => {
    memoryFindMany.mockResolvedValue([
      {
        key: "pre_game_tension",
        category: "conversation_topic",
        value: { content: "Tensione prima della gara" },
      },
    ]);

    await expect(
      resolveExactMemoryDeleteTarget({
        userId: "user-1",
        userMessage: "Elimina la tensione prima della gara.",
      }),
    ).resolves.toBeNull();
    expect(memoryFindMany).not.toHaveBeenCalled();
  });

  it("does not treat coaching language using dimentica as a memory deletion request", async () => {
    memoryFindMany.mockResolvedValue([
      {
        key: "pre_game_tension",
        category: "conversation_topic",
        value: { content: "Tensione prima della gara" },
      },
    ]);

    await expect(
      resolveExactMemoryDeleteTarget({
        userId: "user-1",
        userMessage: "Dimentica la tensione prima della gara e concentrati.",
      }),
    ).resolves.toBeNull();
    expect(memoryFindMany).not.toHaveBeenCalled();
  });
});
