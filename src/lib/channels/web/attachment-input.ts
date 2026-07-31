import type { UIMessage } from "ai";
import {
  isDataUrl,
  isHttpUrl,
  MAX_MULTIMODAL_MEDIA_BYTES,
  normalizeInlineMediaBase64,
  normalizeMediaType,
} from "@/lib/ai/multimodal-media";
import type { ChannelMessagePart } from "@/lib/channel-flow";
import { prisma } from "@/lib/db";

export const MAX_WEB_MESSAGE_ATTACHMENTS = 6;
export const MAX_WEB_ATTACHMENT_ID_LENGTH = 128;
export const MAX_WEB_MESSAGE_ATTACHMENT_BYTES = 30 * 1024 * 1024;

export class WebAttachmentInputError extends Error {
  constructor(message = "Invalid attachment") {
    super(message);
    this.name = "WebAttachmentInputError";
  }
}

type ClientFilePart = {
  attachmentId?: unknown;
  data?: unknown;
  url?: unknown;
};

type CanonicalFilePart = ChannelMessagePart & {
  type: "file";
  attachmentId: string;
  data: string;
  mimeType: string;
  name: string;
  size: number;
};

export type ResolvedWebMessageParts = {
  aiParts: ChannelMessagePart[];
  persistedParts: ChannelMessagePart[];
  attachmentIds: string[];
};

function getAttachmentId(part: ClientFilePart) {
  if (
    typeof part.attachmentId !== "string" ||
    !part.attachmentId.trim() ||
    part.attachmentId.length > MAX_WEB_ATTACHMENT_ID_LENGTH
  ) {
    throw new WebAttachmentInputError();
  }
  return part.attachmentId;
}

/**
 * Replace all client-controlled file URLs and metadata with owner-scoped
 * Attachment rows. Inline audio is retained only after exact type, byte-size,
 * base64, and magic-byte validation; every remote URL comes from durable state.
 */
export async function resolveOwnedWebMessageParts(
  message: UIMessage,
  userId: string,
): Promise<ResolvedWebMessageParts> {
  const fileParts = (message.parts ?? []).filter(
    (part) => part.type === "file",
  );
  if (fileParts.length > MAX_WEB_MESSAGE_ATTACHMENTS) {
    throw new WebAttachmentInputError();
  }

  const requestedIds = Array.from(
    new Set(fileParts.map((part) => getAttachmentId(part as ClientFilePart))),
  );

  const attachments =
    requestedIds.length === 0
      ? []
      : await prisma.attachment.findMany({
          where: { id: { in: requestedIds }, userId },
          select: {
            id: true,
            name: true,
            contentType: true,
            size: true,
            blobUrl: true,
          },
        });
  const attachmentsById = new Map(
    attachments.map((attachment) => [attachment.id, attachment]),
  );

  if (attachmentsById.size !== requestedIds.length) {
    throw new WebAttachmentInputError();
  }
  if (
    attachments.some(
      ({ size }) =>
        !Number.isSafeInteger(size) ||
        size <= 0 ||
        size > MAX_MULTIMODAL_MEDIA_BYTES,
    )
  ) {
    throw new WebAttachmentInputError();
  }

  const aggregateBytes = fileParts.reduce((total, part) => {
    const attachment = attachmentsById.get(
      getAttachmentId(part as ClientFilePart),
    );
    return total + (attachment?.size ?? 0);
  }, 0);
  if (aggregateBytes > MAX_WEB_MESSAGE_ATTACHMENT_BYTES) {
    throw new WebAttachmentInputError();
  }

  const aiParts: ChannelMessagePart[] = [];
  const persistedParts: ChannelMessagePart[] = [];
  const attachmentIds: string[] = [];

  for (const part of message.parts ?? []) {
    if (part.type === "text") {
      const textPart = { type: "text" as const, text: part.text || "" };
      aiParts.push(textPart);
      persistedParts.push(textPart);
      continue;
    }

    if (part.type !== "file") {
      continue;
    }

    const clientFile = part as ClientFilePart;
    const attachmentId = getAttachmentId(clientFile);
    const attachment = attachmentsById.get(attachmentId);
    if (!attachment) {
      throw new WebAttachmentInputError();
    }

    const mimeType = normalizeMediaType(attachment.contentType);
    const persistedFile: CanonicalFilePart = {
      type: "file",
      data: attachment.blobUrl,
      mimeType,
      name: attachment.name,
      size: attachment.size,
      attachmentId,
    };
    persistedParts.push(persistedFile);
    attachmentIds.push(attachmentId);

    const inlineCandidate =
      typeof clientFile.data === "string"
        ? clientFile.data
        : typeof clientFile.url === "string" && isDataUrl(clientFile.url)
          ? clientFile.url
          : undefined;
    const canUseInlineAudio =
      mimeType.startsWith("audio/") &&
      inlineCandidate !== undefined &&
      !isHttpUrl(inlineCandidate);
    if (mimeType.startsWith("audio/") && !canUseInlineAudio) {
      throw new WebAttachmentInputError();
    }

    if (canUseInlineAudio) {
      try {
        aiParts.push({
          ...persistedFile,
          data: normalizeInlineMediaBase64({
            data: inlineCandidate,
            mediaType: mimeType,
            expectedSize: attachment.size,
          }),
        });
      } catch {
        throw new WebAttachmentInputError();
      }
    } else {
      aiParts.push(persistedFile);
    }
  }

  return { aiParts, persistedParts, attachmentIds };
}
