import { Prisma } from "@/generated/prisma";
import type { prisma } from "@/lib/db";

type SummaryTransaction = Pick<
  typeof prisma,
  "$queryRaw" | "conversationThread" | "conversationThreadSummary" | "message"
>;

/** Serialize only the short commit/delete transaction, never the model call. */
export async function lockThreadSummaries(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  threadIds: string[],
) {
  if (threadIds.length === 0) return;
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "ConversationThread"
    WHERE "id" IN (${Prisma.join(threadIds)})
    ORDER BY "id" FOR UPDATE
  `);
}

/** Removing any source also removes the derived summary, atomically. */
export async function deleteMessagesWithThreadSummaries(
  tx: SummaryTransaction,
  where: Prisma.MessageWhereInput,
) {
  const threads = await tx.conversationThread.findMany({
    where: { messages: { some: where } },
    select: { id: true },
  });
  const threadIds = threads.map((thread) => thread.id);
  await lockThreadSummaries(tx, threadIds);
  if (threadIds.length > 0) {
    await tx.conversationThreadSummary.deleteMany({
      where: { conversationThreadId: { in: threadIds } },
    });
  }
  return tx.message.deleteMany({ where });
}
