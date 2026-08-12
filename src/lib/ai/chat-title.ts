import { generateText, Output } from "ai";
import {
  buildChatMetadataContext,
  buildChatMetadataPrompt,
  type ChatMetadataMessage,
  chatMetadataSchema,
} from "@/lib/ai/chat-metadata-contract";
import {
  CHAT_METADATA_MODEL_ID,
  getChatMetadataProviderOptions,
} from "@/lib/ai/chat-metadata-model";
import { openrouter } from "@/lib/ai/providers/openrouter";
import { trackSupportAiUsage } from "@/lib/ai/usage-meter";
import type { ChatIcon } from "@/lib/chat-icons";
import { createLogger } from "@/lib/logger";

const titleLogger = createLogger("ai");

const MAX_TITLE_LENGTH = 55;
const TRAILING_WEAK_WORD_PATTERN =
  /\s+(a|ad|al|allo|alla|ai|agli|alle|con|da|dal|dallo|dalla|dai|dagli|dalle|di|del|dello|della|dei|degli|delle|e|in|nel|nello|nella|nei|negli|nelle|o|per|su|sul|sullo|sulla|sui|sugli|sulle|tra|fra)$/i;

export type GeneratedChatMetadata = {
  title: string;
  icon: ChatIcon;
};

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateAtWordBoundary(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const truncated = value.slice(0, maxLength).trimEnd();
  const lastSpace = truncated.lastIndexOf(" ");

  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
}

function cleanupTitle(value: string): string {
  const cleaned = compactWhitespace(value)
    .replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, "")
    .replace(/^(titolo|title)\s*:\s*/i, "")
    .replace(/[.!?…,:;'"“”‘’«»\s]+$/g, "")
    .replace(/\s*[-–—]\s*$/g, "")
    .replace(TRAILING_WEAK_WORD_PATTERN, "");

  return truncateAtWordBoundary(cleaned, MAX_TITLE_LENGTH);
}

function fallbackTitleFromUserText(userText: string): string {
  const firstContentLine =
    userText
      .split(/\r?\n/)
      .map((line) => line.replace(/^(user|assistant|system)\s*:\s*/i, ""))
      .map((line) => line.replace(/[^\p{L}\p{N}\s-]/gu, " "))
      .map(compactWhitespace)
      .find(Boolean) ?? "Nuova Chat";
  const title = firstContentLine
    .split(" ")
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");

  return cleanupTitle(title.charAt(0).toUpperCase() + title.slice(1));
}

function fallbackChatMetadata(fallbackUserText: string): GeneratedChatMetadata {
  return {
    title: fallbackTitleFromUserText(fallbackUserText),
    icon: "MESSAGE_SQUARE",
  };
}

export async function generateChatMetadata(
  messages: readonly ChatMetadataMessage[],
  fallbackUserText: string,
  options?: { userId?: string },
): Promise<GeneratedChatMetadata> {
  try {
    const result = await generateText({
      model: openrouter(CHAT_METADATA_MODEL_ID),
      output: Output.object({ schema: chatMetadataSchema }),
      prompt: buildChatMetadataPrompt(
        buildChatMetadataContext(messages, fallbackUserText),
      ),
      maxOutputTokens: 80,
      temperature: 0.2,
      providerOptions: {
        openrouter: getChatMetadataProviderOptions(CHAT_METADATA_MODEL_ID),
      },
    });
    const rawOutput = result.output as { title?: unknown; icon?: unknown };
    const title =
      typeof rawOutput.title === "string" ? cleanupTitle(rawOutput.title) : "";
    const generated = chatMetadataSchema.parse({ ...rawOutput, title });

    if (options?.userId) {
      await trackSupportAiUsage({
        userId: options.userId,
        modelId: CHAT_METADATA_MODEL_ID,
        usage: result.usage,
        providerMetadata: result.providerMetadata,
      });
    }

    return { title: generated.title, icon: generated.icon };
  } catch (error) {
    titleLogger.error(
      "metadata.generation_failed",
      "Chat metadata generation failed",
      { error },
    );
    return fallbackChatMetadata(fallbackUserText);
  }
}

function parseLegacyContext(context: string): ChatMetadataMessage[] {
  return context
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\s*(user|assistant)\s*:\s*(.+)$/i);
      if (!match?.[1] || !match[2]?.trim()) return null;
      return {
        role: match[1].toLowerCase() as ChatMetadataMessage["role"],
        text: match[2].trim(),
      };
    })
    .filter((message): message is ChatMetadataMessage => message !== null);
}

/**
 * Compatibility wrapper while title-only call sites migrate to metadata.
 */
export async function generateChatTitle(
  context: string,
  options?: { userId?: string },
): Promise<string> {
  const messages = parseLegacyContext(context);
  const metadata = await generateChatMetadata(
    messages.length ? messages : [{ role: "user", text: context }],
    context,
    options,
  );
  return metadata.title;
}
