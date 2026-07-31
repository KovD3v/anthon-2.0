import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { streamChat } from "@/lib/ai/orchestrator";
import { createLogger } from "@/lib/logger";
import {
  reconcileAiUsageForRecovery,
  releaseAiUsageReservation,
  reserveAiUsage,
} from "@/lib/rate-limit";
import { persistAssistantOutput } from "./persistence";
import type {
  ChannelMessagePart,
  InboundContext,
  RunChannelFlowResult,
} from "./types";

const runLogger = createLogger("ai");

function normalizeParts(parts: ChannelMessagePart[]) {
  return parts.map((part) => {
    if (part.type === "text") {
      return { type: "text" as const, text: part.text || "" };
    }
    return {
      type: "file" as const,
      data: part.data,
      mimeType: part.mimeType,
      name: part.name,
      size: part.size,
      attachmentId: part.attachmentId,
    };
  });
}

function detectImages(parts: ChannelMessagePart[]) {
  return parts.some(
    (part) => part.type === "file" && part.mimeType?.startsWith("image/"),
  );
}

function detectAudio(parts: ChannelMessagePart[]) {
  return parts.some(
    (part) => part.type === "file" && part.mimeType?.startsWith("audio/"),
  );
}

function finishMetadata(
  metrics:
    | {
        inputTokens: number;
        outputTokens: number;
        generationTimeMs?: number;
        reasoningTimeMs?: number | null;
      }
    | undefined,
) {
  if (!metrics) return undefined;
  return {
    inputTokens: metrics.inputTokens,
    outputTokens: metrics.outputTokens,
    generationTimeMs: metrics.generationTimeMs,
    reasoningTimeMs: metrics.reasoningTimeMs ?? undefined,
  };
}

