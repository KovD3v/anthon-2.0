import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import type { MemoryChange } from "@/types/chat";
import { invalidateCoachingContextPromptCaches } from "./coaching-context-cache";
import { invalidateFactCache } from "./memory-facts";
import { lockMemoryMutations } from "./memory-mutation-lock";
import {
  memoryValueRevisionId,
  previousMemoryState,
  snapshotMemory,
} from "./memory-revision";

/** Call only after verifying that the viewer owns this private chat. */
export async function getTurnMemoryChanges(
  userId: string,
  chatId: string,
  sourceMessageIds: string[],
) {
  const changes = new Map<string, MemoryChange[]>();
  if (!sourceMessageIds.length) return changes;
  const revisions = await prisma.memoryRevision.findMany({
    where: {
      userId,
      sourceMessageId: { in: sourceMessageIds },
      sourceMessage: {
        userId,
        chatId,
        deletedAt: null,
        chat: { userId, visibility: "PRIVATE", deletedAt: null },
      },
      memory: { userId },
      reason: { in: ["remember", "revise"] },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 400,
    select: {
      id: true,
      memoryId: true,
      sourceMessageId: true,
      sourceMessage: {
        select: { generatedResponse: { select: { metadata: true } } },
      },
      previousValue: true,
      nextValue: true,
      memory: { select: { value: true, status: true, expiresAt: true } },
    },
  });
  for (const revision of revisions) {
    if (!revision.sourceMessageId) continue;
    // An immediate tool write can still be consolidated by the same turn.
    // Offer Undo once that writer has settled, so it cannot re-save an undone fact.
    if (
      hasPendingConsolidation(
        revision.sourceMessage?.generatedResponse?.metadata,
      )
    )
      continue;
    const content = (revision.nextValue as { content?: unknown } | null)
      ?.content;
    if (typeof content !== "string" || !content.trim()) continue;
    const current =
      memoryValueRevisionId(revision.memory.value) === revision.id &&
      revision.memory.status === "ACTIVE" &&
      (!revision.memory.expiresAt || revision.memory.expiresAt > new Date());
    // Only show the currently saved fact. Old/undone changes belong in the profile.
    if (!current) continue;
    const previous = previousMemoryState(revision.previousValue);
    const turn = changes.get(revision.sourceMessageId) ?? [];
    if (turn.some((change) => change.memoryId === revision.memoryId)) continue;
    turn.push({
      revisionId: revision.id,
      memoryId: revision.memoryId,
      content,
      kind:
        !revision.previousValue || previous?.status === "DELETED"
          ? "saved"
          : "updated",
      canUndo: !revision.previousValue || previous !== null,
    });
    changes.set(revision.sourceMessageId, turn);
  }
  return changes;
}

function hasPendingConsolidation(metadata: unknown) {
  return (
    (metadata as { memoryConsolidation?: unknown } | null)
      ?.memoryConsolidation === "pending"
  );
}

export function getMemoryConsolidationStatus(
  metadata: unknown,
  createdAt: Date,
) {
  const status = (metadata as { memoryConsolidation?: unknown } | null)
    ?.memoryConsolidation;
  if (status !== "pending" && status !== "completed" && status !== "failed")
    return undefined;
  return status === "pending" && Date.now() - createdAt.getTime() > 120_000
    ? "failed"
    : status;
}

export async function undoMemoryRevision(
  userId: string,
  memoryId: string,
  revisionId: string,
) {
  const result = await prisma.$transaction(async (tx) => {
    await lockMemoryMutations(tx, userId);
    const revision = await tx.memoryRevision.findFirst({
      where: {
        id: revisionId,
        memoryId,
        userId,
        sourceMessage: {
          userId,
          deletedAt: null,
          chat: { userId, visibility: "PRIVATE", deletedAt: null },
        },
        memory: { userId },
        reason: { in: ["remember", "revise"] },
      },
      include: {
        memory: true,
        sourceMessage: {
          select: { generatedResponse: { select: { metadata: true } } },
        },
      },
    });
    if (!revision) return "not_found" as const;
    const dedupeKey = `memory:undo:${revision.id}`;
    if (
      await tx.memoryRevision.findUnique({
        where: { dedupeKey },
        select: { id: true },
      })
    ) {
      return "undone" as const;
    }
    if (
      hasPendingConsolidation(
        revision.sourceMessage?.generatedResponse?.metadata,
      )
    )
      return "pending" as const;
    const current = revision.memory;
    const previous = previousMemoryState(revision.previousValue);
    if (
      current.status !== "ACTIVE" ||
      memoryValueRevisionId(current.value) !== revision.id ||
      !isDeepStrictEqual(current.value, revision.nextValue) ||
      (revision.previousValue && !previous)
    )
      return "stale" as const;

    const undoId = randomUUID();
    const nextValue = {
      ...(previous?.value ?? (current.value as Prisma.JsonObject)),
      revisionId: undoId,
    };
    if (
      previous?.sourceMessageId &&
      !(await tx.message.findFirst({
        where: { id: previous.sourceMessageId, userId },
        select: { id: true },
      }))
    ) {
      previous.sourceMessageId = null;
    }
    if (
      previous?.sourceThreadId &&
      !(await tx.conversationThread.findFirst({
        where: { id: previous.sourceThreadId, userId },
        select: { id: true },
      }))
    ) {
      previous.sourceThreadId = null;
    }
    const updated = await tx.memory.updateMany({
      where: {
        id: memoryId,
        userId,
        status: "ACTIVE",
        updatedAt: current.updatedAt,
        value: { equals: current.value as Prisma.InputJsonValue },
      },
      data: previous
        ? { ...previous, value: nextValue }
        : { status: "DELETED", value: nextValue },
    });
    if (updated.count !== 1) {
      return (await tx.memoryRevision.findUnique({
        where: { dedupeKey },
        select: { id: true },
      }))
        ? ("undone" as const)
        : ("stale" as const);
    }
    await tx.memoryRevision.create({
      data: {
        id: undoId,
        userId,
        memoryId,
        sourceMessageId: revision.sourceMessageId,
        previousValue: snapshotMemory(current),
        nextValue,
        origin: "EXPLICIT",
        reason: "undo",
        dedupeKey,
      },
    });
    return "undone" as const;
  });
  if (result === "undone") {
    invalidateFactCache(userId);
    invalidateCoachingContextPromptCaches(userId);
  }
  return result;
}
