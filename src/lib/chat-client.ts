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

export interface FilePartPreview {
  src: string;
  mimeType: string;
  name: string;
  size: number;
  attachmentId?: string;
}

/**
 * Normalize both locally uploaded file parts and AI SDK streamed file parts.
 */
export function normalizeFilePartForPreview(
  part: unknown,
): FilePartPreview | null {
  if (!part || typeof part !== "object") return null;

  const filePart = part as Record<string, unknown>;
  if (filePart.type !== "file") return null;

  const src = typeof filePart.data === "string" ? filePart.data : filePart.url;
  const mimeType =
    typeof filePart.mimeType === "string"
      ? filePart.mimeType
      : filePart.mediaType;

  if (typeof src !== "string" || typeof mimeType !== "string") {
    return null;
  }

  return {
    src,
    mimeType,
    name: typeof filePart.name === "string" ? filePart.name : "Allegato",
    size: typeof filePart.size === "number" ? filePart.size : 0,
    attachmentId:
      typeof filePart.attachmentId === "string"
        ? filePart.attachmentId
        : undefined,
  };
}