function createPersistedResponse(
  messageId: string,
  text: string,
  metrics: NonNullable<RunChannelFlowResult["metrics"]>,
) {
  const textId = `${messageId}-text`;
  const stream = createUIMessageStream<UIMessage>({
    execute({ writer }) {
      writer.write({ type: "start", messageId });
      writer.write({ type: "start-step" });
      writer.write({ type: "text-start", id: textId });
      writer.write({ type: "text-delta", id: textId, delta: text });
      writer.write({ type: "text-end", id: textId });
      writer.write({ type: "finish-step" });
      writer.write({
        type: "finish",
        finishReason: "stop",
        messageMetadata: finishMetadata(metrics),
      });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

export async function runChannelFlow(
  ctx: InboundContext,
): Promise<RunChannelFlowResult> {
  const policyParts = ctx.options.allowAttachments
    ? ctx.parts
    : ctx.parts.filter((part) => part.type === "text");
  const normalizedParts = normalizeParts(policyParts);
  const mode = ctx.execution?.mode ?? "text";

  let finalMetrics: RunChannelFlowResult["metrics"];
  let persistence: RunChannelFlowResult["persistence"] =
    ctx.persistence?.saveAssistantMessage === false
      ? { status: "skipped" }
      : undefined;

  if (!ctx.rateLimit.allowed) {
    return {
      assistantText: "",
      persistence: { status: "skipped" },
      rateLimit: {
        status: "denied",
        upgradeInfo: ctx.rateLimit.upgradeInfo,
      },
    };
  }

  if (ctx.rateLimit.effectiveEntitlements && !ctx.userMessageId) {
    throw new Error(
      "A persisted inbound message is required for usage reservation",
    );
  }

  const usageReservation =
    ctx.userMessageId && ctx.rateLimit.effectiveEntitlements
      ? await reserveAiUsage({
          userId: ctx.userId,
          requestKey: ctx.userMessageId,
          limits: ctx.rateLimit.effectiveEntitlements.limits,
        })
      : undefined;
  if (usageReservation && !usageReservation.allowed) {
    return {
      assistantText: "",
      persistence: { status: "skipped" },
      rateLimit: {
        status: "denied",
        upgradeInfo: ctx.rateLimit.upgradeInfo,
        reason: usageReservation.reason,
        retryable: usageReservation.retryable,
      },
    };
  }

  const usageReservationId = usageReservation?.reservationId;
  const usageReservationClaimToken = usageReservation?.claimToken;

  const persistGeneratedOutput = async ({
    text,
    metrics,
    usageAlreadyReconciled = false,
  }: {
    text: string;
    metrics: NonNullable<RunChannelFlowResult["metrics"]>;
    usageAlreadyReconciled?: boolean;
  }) => {
    if (ctx.persistence?.saveAssistantMessage === false) return undefined;
    try {
      const message = await persistAssistantOutput({
        userId: ctx.userId,
        chatId: ctx.chatId,
        conversationThreadId: ctx.conversationThreadId,
        userMessageId: ctx.userMessageId,
        channel: ctx.persistence?.channel ?? "WEB",
        text,
        userMessageText: ctx.userMessageText,
        metrics,
        metadata: ctx.persistence?.metadata,
        updateChatTimestamp: ctx.persistence?.updateChatTimestamp,
        revalidateTags: ctx.persistence?.revalidateTags,
        allowMemoryExtraction: ctx.options.allowMemoryExtraction,
        waitUntil: ctx.persistence?.waitUntil,
        usageReservationId,
        usageReservationClaimToken,
        usageAlreadyReconciled,
        externalInboundClaimToken:
          ctx.persistence?.externalInboundClaimToken,
      });
      persistence = { status: "saved", messageId: message.id };
      return message;
    } catch (error) {
      persistence = { status: "failed", error };
      if (
        usageReservationId &&
        usageReservationClaimToken &&
        !usageAlreadyReconciled
      ) {
        await reconcileAiUsageForRecovery({
          reservationId: usageReservationId,
          claimToken: usageReservationClaimToken,
          userId: ctx.userId,
          text,
          metrics,
        }).catch((recoveryError) =>
          runLogger.error(
            "usage.recovery_reconcile_failed",
            "Failed recording generated usage recovery",
            { error: recoveryError, userId: ctx.userId },
          ),
        );
      }
      runLogger.error("persist.failed", "Failed persisting assistant output", {
        error,
      });
      throw error;
    }
  };

  if (usageReservation?.recovery) {
    finalMetrics = usageReservation.recovery.metrics;
    const message = await persistGeneratedOutput({
      text: usageReservation.recovery.text,
      metrics: usageReservation.recovery.metrics,
      usageAlreadyReconciled: true,
    });
    if (ctx.hooks?.onFinish) {
      await ctx.hooks.onFinish({
        text: usageReservation.recovery.text,
        metrics: usageReservation.recovery.metrics,
      });
    }
    return {
      assistantText:
        mode === "text" ? usageReservation.recovery.text : "",
      metrics: finalMetrics,
      persistence,
      usageReservationId,
      usageReservationClaimToken,
      usageAlreadyReconciled: true,
      streamResult:
        mode === "stream" && message
          ? {
              textStream: (async function* () {
                yield usageReservation.recovery?.text ?? "";
              })(),
              toUIMessageStreamResponse: () =>
                createPersistedResponse(
                  message.id,
                  usageReservation.recovery?.text ?? "",
                  usageReservation.recovery?.metrics ?? finalMetrics!,
                ),
            }
          : undefined,
    };
  }

  if (usageReservation?.persistedAssistant) {
    const saved = usageReservation.persistedAssistant;
    if (!saved.text.trim()) {
      throw new Error("Persisted assistant response has no text");
    }
    finalMetrics = saved.metrics;
    persistence = { status: "saved", messageId: saved.messageId };
    return {
      assistantText: mode === "text" ? saved.text : "",
      metrics: saved.metrics,
      persistence,
      usageReservationId,
      usageReservationClaimToken,
      usageAlreadyReconciled: true,
      streamResult:
        mode === "stream"
          ? {
              textStream: (async function* () {
                yield saved.text;
              })(),
              toUIMessageStreamResponse: () =>
                createPersistedResponse(
                  saved.messageId,
                  saved.text,
                  saved.metrics,
                ),
            }
          : undefined,
    };
  }

  let streamResult: Awaited<ReturnType<typeof streamChat>>;
  try {
    streamResult = await streamChat({
      userId: ctx.userId,
      chatId: ctx.chatId,
      conversationThreadId: ctx.conversationThreadId,
      userMessageId: ctx.userMessageId,
      userMessage: ctx.userMessageText,
      planId: ctx.ai?.planId,
      userRole: ctx.ai?.userRole,
      subscriptionStatus: ctx.ai?.subscriptionStatus,
      isGuest: ctx.ai?.isGuest,
      hasImages: ctx.options.allowAttachments
        ? (ctx.ai?.hasImages ?? detectImages(policyParts))
        : false,
      hasAudio: ctx.options.allowAttachments
        ? (ctx.ai?.hasAudio ?? detectAudio(policyParts))
        : false,
      inputOrigin: ctx.ai?.inputOrigin,
      messageParts: normalizedParts,
      memoryEnabled: ctx.options.allowMemoryExtraction,
      responseMode: ctx.options.allowVoiceOutput
        ? (ctx.ai?.responseMode ?? "text")
        : "text",
      voiceEnabled: ctx.options.allowVoiceOutput ? ctx.ai?.voiceEnabled : false,
      voiceUnavailableReason: ctx.options.allowVoiceOutput
        ? ctx.ai?.voiceUnavailableReason
        : undefined,
      effectiveEntitlements: ctx.rateLimit.effectiveEntitlements,
      skipConversationHistory: ctx.ai?.skipConversationHistory,
      onFinish: async ({ text, metrics }) => {
        finalMetrics = metrics;
        if (!text.trim()) {
          if (usageReservationId && usageReservationClaimToken) {
            await reconcileAiUsageForRecovery({
              reservationId: usageReservationId,
              claimToken: usageReservationClaimToken,
              userId: ctx.userId,
              text,
              metrics,
            });
          }
          throw new Error("AI generation returned an empty response");
        }

        await persistGeneratedOutput({ text, metrics });
        if (ctx.hooks?.onFinish) {
          try {
            await ctx.hooks.onFinish({ text, metrics });
          } catch (error) {
            runLogger.error("hook.onfinish_failed", "onFinish hook error", {
              error,
            });
          }
        }
      },
    });
  } catch (error) {
    if (usageReservationId && usageReservationClaimToken) {
      await releaseAiUsageReservation({
        reservationId: usageReservationId,
        claimToken: usageReservationClaimToken,
        userId: ctx.userId,
      }).catch(() => undefined);
    }
    throw error;
  }

  if (mode === "stream") {
    return {
      assistantText: "",
      metrics: finalMetrics,
      persistence,
      usageReservationId,
      usageReservationClaimToken,
      streamResult: {
        textStream: streamResult.textStream,
        toUIMessageStreamResponse: () => {
          const streamable = streamResult as typeof streamResult & {
            toUIMessageStream?: (options: {
              sendFinish?: boolean;
            }) => ReadableStream<UIMessageChunk>;
          };
          if (!streamable.toUIMessageStream) {
            throw new Error(
              "AI stream does not expose the durable UI stream primitive",
            );
          }

          const durableStream = createUIMessageStream<UIMessage>({
            async execute({ writer }) {
              let sourceErrored = false;
              try {
                const source = streamable.toUIMessageStream?.({
                  sendFinish: false,
                });
                if (!source) throw new Error("Missing UI stream");
                const reader = source.getReader();
                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value.type === "error" || value.type === "abort") {
                      sourceErrored = true;
                    }
                    writer.write(value);
                  }
                } finally {
                  reader.releaseLock();
                }

                if (sourceErrored || !finalMetrics) {
                  if (usageReservationId && usageReservationClaimToken) {
                    await releaseAiUsageReservation({
                      reservationId: usageReservationId,
                      claimToken: usageReservationClaimToken,
                      userId: ctx.userId,
                    });
                  }
                  return;
                }
                if (persistence?.status === "failed") {
                  throw persistence.error;
                }
                writer.write({
                  type: "finish",
                  finishReason: "stop",
                  messageMetadata: finishMetadata(finalMetrics),
                });
              } catch (error) {
                if (
                  !finalMetrics &&
                  usageReservationId &&
                  usageReservationClaimToken
                ) {
                  await releaseAiUsageReservation({
                    reservationId: usageReservationId,
                    claimToken: usageReservationClaimToken,
                    userId: ctx.userId,
                  }).catch(() => undefined);
                }
                throw error;
              }
            },
            onError: () =>
              "Non sono riuscito a salvare la risposta. Riprova senza perdere quota.",
          });
          return createUIMessageStreamResponse({ stream: durableStream });
        },
      },
    };
  }

  let assistantText = "";
  try {
    for await (const chunk of streamResult.textStream) {
      assistantText += chunk;
    }
  } catch (error) {
    if (!finalMetrics && usageReservationId && usageReservationClaimToken) {
      await releaseAiUsageReservation({
        reservationId: usageReservationId,
        claimToken: usageReservationClaimToken,
        userId: ctx.userId,
      }).catch(() => undefined);
    }
    throw error;
  }

  return {
    assistantText,
    metrics: finalMetrics,
    persistence,
    usageReservationId,
    usageReservationClaimToken,
    usageAlreadyReconciled: false,
  };
}
