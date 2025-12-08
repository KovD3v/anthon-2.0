/**
 * Chat Utilities
 *
 * Shared utilities for chat message handling and conversion.
 */

import type { UIMessage } from "ai";
import type { ChatMessage } from "@/types/chat";

// -----------------------------------------------------
// Message Part Types
// -----------------------------------------------------

export interface TextPart {
  type: "text";
  text: string;
}

export interface FilePart {
  type: "file";
  data: string;
  mimeType: string;
  name: string;
  size: number;
  attachmentId?: string;
}

export type MessagePart = TextPart | FilePart;

// -----------------------------------------------------
// Conversion Utilities
// -----------------------------------------------------

/**
 * Convert database messages to UIMessage format for the AI SDK.
 * Consolidates duplicated conversion logic from page.tsx.
 */
export function convertToUIMessages(messages: ChatMessage[]): UIMessage[] {
  return messages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    parts: msg.parts
      ? (msg.parts as UIMessage["parts"])
      : [{ type: "text" as const, text: msg.content || "" }],
    createdAt: new Date(msg.createdAt),
    annotations: msg.usage ? [msg.usage] : undefined,
  }));
}

/**
 * Extract text content from message parts.
 */
export function extractTextFromParts(
  parts: UIMessage["parts"] | undefined,
): string {
  if (!parts) return "";
  return parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}
