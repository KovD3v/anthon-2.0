import type { UIMessage } from "ai";
import type { ChatMessage } from "@/types/chat";

/**
 * Convert database messages to UIMessage format for the AI SDK.
 * This function is client-safe.
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
    attachments: msg.attachments,
  }));
}

/**
 * Extract text content from message parts.
 * This function is client-safe.
 */
export function extractTextFromParts(
  parts: UIMessage["parts"] | undefined,
): string {
  if (!parts) return "";
  return parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}
