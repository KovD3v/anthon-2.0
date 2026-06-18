import { streamChat } from "@/lib/ai/orchestrator";
import { createLogger } from "@/lib/logger";
import { persistAssistantOutput } from "./persistence";

const runLogger = createLogger("ai");

import type {
  ChannelMessagePart,
  InboundContext,
  RunChannelFlowResult,
} from "./types";

function normalizeParts(parts: ChannelMessagePart[]) {
  return parts.map((part) => {
    if (part.type === "text") {
      return {
        type: "text" as const,
        text: part.text || "",
      };
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

  const streamResult = await streamChat({
    userId: ctx.userId,
    chatId: ctx.chatId,
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
    messageParts: normalizedParts,
    memoryEnabled: ctx.options.allowMemoryExtraction,
    responseMode: ctx.options.allowVoiceOutput
      ? (ctx.ai?.responseMode ?? "text")
      : "text",
    voiceEnabled: ctx.options.allowVoiceOutput ? ctx.ai?.voiceEnabled : false,
    effectiveEntitlements: ctx.rateLimit.effectiveEntitlements,
    skipConversationHistory: ctx.ai?.skipConversationHistory,
    onFinish: async ({ text, metrics }) => {
      finalMetrics = metrics;

      if (text && text.trim().length > 0) {
        if (ctx.persistence?.saveAssistantMessage !== false) {
          try {
            await persistAssistantOutput({
              userId: ctx.userId,
              chatId: ctx.chatId,
              channel: ctx.persistence?.channel ?? "WEB",
              text,
              userMessageText: ctx.userMessageText,
              metrics,
              metadata: ctx.persistence?.metadata,
              updateChatTimestamp: ctx.persistence?.updateChatTimestamp,
              revalidateTags: ctx.persistence?.revalidateTags,
              allowMemoryExtraction: ctx.options.allowMemoryExtraction,
              waitUntil: ctx.persistence?.waitUntil,
            });
            persistence = { status: "saved" };
          } catch (error) {
            persistence = { status: "failed", error };
            runLogger.error(
              "persist.failed",
              "Failed persisting assistant output",
              { error },
            );
          }
        }

        if (ctx.hooks?.onFinish) {
          try {
            await ctx.hooks.onFinish({ text, metrics });
          } catch (error) {
            runLogger.error("hook.onfinish_failed", "onFinish hook error", {
              error,
            });
          }
        }
      }
    },
  });

  if (mode === "stream") {
    return {
      assistantText: "",
      metrics: finalMetrics,
      persistence,
      streamResult: {
        textStream: streamResult.textStream,
        toUIMessageStreamResponse: () =>
          streamResult.toUIMessageStreamResponse({
            messageMetadata: ({ part }: { part: unknown }) => {
              if (!isFinishStreamPart(part)) {
                return undefined;
              }

              const usage = finalMetrics ?? metricsFromFinishPart(part);
              if (!usage) {
                return undefined;
              }

              return {
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                generationTimeMs: usage.generationTimeMs,
                reasoningTimeMs: usage.reasoningTimeMs ?? undefined,
              };
            },
          }),
      },
    };
  }

  let assistantText = "";
  for await (const chunk of streamResult.textStream) {
    assistantText += chunk;
  }

  return {
    assistantText,
    metrics: finalMetrics,
    persistence,
  };
}

function isFinishStreamPart(part: unknown): part is {
  type: "finish";
  totalUsage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
} {
  return (
    Boolean(part && typeof part === "object" && "type" in part) &&
    (part as { type?: unknown }).type === "finish"
  );
}

function metricsFromFinishPart(part: {
  totalUsage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}) {
  const usage = part.totalUsage ?? part.usage;
  if (!usage) {
    return undefined;
  }

  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    generationTimeMs: undefined,
    reasoningTimeMs: undefined,
  };
}
