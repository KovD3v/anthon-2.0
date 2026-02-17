import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

import { migrateGuestToUser } from "./guest-migration";

type Tx = {
  message: { updateMany: ReturnType<typeof vi.fn> };
  chat: { updateMany: ReturnType<typeof vi.fn> };
  memory: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  sessionSummary: { updateMany: ReturnType<typeof vi.fn> };
  channelIdentity: { updateMany: ReturnType<typeof vi.fn> };
  dailyUsage: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  profile: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  preferences: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  user: { update: ReturnType<typeof vi.fn> };
};

function buildTx(): Tx {
  return {
    message: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    chat: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    memory: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
    },
    sessionSummary: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    channelIdentity: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    dailyUsage: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    profile: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    preferences: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    user: { update: vi.fn().mockResolvedValue({}) },
  };
}

describe("lib/guest-migration", () => {
  beforeEach(() => {
    mocks.transaction.mockReset();
  });

  it("returns an error when guest and target user ids are the same", async () => {
    const result = await migrateGuestToUser("user-1", "user-1");

    expect(result).toEqual({
      success: false,
      migratedCounts: {
        messages: 0,
        chats: 0,
        memories: 0,
        sessionSummaries: 0,
        channelIdentities: 0,
        dailyUsage: 0,
        profile: false,
        preferences: false,
      },
      conflicts: [],
      error: "Cannot migrate user to themselves",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("migrates simple guest data without conflicts", async () => {
    const tx = buildTx();
    tx.message.updateMany.mockResolvedValue({ count: 3 });
    tx.chat.updateMany.mockResolvedValue({ count: 1 });
    tx.sessionSummary.updateMany.mockResolvedValue({ count: 2 });
    tx.channelIdentity.updateMany.mockResolvedValue({ count: 1 });

    mocks.transaction.mockImplementation(
      async (fn: (client: Tx) => Promise<unknown>) => await fn(tx),
    );

    const result = await migrateGuestToUser("guest-1", "user-1");

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.conflicts).toEqual([]);
    expect(result.migratedCounts).toEqual({
      messages: 3,
      chats: 1,
      memories: 0,
      sessionSummaries: 2,
      channelIdentities: 1,
      dailyUsage: 0,
      profile: false,
      preferences: false,
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "guest-1" },
      data: { guestConvertedAt: expect.any(Date) },
    });
    expect(tx.memory.upsert).not.toHaveBeenCalled();
  });

  it("records conflict history when memory keys collide", async () => {
    const tx = buildTx();
    tx.memory.findMany.mockResolvedValue([
      {
        id: "guest-memory-1",
        key: "sport",
        value: { content: "tennis" },
        updatedAt: new Date("2026-02-10T10:00:00.000Z"),
      },
    ]);
    tx.memory.findUnique.mockResolvedValue({
      id: "target-memory-1",
      key: "sport",
      value: { content: "padel" },
      updatedAt: new Date("2026-02-11T10:00:00.000Z"),
    });

    mocks.transaction.mockImplementation(
      async (fn: (client: Tx) => Promise<unknown>) => await fn(tx),
    );

    const result = await migrateGuestToUser("guest-1", "user-1");

    expect(result.success).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      field: "memory:sport",
      reason: "target_newer",
    });
    expect(tx.memory.delete).toHaveBeenCalledWith({
      where: { id: "guest-memory-1" },
    });
    expect(tx.memory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_key: {
            userId: "user-1",
            key: "_migration_conflicts",
          },
        },
      }),
    );
  });

  it("returns failure payload when transaction throws", async () => {
    mocks.transaction.mockRejectedValue(new Error("transaction failed"));

    const result = await migrateGuestToUser("guest-1", "user-1");

    expect(result.success).toBe(false);
    expect(result.error).toBe("transaction failed");
    expect(result.migratedCounts.messages).toBe(0);
    expect(result.conflicts).toEqual([]);
  });

  it("migrates non-conflicting memories and aggregates overlapping daily usage", async () => {
    const tx = buildTx();
    tx.memory.findMany.mockResolvedValue([
      {
        id: "guest-memory-1",
        key: "focus",
        value: { content: "discipline" },
        updatedAt: new Date("2026-02-10T10:00:00.000Z"),
      },
    ]);
    tx.memory.findUnique.mockResolvedValue(null);
    tx.dailyUsage.findMany.mockResolvedValue([
      {
        id: "guest-usage-1",
        date: new Date("2026-02-16T00:00:00.000Z"),
        requestCount: 3,
        inputTokens: 100,
        outputTokens: 200,
        totalCostUsd: 0.42,
      },
    ]);
    tx.dailyUsage.findUnique.mockResolvedValue({
      id: "target-usage-1",
      date: new Date("2026-02-16T00:00:00.000Z"),
    });

    mocks.transaction.mockImplementation(
      async (fn: (client: Tx) => Promise<unknown>) => await fn(tx),
    );

    const result = await migrateGuestToUser("guest-1", "user-1");

    expect(result.success).toBe(true);
    expect(result.migratedCounts.memories).toBe(1);
    expect(result.migratedCounts.dailyUsage).toBe(1);
    expect(tx.memory.update).toHaveBeenCalledWith({
      where: { id: "guest-memory-1" },
      data: { userId: "user-1" },
    });
    expect(tx.dailyUsage.update).toHaveBeenCalledWith({
      where: { id: "target-usage-1" },
      data: {
        requestCount: { increment: 3 },
        inputTokens: { increment: 100 },
        outputTokens: { increment: 200 },
        totalCostUsd: { increment: 0.42 },
      },
    });
    expect(tx.dailyUsage.delete).toHaveBeenCalledWith({
      where: { id: "guest-usage-1" },
    });
  });

  it("merges profile and preferences with guest_newer conflict resolution", async () => {
    const tx = buildTx();
    tx.profile.findUnique
      .mockResolvedValueOnce({
        userId: "guest-1",
        name: "Guest Name",
        sport: "tennis",
        goal: "win tournament",
        experience: "intermediate",
        birthday: new Date("1999-01-01T00:00:00.000Z"),
        notes: "guest notes",
        updatedAt: new Date("2026-02-12T10:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        userId: "user-1",
        name: "Target Name",
        sport: "padel",
        goal: null,
        experience: "beginner",
        birthday: new Date("1995-01-01T00:00:00.000Z"),
        notes: null,
        updatedAt: new Date("2026-02-10T10:00:00.000Z"),
      });
    tx.preferences.findUnique
      .mockResolvedValueOnce({
        userId: "guest-1",
        tone: "friendly",
        mode: "coach",
        language: "it",
        push: true,
        updatedAt: new Date("2026-02-12T10:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        userId: "user-1",
        tone: "professional",
        mode: "assistant",
        language: "en",
        push: false,
        updatedAt: new Date("2026-02-10T10:00:00.000Z"),
      });

    mocks.transaction.mockImplementation(
      async (fn: (client: Tx) => Promise<unknown>) => await fn(tx),
    );

    const result = await migrateGuestToUser("guest-1", "user-1");

    expect(result.success).toBe(true);
    expect(result.migratedCounts.profile).toBe(true);
    expect(result.migratedCounts.preferences).toBe(true);
    expect(tx.profile.update).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: expect.objectContaining({
        name: "Guest Name",
        sport: "tennis",
        goal: "win tournament",
        experience: "intermediate",
        notes: "guest notes",
        birthday: new Date("1999-01-01T00:00:00.000Z"),
      }),
    });
    expect(tx.preferences.update).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: {
        tone: "friendly",
        mode: "coach",
        language: "it",
        push: true,
      },
    });
    expect(tx.memory.upsert).toHaveBeenCalledTimes(1);
    expect(result.conflicts.some((c) => c.reason === "guest_newer")).toBe(
      true,
    );
  });

  it("records target_newer conflicts when target profile/preferences are newer", async () => {
    const tx = buildTx();
    tx.profile.findUnique
      .mockResolvedValueOnce({
        userId: "guest-1",
        name: "Guest Name",
        sport: "tennis",
        goal: "win tournament",
        experience: "intermediate",
        birthday: new Date("1999-01-01T00:00:00.000Z"),
        notes: "guest notes",
        updatedAt: new Date("2026-02-10T10:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        userId: "user-1",
        name: "Target Name",
        sport: "padel",
        goal: "keep shape",
        experience: "advanced",
        birthday: new Date("1995-01-01T00:00:00.000Z"),
        notes: "target notes",
        updatedAt: new Date("2026-02-12T10:00:00.000Z"),
      });
    tx.preferences.findUnique
      .mockResolvedValueOnce({
        userId: "guest-1",
        tone: "friendly",
        mode: "coach",
        language: "it",
        push: true,
        updatedAt: new Date("2026-02-10T10:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        userId: "user-1",
        tone: "professional",
        mode: "assistant",
        language: "en",
        push: false,
        updatedAt: new Date("2026-02-12T10:00:00.000Z"),
      });

    mocks.transaction.mockImplementation(
      async (fn: (client: Tx) => Promise<unknown>) => await fn(tx),
    );

    const result = await migrateGuestToUser("guest-1", "user-1");

    expect(result.success).toBe(true);
    expect(tx.profile.update).not.toHaveBeenCalled();
    expect(tx.preferences.update).not.toHaveBeenCalled();
    expect(result.conflicts.some((c) => c.reason === "target_newer")).toBe(
      true,
    );
    expect(result.conflicts.some((c) => c.field === "preferences:push")).toBe(
      false,
    );
  });
});
