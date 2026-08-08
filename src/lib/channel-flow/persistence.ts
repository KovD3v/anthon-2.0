import type { Prisma } from "@/generated/prisma";
import { extractAndSaveMemories } from "@/lib/ai/memory-extractor";
import { safelyRefreshConversationThreadSummary } from "@/lib/ai/thread-context";
import { captureAiTurnTrace } from "@/lib/ai/trace";
import { getRoutineProposalFromToolCalls } from "@/lib/coaching/routine";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import {
  incrementUsage,
  reconcileAiUsageInTransaction,
} from "@/lib/rate-limit";
import { getExternalInboundLeaseExpiry } from "./external-inbound-lease";
import type { PersistAssistantOutputInput } from "./types";

const persistenceLogger = createLogger("ai");

function scheduleBackground(
  waitUntil: ((promise: Promise<unknown>) => void) | undefined,
  task: Promise<unknown>,
) {
  if (waitUntil) {
    try {
      waitUntil(task);
      return;
    } catch {
      // Fall through and let task run detached.
    }
  }
  void task;
}

function buildAssistantMetadata(
  metadata: Prisma.InputJsonValue | undefined,
  metrics: PersistAssistantOutputInput["metrics"],
): Prisma.InputJsonValue | undefined {
  const aiMetrics = {
    ...(metrics.toolCallCount !== undefined
      ? { toolCallCount: metrics.toolCallCount }
      : {}),
    ...(metrics.toolResultChars !== undefined
      ? { toolResultChars: metrics.toolResultChars }
      : {}),
    ...(metrics.toolTiming ? { toolTiming: metrics.toolTiming } : {}),
  };

  if (Object.keys(aiMetrics).length === 0) {
    return metadata;
  }

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { ai: aiMetrics };
  }

  const metadataObject = metadata as Record<string, unknown>;
  const existingAi =
    metadataObject.ai &&
    typeof metadataObject.ai === "object" &&
    !Array.isArray(metadataObject.ai)
      ? (metadataObject.ai as Record<string, unknown>)
      : {};

  return {
    ...metadataObject,
    ai: {
      ...existingAi,
      ...aiMetrics,
    },
  } as Prisma.InputJsonValue;
}

function buildMessageMetricsData(
  messageId: string,
  metrics: PersistAssistantOutputInput["metrics"],
) {
  return {
    messageId,
    model: metrics.model,
    provider: metrics.provider,
    inputTokens: metrics.inputTokens,
    outputTokens: metrics.outputTokens,
    totalTokens: metrics.inputTokens + metrics.outputTokens,
    reasoningTokens: metrics.reasoningTokens,
    costUsd: metrics.costUsd,
    generationTimeMs: metrics.generationTimeMs,
    reasoningTimeMs: metrics.reasoningTimeMs,
    toolCallCount: metrics.toolCallCount,
    toolResultChars: metrics.toolResultChars,
    toolTiming: metrics.toolTiming as Prisma.InputJsonValue | undefined,
    ragUsed: metrics.ragUsed,
    ragChunksCount: metrics.ragChunksCount,
    providerMetadata: metrics.providerMetadata as
      | Prisma.InputJsonValue
      | undefined,
  };
}

async function revalidateTags(tags: string[]) {
  if (tags.length === 0) return;

  try {
    const { revalidateTag } = await import("next/cache");
    for (const tag of tags) {
      try {
        revalidateTag(tag, "max");
      } catch (error) {
        persistenceLogger.error(
          "revalidate.tag_failed",
          "Failed to revalidate tag",
          { tag, error },
        );
      }
    }
  } catch (error) {
    persistenceLogger.error(
      "revalidate.import_failed",
      "Failed importing next/cache",
      { error },
    );
  }
}

