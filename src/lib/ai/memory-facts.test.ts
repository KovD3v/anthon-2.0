import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  memoryFindMany: vi.fn(),
  memoryFindFirst: vi.fn(),
  memoryUpsert: vi.fn(),
  memoryUpdate: vi.fn(),
  revisionFindUnique: vi.fn(),
  revisionCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    memory: {
      findMany: mocks.memoryFindMany,
      findFirst: mocks.memoryFindFirst,
    },
    $transaction: vi.fn(async (operation) =>
      operation({
        memory: {
          findFirst: mocks.memoryFindFirst,
          upsert: mocks.memoryUpsert,
          update: mocks.memoryUpdate,
        },
        memoryRevision: {
          findUnique: mocks.revisionFindUnique,
          create: mocks.revisionCreate,
        },
      }),
    ),
  },
}));

import {
  findActiveFactIdByKey,
  forgetFact,
  getActiveFactById,
  invalidateFactCache,
  listActiveFacts,
  recallFacts,
  rememberFact,
  reviseFact,
} from "./memory-facts";

function buildFact(
  overrides: Partial<{
    id: string;
    key: string;
    content: string;
    category: string;
    origin: "EXPLICIT" | "INFERRED" | "CONFIRMED" | "MIGRATED";
    confidence: number;
    observedAt: Date;
    updatedAt: Date;
  }> = {},
) {
  return {
    id: overrides.id ?? "memory-1",
    key: overrides.key ?? "training_schedule",
    category: overrides.category ?? "schedule",
    value: { content: overrides.content ?? "Martedì sera" },
    origin: overrides.origin ?? "EXPLICIT",
    confidence: overrides.confidence ?? 0.96,
    observedAt: overrides.observedAt ?? new Date("2026-08-10T18:00:00.000Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-08-10T18:00:00.000Z"),
  };
}

