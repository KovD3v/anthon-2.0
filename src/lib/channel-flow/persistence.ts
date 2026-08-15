import type { Prisma } from "@/generated/prisma";
import {
  appendDeliveredCapabilityToMetadata,
  appendDeliveredCapabilityToParts,
  filterCapabilityUsageByDecision,
  normalizePreDeliveryCapabilityUsage,
} from "@/lib/ai/capability-usage";
import { indexConversationWindow } from "@/lib/ai/conversation-index";
import { markMemoryApprovalPresented } from "@/lib/ai/memory-approval";
import { consolidateTurnMemory } from "@/lib/ai/memory-consolidator";
import { safelyRefreshConversationThreadSummary } from "@/lib/ai/thread-context";
import {
  redactToolCalls,
  redactTraceMetadata,
  redactTracePayload,
} from "@/lib/ai/tool-privacy";
import { captureAiTurnTrace } from "@/lib/ai/trace";
import type { TurnDecision } from "@/lib/ai/turn-decision";
import { serializeSafeTurnDecision } from "@/lib/ai/turn-decision-metadata";
import {
  getRoutineProposalFromToolCalls,
  storedRoutineProposalSchema,
} from "@/lib/coaching/routine";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import {
  incrementUsage,
  reconcileAiUsageInTransaction,
} from "@/lib/rate-limit";
import type { ServerTraceV1 } from "@/lib/response-profiler/contracts";
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
    ...(metrics.ragAttempted !== undefined
      ? { ragAttempted: metrics.ragAttempted }
      : {}),
    ...(metrics.capabilitiesUsed !== undefined
      ? {
          capabilitiesUsed: normalizePreDeliveryCapabilityUsage(
            metrics.capabilitiesUsed,
          ),
        }
      : {}),
    ...(metrics.memoryRecall
      ? {
          memoryRecall: {
            mode: metrics.memoryRecall.mode,
            reason: metrics.memoryRecall.reason,
            factCount: Math.max(0, Math.floor(metrics.memoryRecall.factCount)),
            evidenceCount: Math.max(
              0,
              Math.floor(metrics.memoryRecall.evidenceCount),
            ),
            factRecallMs: Math.max(
              0,
              Math.floor(metrics.memoryRecall.factRecallMs),
            ),
            conversationRecallMs: Math.max(
              0,
              Math.floor(metrics.memoryRecall.conversationRecallMs),
            ),
            degraded: metrics.memoryRecall.degraded,
          },
        }
      : {}),
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
  serverTrace?: ServerTraceV1,
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
    ...(serverTrace
      ? { serverTrace: serverTrace as Prisma.InputJsonValue }
      : {}),
    ...(metrics.developerDiagnostics
      ? {
          developerDiagnostics:
            metrics.developerDiagnostics as unknown as Prisma.InputJsonValue,
        }
      : {}),
  };
}

function safeTracePayload(
  tracePayload: Record<string, unknown>,
): Record<string, unknown> {
  const { turnDecision, ...payload } = tracePayload;
  if (!turnDecision) return payload;

  try {
    return {
      ...payload,
      turnDecision: serializeSafeTurnDecision(turnDecision as TurnDecision),
    };
  } catch {
    return payload;
  }
}