export async function persistAssistantOutput({
  userId,
  chatId,
  conversationThreadId,
  userMessageId,
  channel,
  text,
  userMessageText,
  metrics,
  messageType = "TEXT",
  mediaUrl,
  mediaType,
  metadata,
  updateChatTimestamp = false,
  revalidateTags: tags = [],
  allowMemoryExtraction = false,
  waitUntil,
  voiceGeneration,
  usageReservationId,
  usageReservationClaimToken,
  usageAlreadyReconciled = false,
  externalInboundClaimToken,
}: PersistAssistantOutputInput) {
  const assistantMetadata = buildAssistantMetadata(metadata, metrics);
  const routineProposal = getRoutineProposalFromToolCalls(metrics.toolCalls);

  const persisted = await prisma.$transaction(async (tx) => {
    if (userMessageId && externalInboundClaimToken) {
      const fenced = await tx.message.updateMany({
        where: {
          id: userMessageId,
          userId,
          externalInboundStatus: "PROCESSING",
          externalInboundClaimToken,
        },
        data: {
          externalInboundLeaseExpiresAt: getExternalInboundLeaseExpiry(),
        },
      });
      if (fenced.count !== 1) {
        throw new Error("External inbound claim is stale");
      }
    }

    if (userMessageId) {
      const existing = await tx.message.findUnique({
        where: { sourceInboundMessageId: userMessageId },
      });
      if (existing?.userId === userId) {
        return { message: existing, created: false };
      }
      if (existing) throw new Error("Inbound response ownership mismatch");
    }

    const createdMessage = await tx.message.create({
      data: {
        userId,
        ...(chatId ? { chatId } : {}),
        ...(conversationThreadId ? { conversationThreadId } : {}),
        ...(userMessageId ? { sourceInboundMessageId: userMessageId } : {}),
        channel,
        direction: "OUTBOUND",
        role: "ASSISTANT",
        type: messageType,
        parts: [
          { type: "text", text },
          ...(routineProposal
            ? [{ type: "data-coachingRoutine", data: routineProposal }]
            : []),
        ] as Prisma.InputJsonValue,
        ...(mediaUrl ? { mediaUrl } : {}),
        ...(mediaType ? { mediaType } : {}),
        ...(assistantMetadata ? { metadata: assistantMetadata } : {}),
        model: metrics.model,
        inputTokens: metrics.inputTokens,
        outputTokens: metrics.outputTokens,
        reasoningTokens: metrics.reasoningTokens,
        reasoningContent: metrics.reasoningContent,
        toolCalls: metrics.toolCalls as Prisma.InputJsonValue | undefined,
        ragUsed: metrics.ragUsed,
        ragChunksCount: metrics.ragChunksCount,
        costUsd: metrics.costUsd,
        generationTimeMs: metrics.generationTimeMs,
        reasoningTimeMs: metrics.reasoningTimeMs,
      },
    });

    await tx.messageMetrics.create({
      data: buildMessageMetricsData(createdMessage.id, metrics),
    });

    // The message and its voice job must either both exist or neither exists.
    // That makes a reconnect safe even if the process returns before QStash
    // receives its delivery request.
    if (voiceGeneration) {
      await tx.voiceGenerationJob.create({
        data: {
          messageId: createdMessage.id,
          userId,
          expiresAt: voiceGeneration.expiresAt,
        },
      });
    }

    if (usageReservationId) {
      if (!usageReservationClaimToken) {
        throw new Error("Usage reservation claim token is required");
      }
      await reconcileAiUsageInTransaction(tx, {
        reservationId: usageReservationId,
        claimToken: usageReservationClaimToken,
        userId,
        metrics,
        assistantMessageId: createdMessage.id,
        allowAlreadyReconciled: usageAlreadyReconciled,
      });
    }

    return { message: createdMessage, created: true };
  });
  const { message } = persisted;

  if (updateChatTimestamp && chatId) {
    try {
      await prisma.chat.update({
        where: { id: chatId },
        data: { updatedAt: new Date() },
      });
    } catch (error) {
      persistenceLogger.error(
        "chat.timestamp_update_failed",
        "Failed updating chat timestamp after assistant persistence",
        { error, chatId },
      );
    }
  }

  if (!usageReservationId && persisted.created) {
    try {
      await incrementUsage(
        userId,
        metrics.inputTokens,
        metrics.outputTokens,
        metrics.costUsd,
        metrics.reasoningTokens ?? 0,
      );
    } catch (error) {
      persistenceLogger.error(
        "usage.increment_failed",
        "Failed incrementing usage after assistant persistence",
        { error, userId, messageId: message.id },
      );
    }
  }

  if (tags.length > 0) {
    await revalidateTags(tags);
  }

  if (conversationThreadId && persisted.created) {
    scheduleBackground(
      waitUntil,
      safelyRefreshConversationThreadSummary(conversationThreadId, userId),
    );
  }

  if (
    conversationThreadId &&
    persisted.created &&
    metrics.tracePayload &&
    metrics.turnPlan
  ) {
    scheduleBackground(
      waitUntil,
      captureAiTurnTrace({
        userId,
        conversationThreadId,
        userMessageId,
        assistantMessageId: message.id,
        metadata: {
          turnPlan: metrics.turnPlan,
          model: metrics.model,
          inputTokens: metrics.inputTokens,
          outputTokens: metrics.outputTokens,
          costUsd: metrics.costUsd,
          generationTimeMs: metrics.generationTimeMs,
        },
        payload: {
          userMessageText,
          assistantText: text,
          ...metrics.tracePayload,
        },
      }),
    );
  }

  if (!allowMemoryExtraction || !persisted.created) {
    return message;
  }

  const memoryTask = extractAndSaveMemories(
    userId,
    userMessageText,
    text,
  ).catch((error) => {
    persistenceLogger.error(
      "memory.extraction_failed",
      "Memory extraction error",
      { error },
    );
  });

  scheduleBackground(waitUntil, memoryTask);

  return message;
}
