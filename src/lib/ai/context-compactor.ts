/**
 * Context Compactor
 *
 * Automatically summarizes old messages when conversation approaches context limit.
 * Uses a fast, cheap model (gemini-2.0-flash) for summarization.
 */

import { generateText } from "ai";
import type { Message } from "@/generated/prisma";
import { openrouter } from "./providers/openrouter";
import { getContextBudget } from "./tokenlens";

// -----------------------------------------------------
// CONFIGURATION
// -----------------------------------------------------

// Model for summarization - fast and cheap
const SUMMARIZATION_MODEL = openrouter("google/gemini-2.0-flash");
const SUMMARIZATION_MODEL_ID = "google/gemini-2.0-flash";

// Thresholds for triggering compaction
const COMPACTION_THRESHOLD_PERCENT = 70; // Start compacting at 70% context usage
const TARGET_PERCENT_AFTER_COMPACTION = 50; // Aim for 50% after compaction

// Number of recent messages to always keep uncompacted
const PRESERVE_RECENT_MESSAGES = 10;

// Minimum messages before considering compaction
const MIN_MESSAGES_FOR_COMPACTION = 15;

// -----------------------------------------------------
// TYPES
// -----------------------------------------------------

export interface CompactionResult {
  compacted: boolean;
  summary?: string;
  originalMessageCount: number;
  preservedMessageCount: number;
  summarizedMessageCount: number;
  estimatedTokensSaved?: number;
}

