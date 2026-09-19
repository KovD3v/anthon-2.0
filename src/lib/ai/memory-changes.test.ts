import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Memory } from "@/generated/prisma";

const mocks = vi.hoisted(() => ({
  executeRaw: vi.fn(),
  revisions: vi.fn(),
  revision: vi.fn(),
  dedupe: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  invalidateFacts: vi.fn(),
  invalidatePrompts: vi.fn(),
  source: vi.fn(),
  thread: vi.fn(),
}));
vi.mock("@/lib/db", () => {
  const tx = {
    $executeRaw: mocks.executeRaw,
    memoryRevision: {
      findMany: mocks.revisions,
      findFirst: mocks.revision,
      findUnique: mocks.dedupe,
      create: mocks.create,
    },
    memory: { updateMany: mocks.update },
    message: { findFirst: mocks.source },
    conversationThread: { findFirst: mocks.thread },
  };
  return {
    prisma: {
      ...tx,
      $transaction: async (fn: (value: typeof tx) => Promise<unknown>) =>
        fn(tx),
    },
  };
});
vi.mock("./memory-facts", () => ({
  invalidateFactCache: mocks.invalidateFacts,
}));
vi.mock("./coaching-context-cache", () => ({
  invalidateCoachingContextPromptCaches: mocks.invalidatePrompts,
}));

import {
  getMemoryConsolidationStatus,
  getTurnMemoryChanges,
  undoMemoryRevision,
} from "./memory-changes";
import { snapshotMemory } from "./memory-revision";

const current: Memory = {
  id: "memory-1",
  userId: "user-1",
  key: "luca_training",
  value: { content: "Luca si allena giovedì", revisionId: "revision-1" },
  category: "schedule",
  origin: "EXPLICIT",
  sensitivity: "LOW",
  confidence: 1,
  status: "ACTIVE",
  sourceMessageId: "source-1",
  sourceThreadId: "thread-1",
  observedAt: new Date("2026-08-01"),
  lastConfirmedAt: null,
  expiresAt: null,
  createdAt: new Date("2026-08-01"),
  updatedAt: new Date("2026-08-02"),
};
const revision = {
  id: "revision-1",
  memoryId: current.id,
  userId: current.userId,
  sourceMessageId: "source-1",
  sourceMessage: {
    generatedResponse: { metadata: { memoryConsolidation: "completed" } },
  },
  previousValue: null as unknown,
  nextValue: current.value,
  memory: current,
};

describe("turn memory changes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.revisions.mockResolvedValue([revision]);
    mocks.revision.mockResolvedValue(revision);
    mocks.dedupe.mockResolvedValue(null);
    mocks.update.mockResolvedValue({ count: 1 });
    mocks.source.mockResolvedValue({ id: "source-1" });
    mocks.thread.mockResolvedValue({ id: "thread-1" });
  });

  it("queries only owned, private, undeleted source turns and exposes the current fact", async () => {
    const result = await getTurnMemoryChanges("user-1", "chat-1", ["source-1"]);
    expect(result.get("source-1")).toEqual([
      {
        memoryId: "memory-1",
        revisionId: "revision-1",
        content: "Luca si allena giovedì",
        kind: "saved",
        canUndo: true,
      },
    ]);
    expect(mocks.revisions).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          sourceMessage: {
            userId: "user-1",
            chatId: "chat-1",
            deletedAt: null,
            chat: { userId: "user-1", visibility: "PRIVATE", deletedAt: null },
          },
        }),
      }),
    );
  });
  it("locks before reading and uses a full compare-and-swap for undo", async () => {
    expect(await undoMemoryRevision("user-1", "memory-1", "revision-1")).toBe(
      "undone",
    );
    expect(mocks.executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.revision.mock.invocationCallOrder[0],
    );
    expect(mocks.update).toHaveBeenCalledWith({
      where: {
        id: "memory-1",
        userId: "user-1",
        status: "ACTIVE",
        updatedAt: current.updatedAt,
        value: { equals: current.value },
      },
      data: {
        status: "DELETED",
        value: expect.objectContaining({ content: "Luca si allena giovedì" }),
      },
    });
    expect(mocks.invalidateFacts).toHaveBeenCalledWith("user-1");
    expect(mocks.invalidatePrompts).toHaveBeenCalledWith("user-1");
  });
  it("restores exact state and attribution from the previous snapshot", async () => {
    mocks.revision.mockResolvedValue({
      ...revision,
      previousValue: snapshotMemory({
        ...current,
        value: { content: "Luca si allena martedì" },
        origin: "CONFIRMED",
        sensitivity: "HIGH",
        confidence: 0.9,
      }),
    });
    expect(await undoMemoryRevision("user-1", "memory-1", "revision-1")).toBe(
      "undone",
    );
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          origin: "CONFIRMED",
          sensitivity: "HIGH",
          confidence: 0.9,
          sourceMessageId: "source-1",
          value: expect.objectContaining({ content: "Luca si allena martedì" }),
        }),
      }),
    );
  });
  it("refuses a newer revision even when the content is the same", async () => {
    mocks.revision.mockResolvedValue({
      ...revision,
      memory: {
        ...current,
        value: { ...(current.value as object), revisionId: "revision-newer" },
      },
    });
    expect(await undoMemoryRevision("user-1", "memory-1", "revision-1")).toBe(
      "stale",
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("refuses a changed JSON envelope or a lost compare-and-swap", async () => {
    mocks.revision.mockResolvedValueOnce({
      ...revision,
      memory: {
        ...current,
        value: { ...(current.value as object), content: "changed" },
      },
    });
    expect(await undoMemoryRevision("user-1", "memory-1", "revision-1")).toBe(
      "stale",
    );
    mocks.update.mockResolvedValueOnce({ count: 0 });
    expect(await undoMemoryRevision("user-1", "memory-1", "revision-1")).toBe(
      "stale",
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("treats an already undone revision as idempotent without changing the current fact", async () => {
    mocks.dedupe.mockResolvedValue({ id: "undo-1" });
    expect(await undoMemoryRevision("user-1", "memory-1", "revision-1")).toBe(
      "undone",
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("keeps raw pending blocked even after the client polling timeout", async () => {
    const pending = {
      ...revision,
      sourceMessage: {
        generatedResponse: { metadata: { memoryConsolidation: "pending" } },
      },
    };
    mocks.revisions.mockResolvedValue([pending]);
    mocks.revision.mockResolvedValue(pending);
    expect(
      getMemoryConsolidationStatus(
        { memoryConsolidation: "pending" },
        new Date(Date.now() - 180_000),
      ),
    ).toBe("failed");
    expect(
      (await getTurnMemoryChanges("user-1", "chat-1", ["source-1"])).size,
    ).toBe(0);
    expect(await undoMemoryRevision("user-1", "memory-1", "revision-1")).toBe(
      "pending",
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
