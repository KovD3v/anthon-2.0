import type { UIMessage } from "ai";
import type { AnthonUIMessage } from "@/lib/model-experiments/types";
import type {
  ChatMessage,
  MessageFeedbackReason,
  StoredAttachment,
} from "@/types/chat";

export type ChatUIMessage = AnthonUIMessage & {
  clientMessageId?: string;
  sourceClientMessageId?: string;
  createdAt?: Date;
  attachments?: StoredAttachment[];
  voice?: ChatMessage["voice"];
  feedback?: -1 | 0 | 1 | null;
  feedbackReason?: MessageFeedbackReason;
};

/**
 * A reconnect gets the persisted job state through the normal chat payload.
 * The chat screen uses this to poll only until audio attaches or fails.
 */
export function hasPendingVoiceGeneration(
  messages: Array<{ voice?: ChatMessage["voice"] }>,
): boolean {
  return messages.some(
    (message) =>
      message.voice?.status === "PENDING" ||
      message.voice?.status === "PROCESSING",
  );
}

/**
 * A stream can fail after the server has persisted the assistant response.
 * Match the optimistic browser turn to its durable response before showing a
 * network error to the user.
 */
export function hasPersistedAssistantResponseForClientMessage(
  messages: Array<Pick<ChatUIMessage, "role" | "sourceClientMessageId">>,
  clientMessageId: string | undefined,
): boolean {
  if (!clientMessageId) return false;

  return messages.some(
    (message) =>
      message.role === "assistant" &&
      message.sourceClientMessageId === clientMessageId,
  );
}

/**
 * Convert database messages to UIMessage format for the AI SDK while
 * preserving trusted, server-serialized parts.
 * This function is client-safe.
 */
export function convertToUIMessages(messages: ChatMessage[]): ChatUIMessage[] {
  return messages.map<ChatUIMessage>((msg) => ({
    id: msg.id,
    clientMessageId: msg.clientMessageId,
    sourceClientMessageId: msg.sourceClientMessageId,
    role: msg.role,
    parts: msg.parts
      ? (msg.parts as AnthonUIMessage["parts"])
      : [{ type: "text" as const, text: msg.content || "" }],
    createdAt: new Date(msg.createdAt),
    annotations: msg.usage ? [msg.usage] : undefined,
    attachments: msg.attachments,
    voice: msg.voice,
    feedback: msg.feedback,
    feedbackReason: msg.feedbackReason,
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