export interface MessageForContext {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ConversationContext {
  messages: MessageForContext[];
  summary?: string;
  totalTokenEstimate: number;
}

// -----------------------------------------------------
// MAIN COMPACTION FUNCTION
// -----------------------------------------------------

/**
 * Compact conversation history if approaching context limit.
 * Returns the compacted messages ready for the AI.
 */
export function compactConversation(
  modelId: string,
  messages: Message[],
  existingSummary?: string
): ConversationContext {
  // Not enough messages to compact
  if (messages.length < MIN_MESSAGES_FOR_COMPACTION) {
    return {
      messages: convertToSimpleMessages(messages),
      summary: existingSummary,
      totalTokenEstimate: estimateTokens(messages),
    };
  }

  // Estimate current token usage
  const currentTokens = estimateTokens(messages);
  const contextBudget = getContextBudget(modelId, currentTokens);

  // Check if compaction is needed
  if (contextBudget.percentUsed < COMPACTION_THRESHOLD_PERCENT) {
    return {
      messages: convertToSimpleMessages(messages),
      summary: existingSummary,
      totalTokenEstimate: currentTokens,
    };
  }

  console.log(
    `[ContextCompactor] Context at ${contextBudget.percentUsed.toFixed(
      1
    )}%, compaction needed`
  );

  // Determine how many messages to summarize
  const messagesToPreserve = messages.slice(-PRESERVE_RECENT_MESSAGES);
  const messagesToSummarize = messages.slice(0, -PRESERVE_RECENT_MESSAGES);

  if (messagesToSummarize.length === 0) {
    return {
      messages: convertToSimpleMessages(messages),
      summary: existingSummary,
      totalTokenEstimate: currentTokens,
    };
  }

  // For sync operation, build a placeholder summary
  // Actual summarization should be done async before calling compactConversation
  const placeholderSummary =
    existingSummary ?? buildQuickSummary(messagesToSummarize);

  // Build compacted context
  const compactedMessages: MessageForContext[] = [
    {
      role: "system",
      content: `[Previous conversation summary]\n${placeholderSummary}\n[End of summary - recent messages follow]`,
    },
    ...convertToSimpleMessages(messagesToPreserve),
  ];

  const newTokenEstimate =
    estimateTokens(messagesToPreserve) +
    estimateStringTokens(placeholderSummary);

  console.log(
    `[ContextCompactor] Compacted ${messagesToSummarize.length} messages, kept ${messagesToPreserve.length} recent`
  );

  return {
    messages: compactedMessages,
    summary: placeholderSummary,
    totalTokenEstimate: newTokenEstimate,
  };
}

// -----------------------------------------------------
// SUMMARIZATION
// -----------------------------------------------------

/**
 * Build a quick summary without AI (for sync operation).
 */
function buildQuickSummary(messages: Message[]): string {
  const topics = messages
    .filter((m) => m.role === "USER")
    .slice(0, 5)
    .map((m) => m.content?.slice(0, 50))
    .filter(Boolean)
    .join(", ");

  return `Previous discussion covered: ${topics}... (${messages.length} messages)`;
}

/**
 * Generate a summary of messages using the summarization model.
 * Call this async before compacting for better summaries.
 */
export async function summarizeMessages(
  messages: Message[],
  existingSummary?: string
): Promise<string> {
  const conversationText = messages
    .map((m) => {
      const role = m.role === "USER" ? "User" : "Assistant";
      return `${role}: ${m.content ?? ""}`;
    })
    .join("\n\n");

  const prompt = existingSummary
    ? `You are summarizing a conversation to preserve context while reducing tokens.

Previous summary:
${existingSummary}

New messages to incorporate:
${conversationText}

Create an updated, comprehensive summary that:
1. Preserves all key information, decisions, and context
2. Maintains important details mentioned by the user
3. Notes any tools used or actions taken
4. Is concise but complete
5. Is written in third person

Updated summary:`
    : `You are summarizing a conversation to preserve context while reducing tokens.

Conversation:
${conversationText}

Create a comprehensive summary that:
1. Preserves all key information, decisions, and context
2. Maintains important details mentioned by the user
3. Notes any tools used or actions taken
4. Is concise but complete (aim for ~200-300 words)
5. Is written in third person

Summary:`;

  try {
    const result = await generateText({
      model: SUMMARIZATION_MODEL,
      prompt,
      maxOutputTokens: 500,
      temperature: 0.3,
    });

    return result.text;
  } catch (error) {
    console.error("[ContextCompactor] Summarization failed:", error);
    // Fallback: return a basic summary
    return `[Summarization failed] Conversation contained ${
      messages.length
    } messages discussing: ${
      messages[0]?.content?.slice(0, 100) ?? "various topics"
    }...`;
  }
}

// -----------------------------------------------------
// TOKEN ESTIMATION
// -----------------------------------------------------

/**
 * Rough token estimation (4 chars per token average).
 */
function estimateTokens(messages: Message[]): number {
  let total = 0;
  for (const msg of messages) {
    if (msg.content) {
      total += Math.ceil(msg.content.length / 4);
    }
    // Add overhead for message structure
    total += 10;
  }
  return total;
}

/**
 * Estimate tokens for a string.
 */
export function estimateStringTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// -----------------------------------------------------
// MESSAGE CONVERSION
// -----------------------------------------------------

/**
 * Convert database messages to simple message format.
 */
function convertToSimpleMessages(messages: Message[]): MessageForContext[] {
  return messages.map((msg) => ({
    role: msg.role.toLowerCase() as "user" | "assistant" | "system",
    content: msg.content ?? "",
  }));
}

// -----------------------------------------------------
// UTILITY FUNCTIONS
// -----------------------------------------------------

/**
 * Check if compaction would be beneficial for the given messages.
 */
export function shouldCompact(
  modelId: string,
  messageCount: number,
  estimatedTokens: number
): boolean {
  if (messageCount < MIN_MESSAGES_FOR_COMPACTION) {
    return false;
  }

  const contextBudget = getContextBudget(modelId, estimatedTokens);
  return contextBudget.percentUsed >= COMPACTION_THRESHOLD_PERCENT;
}

/**
 * Generate a title for a conversation based on the first few messages.
 */
export async function generateChatTitle(
  firstUserMessage: string
): Promise<string> {
  try {
    const result = await generateText({
      model: SUMMARIZATION_MODEL,
      prompt: `Generate a short, descriptive title (3-6 words) for a conversation that starts with this message:

"${firstUserMessage.slice(0, 500)}"

Title (no quotes, no punctuation at end):`,
      maxOutputTokens: 20,
      temperature: 0.7,
    });

    // Clean up the title
    return result.text
      .trim()
      .replace(/["'.]+$/, "")
      .slice(0, 50);
  } catch (error) {
    console.error("[ContextCompactor] Title generation failed:", error);
    // Fallback: use first few words
    return `${firstUserMessage.slice(0, 40).trim()}...`;
  }
}

// Export configuration for reference
export const COMPACTION_CONFIG = {
  summarizationModelId: SUMMARIZATION_MODEL_ID,
  compactionThresholdPercent: COMPACTION_THRESHOLD_PERCENT,
  targetPercentAfterCompaction: TARGET_PERCENT_AFTER_COMPACTION,
  preserveRecentMessages: PRESERVE_RECENT_MESSAGES,
  minMessagesForCompaction: MIN_MESSAGES_FOR_COMPACTION,
};
