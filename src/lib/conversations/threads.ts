import type { Channel } from "@/generated/prisma";
import { prisma } from "@/lib/db";

export type ConversationThreadInput = {
  userId: string;
  channel: Channel;
  externalThreadId: string;
  chatId?: string;
};

async function repairLegacyWebThread({
  userId,
  channel,
  externalThreadId,
  chatId,
}: ConversationThreadInput) {
  if (!chatId || channel !== "WEB") return null;

  const legacyThread = await prisma.conversationThread.findUnique({
    where: { chatId },
    select: {
      id: true,
      userId: true,
      channel: true,
      externalThreadId: true,
      chatId: true,
    },
  });

  if (
    !legacyThread ||
    legacyThread.userId === userId ||
    legacyThread.channel !== channel ||
    legacyThread.externalThreadId !== externalThreadId
  ) {
    return null;
  }

  // The web route normally verifies ownership first. Keep the invariant here
  // as well because this recovery path changes the owner of durable history.
  const ownedChat = await prisma.chat.findFirst({
    where: { id: chatId, userId },
    select: { id: true },
  });
  if (!ownedChat) return null;

  return prisma.$transaction(async (tx) => {
    const current = await tx.conversationThread.findUnique({
      where: { chatId },
      select: {
        id: true,
        userId: true,
        channel: true,
        chatId: true,
      },
    });

    if (!current || current.userId === userId) return current;

    const conflictingThread = await tx.conversationThread.findUnique({
      where: {
        userId_channel_externalThreadId: {
          userId,
          channel,
          externalThreadId,
        },
      },
      select: { id: true },
    });

    if (conflictingThread && conflictingThread.id !== current.id) {
      throw new Error(
        "Cannot repair web conversation thread: ownership conflict",
      );
    }

    const repaired = await tx.conversationThread.update({
      where: { id: current.id },
      data: { userId, updatedAt: new Date() },
      select: {
        id: true,
        userId: true,
        channel: true,
        chatId: true,
      },
    });

    await tx.aiTurnTrace.updateMany({
      where: { conversationThreadId: current.id },
      data: { userId },
    });

    return repaired;
  });
}

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
  const repairedThread = await repairLegacyWebThread({
    userId,
    channel,
    externalThreadId,
    chatId,
  });
  if (repairedThread) return repairedThread;

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