export async function markVoiceCapabilityDelivered(messageId: string) {
  return prisma.$transaction(async (tx) => {
    const message = await tx.message.findUnique({
      where: { id: messageId },
      select: { metadata: true, parts: true },
    });
    if (!message) throw new Error("Assistant message not found");

    return tx.message.update({
      where: { id: messageId },
      data: {
        type: "AUDIO",
        mediaType: "audio/mpeg",
        metadata: appendDeliveredCapabilityToMetadata(
          message.metadata,
          "voice",
          message.parts,
        ) as Prisma.InputJsonValue,
        parts: appendDeliveredCapabilityToParts(
          message.parts,
          "voice",
        ) as Prisma.InputJsonValue,
      },
    });
  });
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
  allowConversationIndexing = true,
  presentedMemoryApprovalId,
  capabilityDecision,
  capabilityPlannerMode = "legacy",
  waitUntil,
  voiceGeneration,
  usageReservationId,
  usageReservationClaimToken,
  usageAlreadyReconciled = false,
  externalInboundClaimToken,
  traceCollector,
}: PersistAssistantOutputInput) {
  const persistedMetrics = capabilityDecision
    ? {
        ...metrics,
        capabilitiesUsed: filterCapabilityUsageByDecision(
          metrics.capabilitiesUsed,
          capabilityDecision,
          capabilityPlannerMode,
        ),
      }
    : metrics;
  const assistantMetadata = buildAssistantMetadata(metadata, persistedMetrics);
  const directRoutineProposal = storedRoutineProposalSchema.safeParse(
    metrics.routineProposal,
  );
  const routineProposal = directRoutineProposal.success
    ? directRoutineProposal.data
    : getRoutineProposalFromToolCalls(metrics.toolCalls);
  const safeToolCalls = redactToolCalls(metrics.toolCalls);
  const capabilitiesUsed = normalizePreDeliveryCapabilityUsage(
    persistedMetrics.capabilitiesUsed,
  );
  const persistenceSpan = traceCollector?.startSpan("assistant_persistence");

  let persisted: {
    message: Awaited<ReturnType<typeof prisma.message.create>>;
    created: boolean;
  };
  try {
    persisted = await prisma.$transaction(async (tx) => {
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
            ...(capabilitiesUsed.length > 0
              ? [
                  {
                    type: "data-aiCapabilities",
                    data: { capabilities: capabilitiesUsed },
                  },
                ]
              : []),
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
          toolCalls:
            safeToolCalls.length > 0
              ? (safeToolCalls as Prisma.InputJsonValue)
              : undefined,
          ragUsed: metrics.ragUsed,
          ragChunksCount: metrics.ragChunksCount,
          costUsd: metrics.costUsd,
          generationTimeMs: metrics.generationTimeMs,
          reasoningTimeMs: metrics.reasoningTimeMs,
        },
      });

      await tx.messageMetrics.create({
        data: buildMessageMetricsData(
          createdMessage.id,
          metrics,
          traceCollector?.snapshot("partial"),
        ),
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
    persistenceSpan?.end("completed");
  } catch (error) {
    persistenceSpan?.end("failed");
    throw error;
  }
  const { message } = persisted;

  if (traceCollector && persisted.created) {
    const completedTrace = traceCollector.snapshot("completed");
    const finalizationTask = prisma.messageMetrics
      .update({
        where: { messageId: message.id },
        data: { serverTrace: completedTrace as Prisma.InputJsonValue },
      })
      .catch((error) => {
        persistenceLogger.warn(
          "profiler.server_trace_finalize_failed",
          "Failed finalizing server response trace",
          {
            messageId: message.id,
            errorName: error instanceof Error ? error.name : "unknown",
          },
        );
      });
    scheduleBackground(waitUntil, finalizationTask);
  }

  if (presentedMemoryApprovalId && userMessageId && persisted.created) {
    try {
      const presentation = await markMemoryApprovalPresented({
        userId,
        approvalId: presentedMemoryApprovalId,
        presentationInboundMessageId: userMessageId,
        presentationAssistantMessageId: message.id,
      });
      if (presentation.status === "stale") {
        persistenceLogger.warn(
          "memory.approval_presentation_stale",
          "Sensitive-memory presentation could not be attributed",
          { userId, messageId: message.id },
        );
      }
    } catch (error) {
      persistenceLogger.error(
        "memory.approval_presentation_failed",
        "Sensitive-memory presentation linking failed",
        {
          errorName: error instanceof Error ? error.name : "unknown",
          userId,
          messageId: message.id,
        },
      );
    }
  }

  const postPersistenceTasks: Promise<unknown>[] = [];
  if (updateChatTimestamp && chatId) {
    postPersistenceTasks.push(
      prisma.chat
        .update({
          where: { id: chatId },
          data: { updatedAt: new Date() },
        })
        .catch((error) => {
          persistenceLogger.error(
            "chat.timestamp_update_failed",
            "Failed updating chat timestamp after assistant persistence",
            { error, chatId },
          );
        }),
    );
  }

  if (!usageReservationId && persisted.created) {
    postPersistenceTasks.push(
      incrementUsage(
        userId,
        metrics.inputTokens,
        metrics.outputTokens,
        metrics.costUsd,
        metrics.reasoningTokens ?? 0,
      ).catch((error) => {
        persistenceLogger.error(
          "usage.increment_failed",
          "Failed incrementing usage after assistant persistence",
          { error, userId, messageId: message.id },
        );
      }),
    );
  }

  if (tags.length > 0) {
    postPersistenceTasks.push(revalidateTags(tags));
  }

  if (postPersistenceTasks.length > 0) {
    scheduleBackground(waitUntil, Promise.all(postPersistenceTasks));
  }

  if (conversationThreadId && persisted.created) {
    scheduleBackground(
      waitUntil,
      safelyRefreshConversationThreadSummary(conversationThreadId, userId),
    );
    if (allowConversationIndexing) {
      scheduleBackground(
        waitUntil,
        indexConversationWindow({
          userId,
          conversationThreadId,
          throughMessageId: message.id,
        }).catch((error) => {
          persistenceLogger.warn(
            "conversation_recall.index_failed",
            "Conversation recall indexing failed",
            {
              errorName: error instanceof Error ? error.name : "unknown",
              userId,
            },
          );
        }),
      );
    }
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
        metadata: redactTraceMetadata({
          turnPlan: metrics.turnPlan,
          model: metrics.model,
          inputTokens: metrics.inputTokens,
          outputTokens: metrics.outputTokens,
          costUsd: metrics.costUsd,
          generationTimeMs: metrics.generationTimeMs,
        }) as Record<string, unknown>,
        payload: redactTracePayload({
          userMessageText,
          assistantText: text,
          ...safeTracePayload(metrics.tracePayload),
        }) as Record<string, unknown>,
      }),
    );
  }

  if (
    !allowMemoryExtraction ||
    !persisted.created ||
    !userMessageId ||
    !userMessageText.trim()
  ) {
    return message;
  }

  const memoryTask = consolidateTurnMemory({
    userId,
    inboundMessageId: userMessageId,
    ...(conversationThreadId ? { conversationThreadId } : {}),
    userText: userMessageText,
    assistantText: text,
  }).catch((error) => {
    persistenceLogger.error(
      "memory.consolidation_failed",
      "Post-turn memory consolidation failed",
      { errorName: error instanceof Error ? error.name : "unknown", userId },
    );
  });

  scheduleBackground(waitUntil, memoryTask);

  return message;
}
