import type { Channel } from "@/generated/prisma";
import { prisma } from "@/lib/db";

export type ConversationThreadInput = {
  userId: string;
  channel: Channel;
  externalThreadId: string;
  chatId?: string;
};

/**
 * Resolves the durable, channel-local scope for raw conversational history.
 * Persistent profile and memory remain deliberately user-scoped elsewhere.
 */
export async function ensureConversationThread({
  userId,
  channel,
  externalThreadId,
  chatId,
}: ConversationThreadInput) {
  return prisma.conversationThread.upsert({
    where: {
      userId_channel_externalThreadId: {
        userId,
        channel,
        externalThreadId,
      },
    },
    update: { updatedAt: new Date() },
    create: {
      userId,
      channel,
      externalThreadId,
      ...(chatId ? { chatId } : {}),
    },
    select: { id: true, userId: true, channel: true, chatId: true },
  });
}
