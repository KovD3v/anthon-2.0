import { beforeEach, describe, expect, it, vi } from "vitest";

const memoryFindMany = vi.hoisted(() => vi.fn());
const messageFindFirst = vi.hoisted(() => vi.fn());
const messageFindMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    memory: { findMany: memoryFindMany },
    message: { findFirst: messageFindFirst, findMany: messageFindMany },
  },
}));

import {
  isDeletableStableMemoryKey,
  resolveExactMemoryDeleteTarget,
} from "./memory-target";

describe("ai/memory-target", () => {
  beforeEach(() => {
    memoryFindMany.mockReset();
    messageFindFirst.mockReset();
    messageFindMany.mockReset();
  });

  it.each([
    ["training_goal", true],
    ["identity", false],
    ["preference", false],
    ["*", false],
    ["training-*", false],
  ] as const)(
    "accepts only a specific stable deletion key: %s",
    (target, expected) => {
      expect(isDeletableStableMemoryKey(target)).toBe(expected);
    },
  );

  it("resolves a unique forget-this target from the immediately preceding turn", async () => {
    const precedingCreatedAt = new Date("2026-08-10T10:00:00Z");
    messageFindFirst
      .mockResolvedValueOnce({ createdAt: new Date("2026-08-10T10:01:00Z") })
      .mockResolvedValueOnce(null);
    messageFindMany.mockResolvedValueOnce([
      {
        createdAt: precedingCreatedAt,
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
      },
    ]);
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
        id: { not: "inbound-current" },
        userId: "user-1",
        conversationThreadId: "thread-1",
        direction: "INBOUND",
        role: "USER",
        deletedAt: null,
        createdAt: new Date("2026-08-10T10:01:00Z"),
      },
      select: { id: true },
    });
    expect(messageFindMany).toHaveBeenNthCalledWith(1, {
      where: {
        userId: "user-1",
        conversationThreadId: "thread-1",
        direction: "INBOUND",
        role: "USER",
        deletedAt: null,
        createdAt: { lt: new Date("2026-08-10T10:01:00Z") },
      },
      orderBy: { createdAt: "desc" },
      take: 2,
      select: {
        createdAt: true,
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
      .mockResolvedValueOnce(null);
    messageFindMany.mockResolvedValueOnce([
      {
        createdAt: new Date("2026-08-10T10:00:00Z"),
        parts: [
          {
            type: "text",
            text: "Mi alleno al mattino e voglio migliorare la concentrazione.",
          },
        ],
        generatedResponse: null,
      },
    ]);
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

  it("does nothing when the preceding turn has two facts but only one stored memory", async () => {
    messageFindFirst
      .mockResolvedValueOnce({ createdAt: new Date("2026-08-10T10:01:00Z") })
      .mockResolvedValueOnce(null);
    messageFindMany.mockResolvedValueOnce([
      {
        createdAt: new Date("2026-08-10T10:00:00Z"),
        parts: [
          {
            type: "text",
            text: "Mi alleno al mattino e vivo a Roma.",
          },
        ],
        generatedResponse: null,
      },
    ]);
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
        userMessage: "Dimentica questa cosa",
        conversationThreadId: "thread-1",
        currentUserMessageId: "inbound-current",
      }),
    ).resolves.toBeNull();

    expect(memoryFindMany).not.toHaveBeenCalled();
  });

  it.each([
    "Mi alleno al mattino, vivo a Roma.",
    "Mi alleno al mattino ma vivo a Roma.",
    "I train in the morning but I live in Rome.",
  ])(
    "does not query memory when punctuation or contrast makes the preceding context ambiguous: %s",
    async (precedingMessage) => {
      messageFindFirst
        .mockResolvedValueOnce({
          createdAt: new Date("2026-08-10T10:01:00Z"),
        })
        .mockResolvedValueOnce(null);
      messageFindMany.mockResolvedValueOnce([
        {
          createdAt: new Date("2026-08-10T10:00:00Z"),
          parts: [{ type: "text", text: precedingMessage }],
          generatedResponse: null,
        },
      ]);
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
          userMessage: "Dimentica questa cosa",
          conversationThreadId: "thread-1",
          currentUserMessageId: "inbound-current",
        }),
      ).resolves.toBeNull();

      expect(memoryFindMany).not.toHaveBeenCalled();
    },
  );

  it("resolves a generic forget when the preceding turn identifies one fact", async () => {
    messageFindFirst
      .mockResolvedValueOnce({ createdAt: new Date("2026-08-10T10:01:00Z") })
      .mockResolvedValueOnce(null);
    messageFindMany.mockResolvedValueOnce([
      {
        createdAt: new Date("2026-08-10T10:00:00Z"),
        parts: [{ type: "text", text: "Mi alleno al mattino." }],
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
      },
    ]);
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
        userMessage: "Dimentica questa cosa",
        conversationThreadId: "thread-1",
        currentUserMessageId: "inbound-current",
      }),
    ).resolves.toBe("training_schedule");
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
      .mockResolvedValueOnce(null);
    messageFindMany.mockResolvedValueOnce([
      {
        createdAt: new Date("2026-08-10T10:00:00Z"),
        parts: [{ type: "text", text: "Mi alleno al mattino." }],
        generatedResponse: {
          userId: "user-2",
          conversationThreadId: "thread-1",
          direction: "OUTBOUND",
          role: "ASSISTANT",
          deletedAt: null,
          parts: [{ type: "text", text: "Lo terrò a mente." }],
        },
      },
    ]);

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

  it("fails closed when another inbound message has the current timestamp", async () => {
    const createdAt = new Date("2026-08-10T10:01:00Z");
    messageFindFirst
      .mockResolvedValueOnce({ createdAt })
      .mockResolvedValueOnce({ id: "inbound-tied" });

    await expect(
      resolveExactMemoryDeleteTarget({
        userId: "user-1",
        userMessage: "Dimentica questa cosa.",
        conversationThreadId: "thread-1",
        currentUserMessageId: "inbound-current",
      }),
    ).resolves.toBeNull();

    expect(messageFindFirst).toHaveBeenCalledTimes(2);
    expect(memoryFindMany).not.toHaveBeenCalled();
  });

  it("fails closed when two preceding inbound messages share the latest timestamp", async () => {
    const currentCreatedAt = new Date("2026-08-10T10:03:00Z");
    const tiedPrecedingCreatedAt = new Date("2026-08-10T10:02:00Z");
    messageFindFirst
      .mockResolvedValueOnce({ createdAt: currentCreatedAt })
      .mockResolvedValueOnce(null);
    messageFindMany.mockResolvedValueOnce([
      {
        createdAt: tiedPrecedingCreatedAt,
        parts: [{ type: "text", text: "Mi alleno al mattino." }],
        generatedResponse: null,
      },
      {
        createdAt: tiedPrecedingCreatedAt,
        parts: [{ type: "text", text: "Vivo a Roma." }],
        generatedResponse: null,
      },
    ]);

    await expect(
      resolveExactMemoryDeleteTarget({
        userId: "user-1",
        userMessage: "Dimentica questa cosa.",
        conversationThreadId: "thread-1",
        currentUserMessageId: "inbound-current",
      }),
    ).resolves.toBeNull();

    expect(messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
        take: 2,
      }),
    );
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

  it("prefers a factual qualifier over a generic category alias", async () => {
    memoryFindMany.mockResolvedValue([
      {
        key: "training_schedule",
        category: "schedule",
        value: { content: "Mi alleno al mattino" },
      },
      {
        key: "favorite_surface",
        category: "preference",
        value: { content: "Preferisco terra" },
      },
    ]);

    await expect(
      resolveExactMemoryDeleteTarget({
        userId: "user-1",
        userMessage: "Dimentica la mia preferenza: mi alleno al mattino.",
      }),
    ).resolves.toBe("training_schedule");
  });

  it("resolves an explicitly named stable key directly", async () => {
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
        userMessage: "Dimentica training_schedule.",
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

  it.each([
    "Dimentica il mio errore in gara e concentrati.",
    "Dimentica il mio errore in gara. Concentrati sulla prossima.",
    "Dimentica il mio errore in gara e prova a concentrarti.",
    "Dimentica il mio errore in gara e prova a ripartire.",
    "Dimentica il mio errore in gara e prova a focalizzarti.",
    "Dimentica il mio errore in gara e cerchiamo di ripartire.",
    "Dimentica il mio errore in gara e proviamo a concentrarci.",
    "Dimentica il mio errore in gara e concentriamoci.",
    "Dimentica il mio errore in gara e focalizziamoci.",
    "Dimentica il mio errore in gara e pensiamo alla prossima.",
    "Dimentica il mio errore in gara, riparti.",
    "Dimentica il mio errore in gara: pensa alla prossima.",
  ])(
    "rejects a possessive forget request with a coaching continuation: %s",
    async (userMessage) => {
      memoryFindMany.mockResolvedValue([
        {
          key: "race_error",
          category: "conversation_topic",
          value: { content: "Il mio errore in gara" },
        },
      ]);

      await expect(
        resolveExactMemoryDeleteTarget({
          userId: "user-1",
          userMessage,
        }),
      ).resolves.toBeNull();
      expect(memoryFindMany).not.toHaveBeenCalled();
    },
  );
});
