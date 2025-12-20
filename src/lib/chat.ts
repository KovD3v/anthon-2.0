import { unstable_cache } from "next/cache";
import { cache } from "react";
import { prisma } from "@/lib/db";
import type { Chat, ChatData } from "@/types/chat";

// -----------------------------------------------------
// Data Fetching (Server-side with React Cache)
// -----------------------------------------------------

/**
 * Fetch all chats for a user.
 * Wrapped in React cache to avoid redundant DB calls in a single request.
 */
export const getSharedChats = cache(async (userId: string): Promise<Chat[]> => {
  return unstable_cache(
    async () => {
      const chats = await prisma.chat.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          visibility: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { messages: true },
          },
        },
      });

      return chats.map((chat) => ({
        id: chat.id,
        title: chat.title ?? "New Chat",
        visibility: chat.visibility as "PRIVATE" | "PUBLIC",
        createdAt: chat.createdAt.toISOString(),
        updatedAt: chat.updatedAt.toISOString(),
        messageCount: chat._count.messages,
      }));
    },
    [`chats-${userId}`],
    { tags: [`chats-${userId}`], revalidate: 60 },
  )();
});

/**
 * Fetch a single chat with its messages.
 * Supports cursor-based pagination.
 */
export const getSharedChat = cache(
  async (
    chatId: string,
    userId: string,
    cursor?: string,
    limit = 50,
  ): Promise<ChatData | null> => {
    return unstable_cache(
      async () => {
        // Verify access
        const chat = await prisma.chat.findFirst({
          where: {
            id: chatId,
            OR: [{ userId }, { visibility: "PUBLIC" }],
          },
          select: {
            id: true,
            title: true,
            visibility: true,
            userId: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        if (!chat) return null;

        const messages = await prisma.message.findMany({
          where: { chatId },
          orderBy: { createdAt: "desc" },
          take: limit + 1,
          ...(cursor && {
            cursor: { id: cursor },
            skip: 1,
          }),
          select: {
            id: true,
            role: true,
            content: true,
            parts: true,
            createdAt: true,
            model: true,
            inputTokens: true,
            outputTokens: true,
            costUsd: true,
            generationTimeMs: true,
            reasoningTimeMs: true,
            ragUsed: true,
            toolCalls: true,
            attachments: {
              select: {
                id: true,
                name: true,
                contentType: true,
                size: true,
                blobUrl: true,
              },
            },
          },
        });

        const hasMore = messages.length > limit;
        const messagesToReturn = hasMore ? messages.slice(0, -1) : messages;
        const nextCursor = hasMore
          ? messagesToReturn[messagesToReturn.length - 1]?.id
          : null;

        messagesToReturn.reverse();

        return {
          id: chat.id,
          title: chat.title ?? "New Chat",
          visibility: chat.visibility,
          isOwner: chat.userId === userId,
          createdAt: chat.createdAt.toISOString(),
          updatedAt: chat.updatedAt.toISOString(),
          messages: messagesToReturn.map((m) => ({
            id: m.id,
            role: m.role.toLowerCase() as "user" | "assistant",
            content: m.content,
            parts: m.parts,
            createdAt: m.createdAt.toISOString(),
            model: m.model ?? undefined,
            usage:
              m.inputTokens !== null
                ? {
                    inputTokens: m.inputTokens,
                    outputTokens: m.outputTokens ?? 0,
                    cost: m.costUsd || 0,
                    generationTimeMs: m.generationTimeMs || undefined,
                    reasoningTimeMs: m.reasoningTimeMs || undefined,
                  }
                : undefined,
            ragUsed: m.ragUsed || undefined,
            toolCalls: m.toolCalls,
            attachments: m.attachments,
          })),
          pagination: {
            hasMore,
            nextCursor,
          },
        };
      },
      [`chat-${chatId}-${cursor || "none"}`],
      { tags: [`chat-${chatId}`], revalidate: 60 },
    )();
  },
);
