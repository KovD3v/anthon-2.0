import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { getCapabilityPlannerMode } from "@/lib/ai/capability-arbitration";
import {
  getImmediatelyAttributableApproval,
  mightResolvePendingMemoryApproval,
} from "@/lib/ai/memory-approval";
import { resolveExactMemoryDeleteTarget } from "@/lib/ai/memory-target";
import { streamChat } from "@/lib/ai/orchestrator";
import { createToolStreamRedactor } from "@/lib/ai/tool-privacy";
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

export class AssistantPersistenceError extends Error {
  constructor(readonly persistenceCause: unknown) {
    super("Assistant response persistence failed", { cause: persistenceCause });
    this.name = "AssistantPersistenceError";
  }
}

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
  includeTechnicalMetrics: boolean,
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
        ...(includeTechnicalMetrics
          ? { messageMetadata: finishMetadata(metrics) }
          : {}),
      });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

function withCancellation<T>(
  stream: ReadableStream<T>,
  onCancel: (reason: unknown) => Promise<void>,
) {
  const reader = stream.getReader();
  return new ReadableStream<T>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await onCancel(reason);
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}

export async function runChannelFlow(
  ctx: InboundContext,
): Promise<RunChannelFlowResult> {
  const includeTechnicalMetrics =
    ctx.execution?.includeTechnicalMetrics === true;
  const policyParts = ctx.options.allowAttachments
    ? ctx.parts
    : ctx.parts.filter((part) => part.type === "text");
  const normalizedParts = normalizeParts(policyParts);
  const mode = ctx.execution?.mode ?? "text";
  const capabilityPlannerMode = getCapabilityPlannerMode();

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
  type UsageReservationState =
    | "reserved"
    | "settling"
    | "settled"
    | "releasing";
  let usageReservationState: UsageReservationState =
    usageReservation?.recovery || usageReservation?.persistedAssistant
      ? "settled"
      : "reserved";
  let usageReservationRelease: Promise<boolean> | undefined;

  const releaseUsageReservationOnce = () => {
    if (usageReservationState === "releasing") {
      return usageReservationRelease ?? Promise.resolve(false);
    }
    if (
      usageReservationState !== "reserved" ||
      !usageReservationId ||
      !usageReservationClaimToken
    ) {
      return Promise.resolve(false);
    }
    usageReservationState = "releasing";
    usageReservationRelease = (async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const released = await releaseAiUsageReservation({
            reservationId: usageReservationId,
            claimToken: usageReservationClaimToken,
            userId: ctx.userId,
          });
          usageReservationState = "settled";
          return released;
        } catch (error) {
          lastError = error;
        }
      }

      usageReservationState = "reserved";
      usageReservationRelease = undefined;
      runLogger.error(
        "usage.reservation_release_failed",
        "Failed releasing AI usage reservation after retry",
        { error: lastError, userId: ctx.userId },
      );
      return false;
    })();
    return usageReservationRelease;
  };

  const beginUsageReservationSettlement = () => {
    if (!usageReservationId || !usageReservationClaimToken) return;
    if (usageReservationState === "releasing") {
      throw new Error("Usage reservation was released before settlement");
    }
    if (usageReservationState === "reserved") {
      usageReservationState = "settling";
    }
  };

  const markUsageReservationSettled = () => {
    if (usageReservationId && usageReservationClaimToken) {
      usageReservationState = "settled";
    }
  };

  const resetUsageReservationSettlement = () => {
    if (usageReservationState === "settling") {
      usageReservationState = "reserved";
    }
  };

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
    if (!usageAlreadyReconciled) {
      beginUsageReservationSettlement();
    }
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
        capabilityPlannerMode,
        waitUntil: ctx.persistence?.waitUntil,
        usageReservationId,
        usageReservationClaimToken,
        usageAlreadyReconciled,
        externalInboundClaimToken: ctx.persistence?.externalInboundClaimToken,
      });
      persistence = { status: "saved", messageId: message.id };
      markUsageReservationSettled();
      return message;
    } catch (error) {
      persistence = { status: "failed", error };
      if (
        usageReservationId &&
        usageReservationClaimToken &&
        !usageAlreadyReconciled
      ) {
        try {
          await reconcileAiUsageForRecovery({
            reservationId: usageReservationId,
            claimToken: usageReservationClaimToken,
            userId: ctx.userId,
            text,
            metrics,
          });
          markUsageReservationSettled();
        } catch (recoveryError) {
          resetUsageReservationSettlement();
          runLogger.error(
            "usage.recovery_reconcile_failed",
            "Failed recording generated usage recovery",
            { error: recoveryError, userId: ctx.userId },
          );
        }
      }
      runLogger.error("persist.failed", "Failed persisting assistant output", {
        error,
      });
      throw new AssistantPersistenceError(error);
    }
  };

  if (usageReservation?.recovery) {
    const recovery = usageReservation.recovery;
    finalMetrics = recovery.metrics;
    const message = await persistGeneratedOutput({
      text: recovery.text,
      metrics: recovery.metrics,
      usageAlreadyReconciled: true,
    });
    if (ctx.hooks?.onFinish) {
      await ctx.hooks.onFinish({
        text: recovery.text,
        metrics: recovery.metrics,
      });
    }
    return {
      assistantText: mode === "text" ? recovery.text : "",
      metrics: finalMetrics,
      persistence,
      usageReservationId,
      usageReservationClaimToken,
      usageAlreadyReconciled: true,
      streamResult:
        mode === "stream" && message
          ? {
              textStream: (async function* () {
                yield recovery.text;
              })(),
              toUIMessageStreamResponse: () =>
                createPersistedResponse(
                  message.id,
                  recovery.text,
                  recovery.metrics,
                  includeTechnicalMetrics,
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
                  includeTechnicalMetrics,
                ),
            }
          : undefined,
    };
  }

  const generationAbortController = new AbortController();
  const requestAbortSignal = ctx.execution?.abortSignal;
  const forwardRequestAbort = () =>
    generationAbortController.abort(requestAbortSignal?.reason);
  generationAbortController.signal.addEventListener(
    "abort",
    () => {
      const release = releaseUsageReservationOnce();
      (ctx.execution?.waitUntil ?? ctx.persistence?.waitUntil)?.(release);
    },
    { once: true },
  );
  if (requestAbortSignal?.aborted) {
    forwardRequestAbort();
  } else {
    requestAbortSignal?.addEventListener("abort", forwardRequestAbort, {
      once: true,
    });
  }

  const detachRequestAbort = () =>
    requestAbortSignal?.removeEventListener("abort", forwardRequestAbort);

  const memoryAvailable =
    ctx.ai?.isGuest !== true && ctx.options.allowMemoryExtraction;
  const [pendingMemoryApproval, resolvedMemoryTarget] = await Promise.all([
    memoryAvailable &&
    ctx.conversationThreadId &&
    ctx.userMessageId &&
    mightResolvePendingMemoryApproval(ctx.userMessageText)
      ? getImmediatelyAttributableApproval({
          userId: ctx.userId,
          conversationId: ctx.conversationThreadId,
          currentUserMessageId: ctx.userMessageId,
        })
      : Promise.resolve(null),
    memoryAvailable
      ? resolveExactMemoryDeleteTarget({
          userId: ctx.userId,
          userMessage: ctx.userMessageText,
        })
      : Promise.resolve(null),
  ]);

  let streamResult: Awaited<ReturnType<typeof streamChat>>;
  try {
    streamResult = await streamChat({
      userId: ctx.userId,
      chatId: ctx.chatId,
      conversationThreadId: ctx.conversationThreadId,
      userMessageId: ctx.userMessageId,
      ...(pendingMemoryApproval ? { pendingMemoryApproval } : {}),
      resolvedMemoryTarget,
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
      abortSignal: generationAbortController.signal,
      onFinish: async ({ text, metrics }) => {
        finalMetrics = metrics;
        generationAbortController.signal.throwIfAborted();
        if (!text.trim()) {
          if (usageReservationId && usageReservationClaimToken) {
            beginUsageReservationSettlement();
            try {
              await reconcileAiUsageForRecovery({
                reservationId: usageReservationId,
                claimToken: usageReservationClaimToken,
                userId: ctx.userId,
                text,
                metrics,
              });
              markUsageReservationSettled();
            } catch (error) {
              resetUsageReservationSettlement();
              throw error;
            }
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
    detachRequestAbort();
    await releaseUsageReservationOnce();
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
              sendReasoning?: boolean;
            }) => ReadableStream<UIMessageChunk>;
          };
          if (!streamable.toUIMessageStream) {
            detachRequestAbort();
            generationAbortController.abort(
              new Error("Missing durable UI stream primitive"),
            );
            throw new Error(
              "AI stream does not expose the durable UI stream primitive",
            );
          }

          let sourceReader:
            | ReadableStreamDefaultReader<UIMessageChunk>
            | undefined;
          const redactToolStreamChunk = createToolStreamRedactor();
          const durableStream = createUIMessageStream<UIMessage>({
            async execute({ writer }) {
              let sourceErrored = false;
              try {
                const source = streamable.toUIMessageStream?.({
                  sendFinish: false,
                  sendReasoning: false,
                });
                if (!source) throw new Error("Missing UI stream");
                const reader = source.getReader();
                sourceReader = reader;
                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value.type === "error" || value.type === "abort") {
                      sourceErrored = true;
                      if (!generationAbortController.signal.aborted) {
                        generationAbortController.abort(value.type);
                      }
                      await releaseUsageReservationOnce();
                    }
                    const safeChunk = redactToolStreamChunk(value);
                    if (safeChunk) {
                      writer.write(safeChunk as UIMessageChunk);
                    }
                  }
                } finally {
                  sourceReader = undefined;
                  reader.releaseLock();
                }

                if (sourceErrored || !finalMetrics) {
                  await releaseUsageReservationOnce();
                  return;
                }
                if (persistence?.status === "failed") {
                  throw persistence.error;
                }
                writer.write({
                  type: "finish",
                  finishReason: "stop",
                  ...(includeTechnicalMetrics
                    ? { messageMetadata: finishMetadata(finalMetrics) }
                    : {}),
                });
              } catch (error) {
                await releaseUsageReservationOnce();
                throw error;
              } finally {
                detachRequestAbort();
              }
            },
            onError: () =>
              "Non sono riuscito a salvare la risposta. Riprova senza perdere quota.",
          });
          const response = createUIMessageStreamResponse({
            stream: durableStream,
          });
          if (!response.body) return response;

          const cancellationAwareBody = withCancellation(
            response.body,
            async (reason) => {
              if (!generationAbortController.signal.aborted) {
                generationAbortController.abort(reason);
              }
              await releaseUsageReservationOnce();
              await sourceReader?.cancel(reason).catch(() => undefined);
              detachRequestAbort();
            },
          );
          return new Response(cancellationAwareBody, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
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
    await releaseUsageReservationOnce();
    throw error;
  } finally {
    detachRequestAbort();
  }

  if (generationAbortController.signal.aborted) {
    await releaseUsageReservationOnce();
    generationAbortController.signal.throwIfAborted();
  }

  if (!finalMetrics && usageReservationId && usageReservationClaimToken) {
    await releaseUsageReservationOnce();
    throw new Error("AI generation completed without final metrics");
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
