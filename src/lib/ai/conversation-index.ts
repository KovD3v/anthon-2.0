import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { generateEmbedding } from "@/lib/ai/embeddings";
import { prisma } from "@/lib/db";

const DEFAULT_INDEX_VERSION = 1;

function textFromParts(parts: unknown, mediaType: string | null): string {
  if (!Array.isArray(parts)) return mediaType ? `[media: ${mediaType}]` : "";
  const text = parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        typeof part === "object" &&
        part !== null &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string",
    )
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n");
  return text || (mediaType ? `[media: ${mediaType}]` : "");
}

export async function indexConversationWindow(input: {
  userId: string;
  conversationThreadId: string;
  throughMessageId: string;
  indexVersion?: number;
}): Promise<{ status: "indexed" | "skipped"; chunkId?: string }> {
  const thread = await prisma.conversationThread.findFirst({
    where: { id: input.conversationThreadId, userId: input.userId },
    select: { id: true, channel: true },
  });
  if (!thread) return { status: "skipped" };

  const throughMessage = await prisma.message.findFirst({
    where: {
      id: input.throughMessageId,
      userId: input.userId,
      conversationThreadId: input.conversationThreadId,
      deletedAt: null,
    },
    select: { createdAt: true },
  });
  if (!throughMessage) return { status: "skipped" };

  const messages = await prisma.message.findMany({
    where: {
      userId: input.userId,
      conversationThreadId: input.conversationThreadId,
      deletedAt: null,
      createdAt: { lte: throughMessage.createdAt },
    },
    select: {
      id: true,
      role: true,
      parts: true,
      mediaType: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 5,
  });

  if (!messages.some((message) => message.id === input.throughMessageId)) {
    return { status: "skipped" };
  }

  const chronological = messages.toReversed();
  const content = chronological
    .map((message) => {
      const text = textFromParts(message.parts, message.mediaType);
      if (!text || message.role === "SYSTEM") return "";
      return `${message.role === "USER" ? "user" : "assistant"}: ${text}`;
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, 4_000);
  if (!content) return { status: "skipped" };

  const embedding = await generateEmbedding(content);
  if (!embedding) return { status: "skipped" };

  const chunkId = randomUUID();
  const vector = `[${embedding.join(",")}]`;
  const first = chronological[0];
  const last = chronological.at(-1);
  if (!first || !last) return { status: "skipped" };

  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "ConversationRecallChunk" (
        "id", "userId", "conversationThreadId", "channel",
        "startMessageId", "endMessageId", "throughMessageId", "content",
        "sourceCreatedAt", "embedding", "indexVersion", "createdAt", "updatedAt"
      ) VALUES (
        ${chunkId}, ${input.userId}, ${input.conversationThreadId}, ${thread.channel}::"Channel",
        ${first.id}, ${last.id}, ${input.throughMessageId}, ${content},
        ${last.createdAt}, ${vector}::vector, ${input.indexVersion ?? DEFAULT_INDEX_VERSION}, NOW(), NOW()
      )
      ON CONFLICT ("conversationThreadId", "throughMessageId", "indexVersion")
      DO UPDATE SET
        "startMessageId" = EXCLUDED."startMessageId",
        "endMessageId" = EXCLUDED."endMessageId",
        "content" = EXCLUDED."content",
        "sourceCreatedAt" = EXCLUDED."sourceCreatedAt",
        "embedding" = EXCLUDED."embedding",
        "updatedAt" = NOW()
    `,
  );
  return { status: "indexed", chunkId };
}

export async function removeOrphanedConversationRecall(): Promise<number> {
  return prisma.$executeRaw(
    Prisma.sql`
      DELETE FROM "ConversationRecallChunk" crc
      WHERE NOT EXISTS (
        SELECT 1 FROM "ConversationThread" ct
        WHERE ct."id" = crc."conversationThreadId" AND ct."userId" = crc."userId"
      ) OR NOT EXISTS (
        SELECT 1 FROM "Message" m
        WHERE m."id" = crc."throughMessageId"
          AND m."userId" = crc."userId"
          AND m."conversationThreadId" = crc."conversationThreadId"
          AND m."deletedAt" IS NULL
      )
    `,
  );
}