describe("durable fact recall", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.revisionFindUnique.mockResolvedValue(null);
    invalidateFactCache("user-1");
  });

  it("returns only current active user facts as bounded prompt projections", async () => {
    const now = new Date("2026-08-11T12:00:00.000Z");
    mocks.memoryFindMany.mockResolvedValue([buildFact()]);

    const result = await recallFacts({
      userId: "user-1",
      query: "quando mi alleno",
      limit: 4,
      now,
    });

    expect(result).toEqual({
      degraded: false,
      facts: [
        {
          id: "memory-1",
          key: "training_schedule",
          content: "Martedì sera",
          category: "schedule",
          origin: "EXPLICIT",
          confidence: 0.96,
          observedAt: new Date("2026-08-10T18:00:00.000Z"),
          updatedAt: new Date("2026-08-10T18:00:00.000Z"),
        },
      ],
    });
    expect(mocks.memoryFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        status: "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { updatedAt: "desc" },
      take: 64,
    });
  });

  it("ranks a relevant older fact before an unrelated newer fact", async () => {
    mocks.memoryFindMany.mockResolvedValue([
      buildFact({
        id: "newer",
        key: "favorite_music",
        content: "Jazz",
        category: "preference",
        updatedAt: new Date("2026-08-11T10:00:00.000Z"),
      }),
      buildFact({
        id: "relevant",
        key: "serve_pressure_trigger",
        content: "Accelera il servizio sotto pressione",
        updatedAt: new Date("2026-08-01T10:00:00.000Z"),
      }),
    ]);

    const result = await recallFacts({
      userId: "user-1",
      query: "pressione al servizio",
      limit: 1,
      now: new Date("2026-08-11T12:00:00.000Z"),
    });

    expect(result.facts.map((fact) => fact.id)).toEqual(["relevant"]);
  });

  it("caches the active fact snapshot until it is invalidated", async () => {
    mocks.memoryFindMany.mockResolvedValue([buildFact()]);

    await recallFacts({ userId: "user-1", query: "allenamento" });
    await recallFacts({ userId: "user-1", query: "orario" });
    expect(mocks.memoryFindMany).toHaveBeenCalledTimes(1);

    invalidateFactCache("user-1");
    await recallFacts({ userId: "user-1", query: "orario" });
    expect(mocks.memoryFindMany).toHaveBeenCalledTimes(2);
  });

  it("lists bounded active facts and resolves an exact active fact by id", async () => {
    const now = new Date("2026-08-11T12:00:00.000Z");
    mocks.memoryFindMany.mockResolvedValue([
      buildFact({ id: "memory-1" }),
      buildFact({ id: "memory-2", key: "match_routine" }),
    ]);
    mocks.memoryFindFirst.mockResolvedValue(
      buildFact({ id: "memory-2", key: "match_routine" }),
    );

    await expect(
      listActiveFacts({ userId: "user-1", limit: 1, now }),
    ).resolves.toEqual({
      degraded: false,
      facts: [expect.objectContaining({ id: "memory-1" })],
    });
    await expect(
      getActiveFactById({ userId: "user-1", factId: "memory-2", now }),
    ).resolves.toEqual(expect.objectContaining({ id: "memory-2" }));
  });

  it("creates one current fact and one append-only revision", async () => {
    mocks.memoryUpsert.mockResolvedValue({ id: "memory-1" });
    mocks.revisionCreate.mockResolvedValue({ id: "revision-1" });

    const result = await rememberFact({
      userId: "user-1",
      key: "training_schedule",
      value: "Martedì sera",
      category: "schedule",
      confidence: 0.96,
      sensitivity: "LOW",
      origin: "EXPLICIT",
      sourceMessageId: "message-1",
      sourceThreadId: "thread-1",
      dedupeKey: "memory:message-1:training_schedule",
    });

    expect(result).toEqual({ status: "saved", factId: "memory-1" });
    expect(mocks.revisionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        memoryId: "memory-1",
        userId: "user-1",
        dedupeKey: "memory:message-1:training_schedule",
        previousValue: undefined,
        nextValue: expect.objectContaining({ content: "Martedì sera" }),
        reason: "remember",
      }),
    });
  });

  it("rejects a canonical profile field instead of shadowing it as a fact", async () => {
    const result = await rememberFact({
      userId: "user-1",
      key: "user_sport",
      value: "Tennis",
      category: "sport",
      confidence: 1,
      sensitivity: "LOW",
      origin: "EXPLICIT",
      sourceMessageId: "message-profile",
      dedupeKey: "memory:message-profile:user_sport",
    });

    expect(result).toEqual({ status: "rejected" });
    expect(mocks.memoryUpsert).not.toHaveBeenCalled();
  });

  it("returns a duplicate result without mutating the current fact", async () => {
    mocks.revisionFindUnique.mockResolvedValue({ memoryId: "memory-1" });

    await expect(
      rememberFact({
        userId: "user-1",
        key: "training_schedule",
        value: "Martedì sera",
        category: "schedule",
        confidence: 0.96,
        sensitivity: "LOW",
        origin: "EXPLICIT",
        sourceMessageId: "message-1",
        dedupeKey: "memory:message-1:training_schedule",
      }),
    ).resolves.toEqual({ status: "duplicate", factId: "memory-1" });
    expect(mocks.memoryUpsert).not.toHaveBeenCalled();
  });

  it("revises only an exact active fact owned by the user", async () => {
    mocks.memoryFindFirst.mockResolvedValue({
      ...buildFact(),
      value: { content: "Martedì sera" },
    });
    mocks.memoryUpdate.mockResolvedValue({ id: "memory-1" });
    mocks.revisionCreate.mockResolvedValue({ id: "revision-1" });

    const result = await reviseFact({
      userId: "user-1",
      factId: "memory-1",
      key: "training_schedule",
      value: "Giovedì mattina",
      category: "schedule",
      confidence: 1,
      sensitivity: "LOW",
      origin: "EXPLICIT",
      sourceMessageId: "message-2",
      dedupeKey: "memory:message-2:training_schedule",
    });

    expect(result).toEqual({ status: "saved", factId: "memory-1" });
    expect(mocks.memoryFindFirst).toHaveBeenCalledWith({
      where: { id: "memory-1", userId: "user-1", status: "ACTIVE" },
    });
    expect(mocks.revisionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        previousValue: { content: "Martedì sera" },
        nextValue: expect.objectContaining({ content: "Giovedì mattina" }),
        reason: "revise",
      }),
    });
  });

  it("soft-forgets an exact active fact and preserves its last value", async () => {
    mocks.memoryFindFirst.mockResolvedValue({
      ...buildFact(),
      value: { content: "Martedì sera" },
    });
    mocks.memoryUpdate.mockResolvedValue({ id: "memory-1" });
    mocks.revisionCreate.mockResolvedValue({ id: "revision-1" });

    const result = await forgetFact({
      userId: "user-1",
      factId: "memory-1",
      dedupeKey: "memory:message-3:forget:memory-1",
    });

    expect(result).toEqual({ status: "forgotten", factId: "memory-1" });
    expect(mocks.memoryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "memory-1" },
        data: { status: "DELETED" },
      }),
    );
    expect(mocks.revisionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        previousValue: { content: "Martedì sera" },
        nextValue: undefined,
        sourceMessageId: undefined,
        reason: "forget",
      }),
    });
  });

  it("resolves an active fact id only inside the authenticated user scope", async () => {
    mocks.memoryFindFirst.mockResolvedValue({ id: "memory-1" });

    await expect(
      findActiveFactIdByKey("user-1", "training_schedule"),
    ).resolves.toBe("memory-1");
    expect(mocks.memoryFindFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        key: "training_schedule",
        status: "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
      select: { id: true },
    });
  });
});
