import { unstable_cache } from "next/cache";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { resolveEffectiveEntitlements } from "@/lib/organizations/entitlements";
import { getVoicePlanConfig } from "@/lib/voice";
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
 *
 * NOTE: Caching disabled temporarily to ensure fresh data on page reload.
 * The unstable_cache was causing stale data issues.
 */
export const getSharedChat = cache(
  async (
    chatId: string,
    userId: string,
    cursor?: string,
    limit = 50,
  ): Promise<ChatData | null> => {
    // Verify access and fetch chat with user data
    const [chat, userData] = await Promise.all([
      prisma.chat.findFirst({
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
      }),
      // Fetch user preferences and subscription for voice config
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          role: true,
          isGuest: true,
          preferences: { select: { voiceEnabled: true } },
          subscription: { select: { status: true, planId: true } },
        },
      }),
    ]);

    if (!chat) return null;

    const entitlements = userData
      ? await resolveEffectiveEntitlements({
          userId,
          subscriptionStatus: userData.subscription?.status,
          userRole: userData.role,
          planId: userData.subscription?.planId,
          isGuest: userData.isGuest,
        })
      : null;

    // Compute voice plan config
    const voicePlanConfig = getVoicePlanConfig(
      userData?.subscription?.status ?? undefined,
      userData?.role,
      userData?.subscription?.planId,
      userData?.isGuest,
      entitlements?.modelTier,
    );

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
      // Include voice preferences for client-side optimization
      voiceEnabled: userData?.preferences?.voiceEnabled ?? true,
      voicePlanEnabled: voicePlanConfig.enabled,
    };
  },
);
