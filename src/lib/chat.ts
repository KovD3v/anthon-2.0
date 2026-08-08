import { unstable_cache } from "next/cache";
import { cache } from "react";
import { getFeedbackReasonFromMetadata } from "@/lib/chat-feedback";
import { toRoutineCardData } from "@/lib/coaching/routine";
import { prisma } from "@/lib/db";
import type { ModelComparisonData } from "@/lib/model-experiments/types";
import { resolveEffectiveEntitlements } from "@/lib/organizations/entitlements";
import { resolveTechnicalMetricsVisibility } from "@/lib/technical-metrics";
import { getTextFromParts } from "@/lib/utils/message-parts";
import { getVoicePlanConfig } from "@/lib/voice";
import type { Chat, ChatData, ChatMessage } from "@/types/chat";

function normalizeMessageFeedback(
  feedback: number | null,
): ChatMessage["feedback"] {
  return feedback === -1 || feedback === 0 || feedback === 1 ? feedback : null;
}

function toComparisonSlot(
  response:
    | {
        status: string;
        text: string | null;
      }
    | undefined,
): ModelComparisonData["slots"]["A"] {
  const status =
    response?.status === "COMPLETED"
      ? "completed"
      : response?.status === "FAILED"
        ? "failed"
        : response?.status === "STREAMING"
          ? "streaming"
          : "pending";
  return { status, text: response?.text ?? "" };
}

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
        title: chat.title ?? "Nuova Chat",
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
          _count: {
            select: { messages: true },
          },
        },
      }),
      // Fetch user preferences and subscription for voice config
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          role: true,
          isGuest: true,
          preferences: {
            select: { voiceEnabled: true, showTechnicalMetrics: true },
          },
          subscription: { select: { status: true, planId: true } },
        },
      }),
    ]);

    if (!chat) return null;

    const entitlements = userData?.isGuest
      ? null
      : userData
        ? await resolveEffectiveEntitlements({
            userId,
            subscriptionStatus: userData.subscription?.status,
            userRole: userData.role,
            planId: userData.subscription?.planId,
            isGuest: userData.isGuest,
          })
        : null;

    // Compute voice plan config
    const voicePlanConfig = userData?.isGuest
      ? { enabled: false }
      : getVoicePlanConfig(
          userData?.subscription?.status ?? undefined,
          userData?.role,
          userData?.subscription?.planId,
          userData?.isGuest,
          entitlements?.modelTier,
        );

    const messages =
      chat._count.messages === 0 && !cursor
        ? []
        : await prisma.message.findMany({
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
              feedback: true,
              metadata: true,
              voiceGenerationJob: {
                select: {
                  status: true,
                  errorCode: true,
                },
              },
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

    const canReceiveRoutineProposal =
      chat.userId === userId && chat.visibility === "PRIVATE";
    const canReceiveTechnicalMetrics = resolveTechnicalMetricsVisibility({
      role: userData?.role ?? "USER",
      preference: userData?.preferences?.showTechnicalMetrics,
      isGuest: userData?.isGuest ?? true,
      isPrivateOwner: canReceiveRoutineProposal,
    });
    const canReceivePrivateCoachingData =
      canReceiveRoutineProposal && userData?.isGuest === false;
    const returnedAssistantMessageIds = messagesToReturn
      .filter((message) => message.role === "ASSISTANT")
      .map((message) => message.id);
    const routines =
      canReceivePrivateCoachingData && returnedAssistantMessageIds.length > 0
        ? await prisma.routine.findMany({
            where: {
              userId,
              sourceChatId: chat.id,
              sourceAssistantMessageId: {
                in: returnedAssistantMessageIds,
              },
            },
            include: {
              attempts: {
                orderBy: { attemptedAt: "desc" },
                take: 1,
              },
            },
          })
        : [];

    const unresolvedComparisons = cursor
      ? []
      : await prisma.modelExperimentPair.findMany({
          where: {
            chatId,
            userId,
            status: { in: ["GENERATING", "READY"] },
            canonicalMessageId: null,
          },
          include: {
            responses: true,
            participant: { select: { noticeState: true } },
          },
          orderBy: { createdAt: "asc" },
        });
    const mappedMessages: ChatMessage[] = messagesToReturn.map((m) => {
      const voiceReasonCode = getVoiceReasonCode(m.metadata);

      return {
        id: m.id,
        role: m.role.toLowerCase() as "user" | "assistant",
        content: getTextFromParts(m.parts),
        parts: canReceiveRoutineProposal
          ? m.parts
          : withoutCoachingRoutineParts(m.parts),
        createdAt: m.createdAt.toISOString(),
        ...(canReceiveTechnicalMetrics &&
        !isModelComparisonCanonical(m.metadata) &&
        m.model !== null
          ? { model: m.model }
          : {}),
        ...(canReceiveTechnicalMetrics && m.inputTokens !== null
          ? {
              usage: {
                inputTokens: m.inputTokens,
                outputTokens: m.outputTokens ?? 0,
                cost: m.costUsd ?? 0,
                ...(m.generationTimeMs !== null
                  ? { generationTimeMs: m.generationTimeMs }
                  : {}),
                ...(m.reasoningTimeMs !== null
                  ? { reasoningTimeMs: m.reasoningTimeMs }
                  : {}),
              },
            }
          : {}),
        ...(canReceiveTechnicalMetrics && m.ragUsed !== null
          ? { ragUsed: m.ragUsed }
          : {}),
        ...(canReceiveTechnicalMetrics && m.toolCalls !== null
          ? { toolCalls: m.toolCalls }
          : {}),
        feedback: normalizeMessageFeedback(m.feedback),
        feedbackReason: getFeedbackReasonFromMetadata(m.metadata),
        voice:
          m.voiceGenerationJob || voiceReasonCode
            ? {
                ...(m.voiceGenerationJob
                  ? { status: m.voiceGenerationJob.status }
                  : {}),
                ...(m.voiceGenerationJob?.errorCode
                  ? { errorCode: m.voiceGenerationJob.errorCode }
                  : {}),
                ...(voiceReasonCode ? { reasonCode: voiceReasonCode } : {}),
                isExplicitRequest: isExplicitVoiceRequest(m.metadata),
              }
            : undefined,
        attachments: m.attachments.map((attachment) => ({
          ...attachment,
          blobUrl: attachment.contentType.startsWith("audio/")
            ? `/api/voice/messages/${m.id}`
            : attachment.blobUrl,
        })),
      };
    });
    for (const pair of unresolvedComparisons) {
      const responseByVariant = new Map(
        pair.responses.map((response) => [response.variantId, response]),
      );
      const comparisonData: ModelComparisonData = {
        pairId: pair.id,
        noticeRequired: pair.participant.noticeState === "NOT_SHOWN",
        status: pair.status === "READY" ? "ready" : "generating",
        slots: {
          A: toComparisonSlot(responseByVariant.get(pair.slotAVariantId)),
          B: toComparisonSlot(responseByVariant.get(pair.slotBVariantId)),
        },
      };
      const comparisonMessage: ChatMessage = {
        id: `model-comparison-${pair.id}`,
        role: "assistant",
        content: null,
        parts: [
          {
            type: "data-modelComparison",
            id: pair.id,
            data: comparisonData,
          },
        ],
        createdAt: pair.createdAt.toISOString(),
      };
      const sourceIndex = mappedMessages.findIndex(
        (message) => message.id === pair.sourceMessageId,
      );
      mappedMessages.splice(
        sourceIndex >= 0 ? sourceIndex + 1 : mappedMessages.length,
        0,
        comparisonMessage,
      );
    }

    return {
      id: chat.id,
      title: chat.title ?? "Nuova Chat",
      visibility: chat.visibility,
      isOwner: chat.userId === userId,
      createdAt: chat.createdAt.toISOString(),
      updatedAt: chat.updatedAt.toISOString(),
      messages: mappedMessages,
      routines: routines.map(toRoutineCardData),
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

function withoutCoachingRoutineParts(parts: unknown): unknown {
  if (!Array.isArray(parts)) return [];

  return parts.filter(
    (part) =>
      !(
        part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "data-coachingRoutine"
      ),
  );
}

function isExplicitVoiceRequest(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;

  const voice = (metadata as { voice?: unknown }).voice;
  return (
    !!voice &&
    typeof voice === "object" &&
    (voice as { category?: unknown }).category === "VOICE_REQUIRED"
  );
}

function getVoiceReasonCode(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;

  const voice = (metadata as { voice?: unknown }).voice;
  if (!voice || typeof voice !== "object") return undefined;

  const reasonCode = (voice as { reasonCode?: unknown }).reasonCode;
  return typeof reasonCode === "string" ? reasonCode : undefined;
}

function isModelComparisonCanonical(metadata: unknown): boolean {
  return Boolean(
    metadata &&
      typeof metadata === "object" &&
      typeof (metadata as { modelComparisonPairId?: unknown })
        .modelComparisonPairId === "string",
  );
}
