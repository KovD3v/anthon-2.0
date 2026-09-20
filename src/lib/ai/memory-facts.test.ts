import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeRaw: vi.fn(),
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
        $executeRaw: mocks.executeRaw,
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
    expiresAt: Date | null;
  }> = {},
) {
  return {
    id: overrides.id ?? "memory-1",
    userId: "user-1",
    key: overrides.key ?? "training_schedule",
    category: overrides.category ?? "schedule",
    value: { content: overrides.content ?? "Martedì sera" },
    origin: overrides.origin ?? "EXPLICIT",
    confidence: overrides.confidence ?? 0.96,
    status: "ACTIVE" as const,
    sensitivity: "LOW" as const,
    sourceMessageId: null,
    sourceThreadId: null,
    lastConfirmedAt: null,
    expiresAt: overrides.expiresAt ?? null,
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
  afterEach(() => vi.useRealTimers());

  it("does not rewarm the cache from a read started before invalidation", async () => {
    let finishRead!: (facts: ReturnType<typeof buildFact>[]) => void;
    mocks.memoryFindMany
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishRead = resolve;
        }),
      )
      .mockResolvedValue([]);
    const inFlight = listActiveFacts({ userId: "user-1" });
    invalidateFactCache("user-1");
    finishRead([buildFact()]);
    await inFlight;
    expect((await listActiveFacts({ userId: "user-1" })).facts).toEqual([]);
    expect(mocks.memoryFindMany).toHaveBeenCalledTimes(2);
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
          expiresAt: null,
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
      select: {
        id: true,
        key: true,
        value: true,
        category: true,
        origin: true,
        confidence: true,
        observedAt: true,
        updatedAt: true,
        expiresAt: true,
      },
    });
  });

  it.each([
    ["ACCOUNT_HOLDER", "ACCOUNT_HOLDER"],
    ["REFERENCED_PERSON", "REFERENCED_PERSON"],
    [undefined, undefined],
    ["account_holder", undefined],
    ["UNKNOWN", undefined],
    [null, undefined],
  ])(
    "projects only valid stored subject metadata: %s",
    async (stored, expected) => {
      const memory = {
        ...buildFact({ key: "person_ada_training" }),
        value: { content: "Ada si allena martedì", _subject: stored },
      };
      mocks.memoryFindMany.mockResolvedValue([memory]);
      mocks.memoryFindFirst.mockResolvedValue(memory);
      const recalled = await recallFacts({ userId: "user-1", query: "Ada" });
      const direct = await getActiveFactById({
        userId: "user-1",
        factId: memory.id,
      });
      expect(recalled.degraded).toBe(false);
      for (const fact of [recalled.facts[0], direct]) {
        expect(fact?.subject).toBe(expected);
        expect(Object.hasOwn(fact ?? {}, "subject")).toBe(
          expected !== undefined,
        );
        expect(fact).not.toHaveProperty("_subject");
      }
    },
  );

  it("stops recall and listing exactly at expiry even with a warm snapshot", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
    mocks.memoryFindMany.mockResolvedValue([
      buildFact({ expiresAt: new Date("2026-09-19T12:00:05Z") }),
    ]);
    expect(
      (await recallFacts({ userId: "user-1", query: "orario" })).facts,
    ).toHaveLength(1);
    vi.advanceTimersByTime(5_000);
    expect(
      (await recallFacts({ userId: "user-1", query: "orario" })).facts,
    ).toEqual([]);
    expect((await listActiveFacts({ userId: "user-1" })).facts).toEqual([]);
    expect(mocks.memoryFindMany).toHaveBeenCalledTimes(1);
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

  it("does not create a second revision for an identical tool and consolidation fact", async () => {
    mocks.memoryFindFirst.mockResolvedValue({
      ...buildFact(),
      sourceMessageId: "source-1",
    });
    const result = await rememberFact({
      userId: "user-1",
      key: "training_schedule",
      value: "Martedì sera",
      category: "schedule",
      confidence: 0.96,
      sensitivity: "LOW",
      origin: "INFERRED",
      sourceMessageId: "source-1",
      dedupeKey: "consolidation:source-1",
    });
    expect(result).toEqual({ status: "duplicate", factId: "memory-1" });
    expect(mocks.memoryUpsert).not.toHaveBeenCalled();
  });

  it("retains original evidence while attributing a sensitive confirmation to its current turn", async () => {
    mocks.memoryFindFirst.mockResolvedValue({
      ...buildFact(),
      sourceMessageId: "source-1",
    });
    mocks.memoryUpsert.mockResolvedValue({ id: "memory-1" });
    const result = await rememberFact({
      userId: "user-1",
      key: "training_schedule",
      value: "Martedì sera",
      category: "schedule",
      confidence: 1,
      sensitivity: "HIGH",
      origin: "CONFIRMED",
      sourceMessageId: "source-1",
      revisionSourceMessageId: "confirmation-1",
      dedupeKey: "approval:source-1",
    });
    expect(result.status).toBe("saved");
    expect(mocks.memoryUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          sourceMessageId: "source-1",
          sensitivity: "HIGH",
          origin: "CONFIRMED",
        }),
      }),
    );
    expect(mocks.revisionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ sourceMessageId: "confirmation-1" }),
    });
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
      value: { content: "Martedì sera", _subject: "ACCOUNT_HOLDER" },
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
        previousValue: expect.objectContaining({
          content: "Martedì sera",
          _subject: "ACCOUNT_HOLDER",
          _undoState: expect.objectContaining({
            status: "ACTIVE",
            sensitivity: "LOW",
          }),
        }),
        nextValue: expect.objectContaining({ content: "Giovedì mattina" }),
        reason: "revise",
      }),
    });
    expect(mocks.memoryUpdate.mock.calls[0][0].data.value).not.toHaveProperty(
      "_subject",
    );
  });

  it.each([null, new Date("2099-10-24T18:00:00Z")])(
    "allows a correction to clear or replace expiry and snapshots the old expiry",
    async (expiresAt) => {
      const oldExpiry = new Date("2099-10-23T18:00:00Z");
      mocks.memoryFindFirst.mockResolvedValue(
        buildFact({ expiresAt: oldExpiry }),
      );
      mocks.memoryUpdate.mockResolvedValue({ id: "memory-1" });
      expect(
        (
          await reviseFact({
            userId: "user-1",
            factId: "memory-1",
            key: "training_schedule",
            value: "Giovedì mattina",
            category: "schedule",
            confidence: 1,
            sensitivity: "LOW",
            origin: "EXPLICIT",
            dedupeKey: "correction",
            expiresAt,
          })
        ).status,
      ).toBe("saved");
      expect(mocks.memoryUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ expiresAt }),
        }),
      );
      expect(mocks.revisionCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          previousValue: expect.objectContaining({
            _undoState: expect.objectContaining({
              expiresAt: oldExpiry.toISOString(),
            }),
          }),
        }),
      });
    },
  );

  it("does not deduplicate a same-turn correction that changes only expiry", async () => {
    mocks.memoryFindFirst.mockResolvedValue({
      ...buildFact({ expiresAt: new Date("2099-10-24T18:00:00Z") }),
      sourceMessageId: "message-1",
    });
    mocks.memoryUpsert.mockResolvedValue({ id: "memory-1" });
    expect(
      (
        await rememberFact({
          userId: "user-1",
          key: "training_schedule",
          value: "Martedì sera",
          category: "schedule",
          confidence: 1,
          sensitivity: "LOW",
          origin: "EXPLICIT",
          sourceMessageId: "message-1",
          dedupeKey: "clear-expiry",
          expiresAt: null,
        })
      ).status,
    ).toBe("saved");
    expect(mocks.memoryUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ expiresAt: null }),
      }),
    );
  });

  it.each([new Date("invalid"), new Date(0)])(
    "rejects invalid or past expiry before writing",
    async (expiresAt) => {
      expect(
        (
          await rememberFact({
            userId: "user-1",
            key: "work_deadline",
            value: "Delivery",
            category: "schedule",
            confidence: 1,
            sensitivity: "LOW",
            origin: "EXPLICIT",
            dedupeKey: "invalid-expiry",
            expiresAt,
          })
        ).status,
      ).toBe("rejected");
      expect(mocks.memoryUpsert).not.toHaveBeenCalled();
    },
  );

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

  const semanticInput = {
    userId: "user-1",
    key: "training_schedule",
    value: "Giovedì mattina",
    category: "schedule",
    confidence: 0.99,
    sensitivity: "LOW" as const,
    origin: "EXPLICIT" as const,
    sourceMessageId: "correction-1",
    observedAt: new Date("2026-09-18T00:00:00Z"),
    expiresAt: null,
    dedupeKey: "semantic:correction-1",
    semanticMatch: {
      kind: "correction" as const,
      id: "memory-1",
      updatedAt: new Date("2026-08-10T18:00:00Z"),
    },
  };

  it("reuses the fact and snapshots revision/expiry for a current semantic correction", async () => {
    mocks.memoryFindFirst.mockResolvedValue(
      buildFact({ expiresAt: new Date("2099-01-01T00:00:00Z") }),
    );
    mocks.memoryUpsert.mockResolvedValue({ id: "memory-1" });
    expect(await rememberFact(semanticInput)).toEqual({
      status: "saved",
      factId: "memory-1",
    });
    expect(mocks.executeRaw).toHaveBeenCalledOnce();
    expect(mocks.memoryUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_key: { userId: "user-1", key: "training_schedule" } },
        update: expect.objectContaining({ expiresAt: null }),
      }),
    );
    expect(mocks.revisionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        previousValue: expect.objectContaining({
          content: "Martedì sera",
          _undoState: expect.objectContaining({
            expiresAt: "2099-01-01T00:00:00.000Z",
          }),
        }),
      }),
    });
  });

  it("checks the snapshot before discarding a semantic duplicate", async () => {
    mocks.memoryFindFirst.mockResolvedValue(buildFact());
    expect(
      await rememberFact({
        ...semanticInput,
        semanticMatch: { ...semanticInput.semanticMatch, kind: "equivalent" },
      }),
    ).toEqual({ status: "duplicate", factId: "memory-1" });
    expect(mocks.memoryUpsert).not.toHaveBeenCalled();
    expect(mocks.revisionCreate).not.toHaveBeenCalled();
  });

  it.each([
    { updatedAt: new Date("2026-09-18T01:00:00Z") },
    { value: { content: "Martedì sera", revisionId: "concurrent-revision" } },
    { observedAt: new Date("2026-09-19T01:00:00Z") },
    { id: "replacement-row" },
    { userId: "other-user" },
    { status: "DELETED" },
    { expiresAt: new Date(0) },
    { sensitivity: "HIGH" },
  ])(
    "rejects a semantic target changed or invalidated since review: %o",
    async (overrides) => {
      mocks.memoryFindFirst.mockResolvedValue({ ...buildFact(), ...overrides });
      expect(await rememberFact(semanticInput)).toEqual({ status: "rejected" });
      expect(mocks.memoryUpsert).not.toHaveBeenCalled();
      expect(mocks.revisionCreate).not.toHaveBeenCalled();
    },
  );

  it("does not create a missing semantic target or accept an inferred correction", async () => {
    mocks.memoryFindFirst.mockResolvedValue(null);
    expect((await rememberFact(semanticInput)).status).toBe("rejected");
    mocks.memoryFindFirst.mockResolvedValue(buildFact());
    expect(
      (await rememberFact({ ...semanticInput, origin: "INFERRED" })).status,
    ).toBe("rejected");
    expect(mocks.memoryUpsert).not.toHaveBeenCalled();
  });

  it("does not discard a semantic duplicate with a changed expiry", async () => {
    mocks.memoryFindFirst.mockResolvedValue(
      buildFact({ expiresAt: new Date("2099-01-01T00:00:00Z") }),
    );
    expect(
      (
        await rememberFact({
          ...semanticInput,
          semanticMatch: { ...semanticInput.semanticMatch, kind: "equivalent" },
        })
      ).status,
    ).toBe("rejected");
    expect(mocks.memoryUpsert).not.toHaveBeenCalled();
  });
});
