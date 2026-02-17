import type { Prisma } from "@/generated/prisma";
import { extractAndSaveMemories } from "@/lib/ai/memory-extractor";
import { prisma } from "@/lib/db";
import { incrementUsage } from "@/lib/rate-limit";
import type { PersistAssistantOutputInput } from "./types";

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

async function revalidateTags(tags: string[]) {
  if (tags.length === 0) return;

  try {
    const { revalidateTag } = await import("next/cache");
    for (const tag of tags) {
      try {
        revalidateTag(tag, "page");
      } catch (error) {
        console.error("[ChannelFlow] Failed to revalidate tag:", tag, error);
      }
    }
  } catch (error) {
    console.error("[ChannelFlow] Failed importing next/cache:", error);
  }
}

export async function persistAssistantOutput({
  userId,
  chatId,
  channel,
  text,
  userMessageText,
  metrics,
  metadata,
  updateChatTimestamp = false,
  revalidateTags: tags = [],
  allowMemoryExtraction = false,
  waitUntil,
}: PersistAssistantOutputInput) {
  await prisma.message.create({
    data: {
      userId,
      ...(chatId ? { chatId } : {}),
      channel,
      direction: "OUTBOUND",
      role: "ASSISTANT",
      type: "TEXT",
      content: text,
      parts: [{ type: "text", text }] as Prisma.InputJsonValue,
      ...(metadata ? { metadata } : {}),
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

  if (updateChatTimestamp && chatId) {
    await prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });
  }

  await incrementUsage(
    userId,
    metrics.inputTokens,
    metrics.outputTokens,
    metrics.costUsd,
  );

  if (tags.length > 0) {
    await revalidateTags(tags);
  }

  if (!allowMemoryExtraction) {
    return;
  }

  const memoryTask = extractAndSaveMemories(
    userId,
    userMessageText,
    text,
  ).catch((error) => {
    console.error("[ChannelFlow] Memory extraction error:", error);
  });

  scheduleBackground(waitUntil, memoryTask);
}
