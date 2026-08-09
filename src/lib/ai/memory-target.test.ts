import { beforeEach, describe, expect, it, vi } from "vitest";

const memoryFindMany = vi.hoisted(() => vi.fn());
const messageFindFirst = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    memory: { findMany: memoryFindMany },
    message: { findFirst: messageFindFirst },
  },
}));

import { resolveExactMemoryDeleteTarget } from "./memory-target";

describe("ai/memory-target", () => {
  beforeEach(() => {
    memoryFindMany.mockReset();
    messageFindFirst.mockReset();
  });

  it("resolves a unique forget-this target from the immediately preceding turn", async () => {
    messageFindFirst
      .mockResolvedValueOnce({ createdAt: new Date("2026-08-10T10:01:00Z") })
      .mockResolvedValueOnce({
        parts: [{ type: "text", text: "Va bene, tienilo a mente." }],
        generatedResponse: {
          userId: "user-1",
          conversationThreadId: "thread-1",
          direction: "OUTBOUND",
          role: "ASSISTANT",
          deletedAt: null,
          parts: [
            { type: "text", text: "Ricorderò che ti alleni al mattino." },
          ],
        },
      });
    memoryFindMany.mockResolvedValue([
      {
        key: "training_schedule",
        category: "schedule",
        value: { content: "Ti alleni al mattino" },
      },
      {
        key: "training_goal",
        category: "goal",
        value: { content: "Vuoi migliorare la concentrazione" },
      },
    ]);

    await expect(
      resolveExactMemoryDeleteTarget({
        userId: "user-1",
        userMessage: "Dimentica questa cosa.",
        conversationThreadId: "thread-1",
        currentUserMessageId: "inbound-current",
      }),
    ).resolves.toBe("training_schedule");

    expect(messageFindFirst).toHaveBeenNthCalledWith(1, {
      where: {
        id: "inbound-current",
        userId: "user-1",
        conversationThreadId: "thread-1",
        direction: "INBOUND",
        role: "USER",
        deletedAt: null,
      },
      select: { createdAt: true },
    });
    expect(messageFindFirst).toHaveBeenNthCalledWith(2, {
      where: {
        userId: "user-1",
        conversationThreadId: "thread-1",
        direction: "INBOUND",
        role: "USER",
        deletedAt: null,
        createdAt: { lt: new Date("2026-08-10T10:01:00Z") },
      },
      orderBy: { createdAt: "desc" },
      select: {
        parts: true,
        generatedResponse: {
          select: {
            userId: true,
            conversationThreadId: true,
            direction: true,
            role: true,
            deletedAt: true,
            parts: true,
          },
        },
      },
    });
  });

  it("does nothing when the preceding context strongly matches multiple memories", async () => {
    messageFindFirst
      .mockResolvedValueOnce({ createdAt: new Date("2026-08-10T10:01:00Z") })
      .mockResolvedValueOnce({
        parts: [
          {
            type: "text",
            text: "Mi alleno al mattino e voglio migliorare la concentrazione.",
          },
        ],
        generatedResponse: null,
      });
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
        userMessage: "Dimentica questa cosa",
        conversationThreadId: "thread-1",
        currentUserMessageId: "inbound-current",
      }),
    ).resolves.toBeNull();
  });

  it("does nothing for forget-this intent without server-owned context", async () => {
    await expect(
      resolveExactMemoryDeleteTarget({
        userId: "user-1",
        userMessage: "Dimentica questa cosa.",
      }),
    ).resolves.toBeNull();

    expect(messageFindFirst).not.toHaveBeenCalled();
    expect(memoryFindMany).not.toHaveBeenCalled();
  });

  it("fails closed when the preceding generated response is not server-owned", async () => {
    messageFindFirst
      .mockResolvedValueOnce({ createdAt: new Date("2026-08-10T10:01:00Z") })
      .mockResolvedValueOnce({
        parts: [{ type: "text", text: "Mi alleno al mattino." }],
        generatedResponse: {
          userId: "user-2",
          conversationThreadId: "thread-1",
          direction: "OUTBOUND",
          role: "ASSISTANT",
          deletedAt: null,
          parts: [{ type: "text", text: "Lo terrò a mente." }],
        },
      });

    await expect(
      resolveExactMemoryDeleteTarget({
        userId: "user-1",
        userMessage: "Dimentica questa cosa.",
        conversationThreadId: "thread-1",
        currentUserMessageId: "inbound-current",
      }),
    ).resolves.toBeNull();

    expect(memoryFindMany).not.toHaveBeenCalled();
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
