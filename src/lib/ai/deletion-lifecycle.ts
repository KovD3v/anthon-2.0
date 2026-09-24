import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { invalidateCoachingContextPromptCaches } from "./coaching-context-cache";
import {
  type ConversationEvidenceInvalidation,
  invalidateConversationRecallEvidence,
} from "./conversation-recall";
import { invalidateFactCache } from "./memory-facts";
import { lockThreadSummaries } from "./thread-summary-lifecycle";

type DeletionMessage = {
  id: string;
  userId: string;
  conversationThreadId: string | null;
};

type DeletionMemory = {
  id: string;
  sourceMessageId: string | null;
  sourceThreadId: string | null;
};

export type DerivedDeletionResult = {
  messageCount: number;
  userIds: string[];
  threadIds: string[];
  chunkIds: string[];
  memoryIds: string[];
  revisionIds: string[];
};

async function lockMessagesForDeletion(
  transaction: Pick<Prisma.TransactionClient, "$queryRaw">,
  messageIds: string[],
) {
  if (messageIds.length === 0) return;

  // Lock the source rows before reading any derived records. Inserts that
  // reference one of these messages must then wait for this transaction and
  // cannot land between the cleanup scan and the source delete.
  await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "Message"
      WHERE "id" IN (${Prisma.join(messageIds)})
      ORDER BY "id" ASC
      FOR UPDATE
    `,
  );
}

const memorySelect = {
  id: true,
  sourceMessageId: true,
  sourceThreadId: true,
} satisfies Prisma.MemorySelect;

function emptyDeletionResult(): DerivedDeletionResult {
  return {
    messageCount: 0,
    userIds: [],
    threadIds: [],
    chunkIds: [],
    memoryIds: [],
    revisionIds: [],
  };
}

/**
 * Removes derived records while the source messages are still addressable.
 *
 * This function deliberately does not delete source messages. Callers that
 * delete messages must invoke it in the same Prisma transaction immediately
 * before their deleteMany call. Keeping the source and derived cleanup in one
 * transaction prevents a failed cleanup from leaving a partially deleted
 * conversation and prevents the message FK SetNull action from erasing the
 * provenance needed to retire inferred facts safely.
 */
export async function cleanupDerivedDataForMessagesInTransaction(
  transaction: Prisma.TransactionClient,
  messageWhere: Prisma.MessageWhereInput,
): Promise<DerivedDeletionResult> {
  const messages = (await transaction.message.findMany({
    where: messageWhere,
    select: { id: true, userId: true, conversationThreadId: true },
  })) as DeletionMessage[];
  if (messages.length === 0) return emptyDeletionResult();

  const messageIds = messages.map((message) => message.id);
  const userIds = [...new Set(messages.map((message) => message.userId))];
  const threadIds = [
    ...new Set(
      messages
        .map((message) => message.conversationThreadId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  // Summary commits hold the thread lock while checking their sources, so
  // take it first (same order) to keep a summary of deleted messages out.
  await lockThreadSummaries(transaction, threadIds);
  await lockMessagesForDeletion(transaction, messageIds);

  // A source thread is only a fallback for legacy/thread-only facts. When a
  // current source message survives a suffix deletion, its fact survives too,
  // even though it belongs to the same thread.
  const memoryWhere: Prisma.MemoryWhereInput = {
    OR: [
      { sourceMessageId: { in: messageIds } },
      ...(threadIds.length
        ? [{ sourceMessageId: null, sourceThreadId: { in: threadIds } }]
        : []),
    ],
  };
  const chunkWhere: Prisma.ConversationRecallChunkWhereInput = {
    OR: [
      ...(threadIds.length
        ? [{ conversationThreadId: { in: threadIds } }]
        : []),
      { startMessageId: { in: messageIds } },
      { endMessageId: { in: messageIds } },
      { throughMessageId: { in: messageIds } },
    ],
  };

  const [memories, sourceRevisions, chunks] = await Promise.all([
    transaction.memory.findMany({ where: memoryWhere, select: memorySelect }),
    transaction.memoryRevision.findMany({
      where: { sourceMessageId: { in: messageIds } },
      select: { id: true },
    }),
    transaction.conversationRecallChunk.findMany({
      where: chunkWhere,
      select: { id: true },
    }),
  ]);

  const typedMemories = memories as DeletionMemory[];
  const revisionIds = [
    ...new Set(sourceRevisions.map((revision) => revision.id)),
  ];
  const chunkIds = chunks.map((chunk) => chunk.id);
  const memoryIds = typedMemories.map((memory) => memory.id);

  if (revisionIds.length > 0) {
    await transaction.memoryRevision.deleteMany({
      where: { id: { in: revisionIds } },
    });
  }
  if (memoryIds.length > 0) {
    // Source-derived facts are part of the user's durable recall surface. If
    // their only evidence is deleted, remove the row and its value entirely;
    // preserving a DELETED row would retain the sensitive value in storage.
    await transaction.memory.deleteMany({
      where: { id: { in: memoryIds } },
    });
  }
  if (messageIds.length > 0) {
    await transaction.memoryApproval.deleteMany({
      where: {
        OR: [
          { sourceInboundMessageId: { in: messageIds } },
          { presentationInboundMessageId: { in: messageIds } },
          { presentationAssistantMessageId: { in: messageIds } },
        ],
      },
    });
  }
  if (chunkIds.length > 0) {
    await transaction.conversationRecallChunk.deleteMany({
      where: { id: { in: chunkIds } },
    });
  }
  if (threadIds.length > 0) {
    await transaction.conversationThreadSummary.deleteMany({
      where: { conversationThreadId: { in: threadIds } },
    });
  }

  return {
    messageCount: messages.length,
    userIds,
    threadIds,
    chunkIds,
    memoryIds,
    revisionIds,
  };
}

export function invalidateDerivedCachesForDeletion(
  result: Pick<DerivedDeletionResult, "userIds" | "chunkIds">,
) {
  for (const userId of result.userIds) {
    invalidateFactCache(userId);
    invalidateCoachingContextPromptCaches(userId);
    invalidateConversationRecallEvidence({
      userId,
      chunkIds: result.chunkIds,
    } satisfies ConversationEvidenceInvalidation);
  }
}

export function invalidateAllDerivedCachesForUser(userId: string) {
  invalidateFactCache(userId);
  invalidateCoachingContextPromptCaches(userId);
  invalidateConversationRecallEvidence({ userId });
}

export async function deleteMessagesWithDerivedData(
  messageWhere: Prisma.MessageWhereInput,
): Promise<{ count: number; cleanup: DerivedDeletionResult }> {
  const result = await prisma.$transaction(async (transaction) => {
    const cleanup = await cleanupDerivedDataForMessagesInTransaction(
      transaction as unknown as Prisma.TransactionClient,
      messageWhere,
    );
    const deleted = await transaction.message.deleteMany({
      where: messageWhere,
    });
    return { count: deleted.count, cleanup };
  });
  invalidateDerivedCachesForDeletion(result.cleanup);
  return result;
}

export async function deleteChatWithDerivedData(
  chatId: string,
): Promise<DerivedDeletionResult> {
  const cleanup = await prisma.$transaction(async (transaction) => {
    const derived = await cleanupDerivedDataForMessagesInTransaction(
      transaction as unknown as Prisma.TransactionClient,
      { chatId },
    );
    await transaction.chat.delete({ where: { id: chatId } });
    return derived;
  });
  invalidateDerivedCachesForDeletion(cleanup);
  return cleanup;
}
