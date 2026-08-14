import { unstable_cache } from "next/cache";
import { cache } from "react";
import { redactToolCalls } from "@/lib/ai/tool-privacy";
import { getFeedbackReasonFromMetadata } from "@/lib/chat-feedback";
import { toRoutineCardData } from "@/lib/coaching/routine";
import { prisma } from "@/lib/db";
import type { ModelComparisonData } from "@/lib/model-experiments/types";
import { resolveEffectiveEntitlements } from "@/lib/organizations/entitlements";
import {
  buildTechnicalUsage,
  resolveTechnicalDiagnosticsVisibility,
  resolveTechnicalMetricsVisibility,
} from "@/lib/technical-metrics";
import { getTextFromParts } from "@/lib/utils/message-parts";
import { getVoicePlanConfig } from "@/lib/voice";
import type { Chat, ChatData, ChatMessage } from "@/types/chat";

function normalizeMessageFeedback(
  feedback: number | null,
): ChatMessage["feedback"] {
  return feedback === -1 || feedback === 0 || feedback === 1 ? feedback : null;
}

function hasPersistedChatMessages(chat: {
  messages?: Array<unknown>;
  _count?: { messages?: number };
}): boolean {
  if (Array.isArray(chat.messages)) return chat.messages.length > 0;
  return (chat._count?.messages ?? 0) > 0;
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
          icon: true,
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
        icon: chat.icon,
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
async function getSharedChatUncached(
  chatId: string,
  userId: string,
  cursor?: string,
  limit = 20,
): Promise<ChatData | null> {
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
        icon: true,
        visibility: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
        routineContextMode: true,
        routineContextRoutine: {
          include: {
            attempts: {
              orderBy: [
                { attemptedAt: "desc" as const },
                { id: "desc" as const },
              ],
              take: 1,
            },
          },
        },
        messages: {
          take: 1,
          select: { id: true },
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
    !hasPersistedChatMessages(chat) && !cursor
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
            clientMessageId: true,
            sourceInboundMessage: {
              select: { clientMessageId: true },
            },
            role: true,
            parts: true,
            createdAt: true,
            model: true,
            inputTokens: true,
            outputTokens: true,
            reasoningTokens: true,
            costUsd: true,
            generationTimeMs: true,
            reasoningTimeMs: true,
            ragUsed: true,
            ragChunksCount: true,
            toolCalls: true,
            metrics: {
              select: {
                model: true,
                provider: true,
                reasoningTokens: true,
                reasoningTimeMs: true,
                toolCallCount: true,
                toolResultChars: true,
                toolTiming: true,
                ragUsed: true,
                ragChunksCount: true,
                executionRoute: true,
                serverTrace: true,
                clientTrace: true,
                developerDiagnostics: true,
              },
            },
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
  const technicalMetricsAccess = {
    role: userData?.role ?? "USER",
    preference: userData?.preferences?.showTechnicalMetrics,
    isGuest: userData?.isGuest ?? true,
    isPrivateOwner: canReceiveRoutineProposal,
  };
  const canReceiveTechnicalMetrics = resolveTechnicalMetricsVisibility(
    technicalMetricsAccess,
  );
  const canReceiveTechnicalDiagnostics = resolveTechnicalDiagnosticsVisibility(
    technicalMetricsAccess,
  );
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
  const routineContext =
    canReceivePrivateCoachingData &&
    chat.routineContextMode &&
    chat.routineContextRoutine
      ? {
          mode: chat.routineContextMode.toLowerCase() as "repeat" | "adapt",
          routine: toRoutineCardData(chat.routineContextRoutine),
        }
      : undefined;

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
    const modelComparisonCanonical = isModelComparisonCanonical(m.metadata);
    const usage = canReceiveTechnicalMetrics
      ? buildTechnicalUsage(m, {
          includeDiagnostics:
            canReceiveTechnicalDiagnostics && !modelComparisonCanonical,
        })
      : undefined;

    return {
      id: m.id,
      ...(m.clientMessageId ? { clientMessageId: m.clientMessageId } : {}),
      ...(m.sourceInboundMessage?.clientMessageId
        ? { sourceClientMessageId: m.sourceInboundMessage.clientMessageId }
        : {}),
      role: m.role.toLowerCase() as "user" | "assistant",
      content: getTextFromParts(m.parts),
      parts: canReceiveRoutineProposal
        ? m.parts
        : withoutCoachingRoutineParts(m.parts),
      createdAt: m.createdAt.toISOString(),
      ...(canReceiveTechnicalMetrics &&
      !modelComparisonCanonical &&
      m.model !== null
        ? { model: m.model }
        : {}),
      ...(usage ? { usage } : {}),
      ...(canReceiveTechnicalMetrics && m.ragUsed !== null
        ? { ragUsed: m.ragUsed }
        : {}),
      ...(canReceiveTechnicalMetrics && m.toolCalls !== null
        ? { toolCalls: redactToolCalls(m.toolCalls) }
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
    icon: chat.icon,
    visibility: chat.visibility,
    isOwner: chat.userId === userId,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
    messages: mappedMessages,
    routines: routines.map(toRoutineCardData),
    ...(routineContext ? { routineContext } : {}),
    pagination: {
      hasMore,
      nextCursor,
    },
    // Include voice preferences for client-side optimization
    voiceEnabled: userData?.preferences?.voiceEnabled ?? true,
    voicePlanEnabled: voicePlanConfig.enabled,
  };
}

export const getSharedChat = cache(getSharedChatUncached);

const CHAT_READ_AFTER_WRITE_RETRY_DELAYS_MS = [100, 300, 700] as const;

/**
 * A newly-created chat can briefly be invisible to a subsequent read on the
 * Neon branch used by the request. Retry only the initial page lookup so a
 * real missing/inaccessible chat still resolves to the normal 404 path.
 */
export async function getSharedChatWithRetry(
  chatId: string,
  userId: string,
  cursor?: string,
  limit = 20,
): Promise<ChatData | null> {
  const initial = await getSharedChatUncached(chatId, userId, cursor, limit);
  if (initial || cursor || userId === "anonymous") return initial;

  for (const delayMs of CHAT_READ_AFTER_WRITE_RETRY_DELAYS_MS) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    });
    const retry = await getSharedChatUncached(chatId, userId, cursor, limit);
    if (retry) return retry;
  }

  return null;
}

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
