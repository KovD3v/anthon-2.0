/**
 * One-time, idempotent backfill for the TurnPlan conversation boundary.
 * Run only after the corresponding Prisma migration has been deployed:
 *
 *   bun scripts/backfill-conversation-threads.ts
 */
import type { Channel } from "@/generated/prisma";
import { prisma } from "@/lib/db";

type LegacyMetadata = {
  chatId?: unknown;
  from?: unknown;
  phoneNumber?: unknown;
};

async function main() {
  let assigned = 0;
  const chats = await prisma.chat.findMany({
    select: { id: true, userId: true },
  });

  for (const chat of chats) {
    const thread = await prisma.conversationThread.upsert({
      where: {
        userId_channel_externalThreadId: {
          userId: chat.userId,
          channel: "WEB",
          externalThreadId: chat.id,
        },
      },
      update: { chatId: chat.id },
      create: {
        userId: chat.userId,
        channel: "WEB",
        externalThreadId: chat.id,
        chatId: chat.id,
      },
      select: { id: true },
    });
    const result = await prisma.message.updateMany({
      where: { chatId: chat.id, conversationThreadId: null },
      data: { conversationThreadId: thread.id },
    });
    assigned += result.count;
  }

  const identities = await prisma.channelIdentity.findMany({
    where: { channel: "WHATSAPP", userId: { not: null } },
    select: { userId: true, externalId: true },
  });
  const whatsappIdentityByUser = new Map(
    identities.map((identity) => [identity.userId, identity.externalId]),
  );
  const legacyMessages = await prisma.message.findMany({
    where: {
      conversationThreadId: null,
      chatId: null,
      channel: { in: ["TELEGRAM", "WHATSAPP"] },
    },
    select: { id: true, userId: true, channel: true, metadata: true },
  });
  const messageGroups = new Map<
    string,
    {
      userId: string;
      channel: Channel;
      externalThreadId: string;
      ids: string[];
    }
  >();

  for (const message of legacyMessages) {
    const metadata = message.metadata as LegacyMetadata | null;
    const telegramThreadId =
      typeof metadata?.chatId === "string" ? metadata.chatId : undefined;
    const whatsappThreadId =
      typeof metadata?.from === "string"
        ? metadata.from
        : typeof metadata?.phoneNumber === "string"
          ? metadata.phoneNumber
          : whatsappIdentityByUser.get(message.userId);
    const externalThreadId =
      message.channel === "TELEGRAM"
        ? (telegramThreadId ?? `legacy-unresolved:${message.userId}`)
        : (whatsappThreadId ?? `legacy-unresolved:${message.userId}`);
    const key = `${message.userId}:${message.channel}:${externalThreadId}`;
    const group = messageGroups.get(key) ?? {
      userId: message.userId,
      channel: message.channel,
      externalThreadId,
      ids: [],
    };
    group.ids.push(message.id);
    messageGroups.set(key, group);
  }

  for (const group of messageGroups.values()) {
    const thread = await prisma.conversationThread.upsert({
      where: {
        userId_channel_externalThreadId: {
          userId: group.userId,
          channel: group.channel,
          externalThreadId: group.externalThreadId,
        },
      },
      update: {},
      create: {
        userId: group.userId,
        channel: group.channel,
        externalThreadId: group.externalThreadId,
      },
      select: { id: true },
    });
    const result = await prisma.message.updateMany({
      where: { id: { in: group.ids }, conversationThreadId: null },
      data: { conversationThreadId: thread.id },
    });
    assigned += result.count;
  }

  console.info(
    `Backfilled ${assigned} messages into ${chats.length + messageGroups.size} conversation threads.`,
  );
}

main()
  .catch((error) => {
    console.error("Conversation thread backfill failed", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
