import { streamChat } from "@/lib/ai/orchestrator";
import { persistAssistantOutput } from "./persistence";
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
  const normalizedParts = normalizeParts(ctx.parts);
  const mode = ctx.execution?.mode ?? "text";

  let finalMetrics: RunChannelFlowResult["metrics"];

  const streamResult = await streamChat({
    userId: ctx.userId,
    chatId: ctx.chatId,
    userMessage: ctx.userMessageText,
    planId: ctx.ai?.planId,
    userRole: ctx.ai?.userRole,
    subscriptionStatus: ctx.ai?.subscriptionStatus,
    isGuest: ctx.ai?.isGuest,
    hasImages: ctx.ai?.hasImages ?? detectImages(ctx.parts),
    hasAudio: ctx.ai?.hasAudio ?? detectAudio(ctx.parts),
    messageParts: normalizedParts,
    effectiveEntitlements: ctx.rateLimit.effectiveEntitlements,
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
          } catch (error) {
            console.error(
              "[ChannelFlow] Failed persisting assistant output:",
              error,
            );
          }
        }

        if (ctx.hooks?.onFinish) {
          try {
            await ctx.hooks.onFinish({ text, metrics });
          } catch (error) {
            console.error("[ChannelFlow] onFinish hook error:", error);
          }
        }
      }
    },
  });

  if (mode === "stream") {
    return {
      assistantText: "",
      metrics: finalMetrics,
      streamResult: streamResult as RunChannelFlowResult["streamResult"],
    };
  }

  let assistantText = "";
  for await (const chunk of streamResult.textStream) {
    assistantText += chunk;
  }

  return {
    assistantText,
    metrics: finalMetrics,
  };
}
