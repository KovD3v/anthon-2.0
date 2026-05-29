import type { Prisma } from "@/generated/prisma";
import { extractAndSaveMemories } from "@/lib/ai/memory-extractor";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { incrementUsage } from "@/lib/rate-limit";
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

async function revalidateTags(tags: string[]) {
  if (tags.length === 0) return;

  try {
    const { revalidateTag } = await import("next/cache");
    for (const tag of tags) {
      try {
        revalidateTag(tag, "page");
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
}: PersistAssistantOutputInput) {
  const message = await prisma.message.create({
    data: {
      userId,
      ...(chatId ? { chatId } : {}),
      channel,
      direction: "OUTBOUND",
      role: "ASSISTANT",
      type: messageType,
      parts: [{ type: "text", text }] as Prisma.InputJsonValue,
      ...(mediaUrl ? { mediaUrl } : {}),
      ...(mediaType ? { mediaType } : {}),
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

  if (tags.length > 0) {
    await revalidateTags(tags);
  }

  if (!allowMemoryExtraction) {
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
