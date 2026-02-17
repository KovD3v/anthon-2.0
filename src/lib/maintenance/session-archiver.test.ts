import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  messageFindMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
}));

vi.mock("@/lib/ai/providers/openrouter", () => ({
  maintenanceModel: "model",
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    message: {
      findMany: mocks.messageFindMany,
    },
    $transaction: mocks.transaction,
  },
}));

import { archiveOldSessions } from "./session-archiver";

describe("maintenance/session-archiver", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-17T12:00:00.000Z"));

    mocks.generateText.mockReset();
    mocks.messageFindMany.mockReset();
    mocks.transaction.mockReset();

    mocks.generateText.mockResolvedValue({ text: "summary" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns early when there are no messages to archive", async () => {
    mocks.messageFindMany.mockResolvedValue([]);

    await archiveOldSessions("user-1", 7);

    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("archives sessions that end before the retention cutoff", async () => {
    mocks.messageFindMany.mockResolvedValue([
      {
        id: "m1",
        role: "USER",
        content: "old question",
        createdAt: new Date("2026-01-01T10:00:00.000Z"),
      },
      {
        id: "m2",
        role: "ASSISTANT",
        content: "old answer",
        createdAt: new Date("2026-01-01T10:05:00.000Z"),
      },
    ]);

    const tx = {
      archivedSession: {
        create: vi.fn().mockResolvedValue({}),
      },
      message: {
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };

    mocks.transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => {
      await fn(tx);
    });

    await archiveOldSessions("user-1", 7);

    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    expect(tx.archivedSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          summary: "summary",
          messageCount: 2,
        }),
      }),
    );
    expect(tx.message.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["m1", "m2"] },
      },
    });
  });

  it("skips sessions that are still within retention window", async () => {
    // Safe buffer: older than 24h, but still newer than retention cutoff.
    mocks.messageFindMany.mockResolvedValue([
      {
        id: "m3",
        role: "USER",
        content: "recent enough",
        createdAt: new Date("2026-02-12T10:00:00.000Z"),
      },
      {
        id: "m4",
        role: "ASSISTANT",
        content: "recent answer",
        createdAt: new Date("2026-02-12T10:05:00.000Z"),
      },
    ]);

    await archiveOldSessions("user-1", 7);

    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
