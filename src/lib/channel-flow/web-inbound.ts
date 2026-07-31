import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { prisma } from "@/lib/db";

const MAX_WEB_CLIENT_MESSAGE_ID_LENGTH = 128;
const WEB_CLIENT_MESSAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

const webInboundSelect = {
  id: true,
  userId: true,
  chatId: true,
  conversationThreadId: true,
  clientMessagePayloadHash: true,
  parts: true,
  generatedResponse: {
    select: {
      id: true,
      parts: true,
    },
  },
} as const;

type WebInboundMessage = Prisma.MessageGetPayload<{
  select: typeof webInboundSelect;
}>;

export class WebInboundConflictError extends Error {
  readonly status = 409;

  constructor(
    readonly reason:
      | "chat_mismatch"
      | "payload_mismatch"
      | "attachment_claim_failed",
  ) {
    super(
      reason === "chat_mismatch"
        ? "Client message ID was already used in another chat"
        : reason === "payload_mismatch"
          ? "Client message ID was already used for different content"
          : "One or more attachments could not be linked to this message",
    );
    this.name = "WebInboundConflictError";
  }
}

export function isValidWebClientMessageId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_WEB_CLIENT_MESSAGE_ID_LENGTH &&
    WEB_CLIENT_MESSAGE_ID_PATTERN.test(value)
  );
}

function isUniqueConstraintError(error: unknown) {
  return (
    Boolean(error && typeof error === "object" && "code" in error) &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

function assertSameInbound(
  existing: WebInboundMessage,
  {
    chatId,
    conversationThreadId,
    payloadHash,
  }: {
    chatId: string;
    conversationThreadId: string;
    payloadHash: string;
  },
) {
  if (
    existing.chatId !== chatId ||
    existing.conversationThreadId !== conversationThreadId
  ) {
    throw new WebInboundConflictError("chat_mismatch");
  }
  if (existing.clientMessagePayloadHash !== payloadHash) {
    throw new WebInboundConflictError("payload_mismatch");
  }
}

export function getWebClientPayloadHash(parts: unknown): string {
  return createHash("sha256").update(canonicalJson(parts)).digest("hex");
}

function webInboundWhere({
  userId,
  clientMessageId,
}: {
  userId: string;
  clientMessageId: string;
}) {
  return {
    userId_channel_clientMessageId: {
      userId,
      channel: "WEB" as const,
      clientMessageId,
    },
  };
}

export async function findExistingWebInboundMessage({
  userId,
  chatId,
  conversationThreadId,
  clientMessageId,
  payloadHash,
}: {
  userId: string;
  chatId: string;
  conversationThreadId: string;
  clientMessageId: string;
  payloadHash: string;
}): Promise<WebInboundMessage | null> {
  const existing = await prisma.message.findUnique({
    where: webInboundWhere({ userId, clientMessageId }),
    select: webInboundSelect,
  });
  if (existing) {
    assertSameInbound(existing, { chatId, conversationThreadId, payloadHash });
  }
  return existing;
}

/**
 * Atomically claims a browser-originated inbound message. The first payload
 * bound to a user-scoped client ID wins; retries may only reuse that exact
 * chat and canonical payload.
 */
export async function claimWebInboundMessage({
  userId,
  chatId,
  conversationThreadId,
  clientMessageId,
  payloadHash,
  parts,
  attachmentIds = [],
}: {
  userId: string;
  chatId: string;
  conversationThreadId: string;
  clientMessageId: string;
  payloadHash: string;
  parts: Prisma.InputJsonValue;
  attachmentIds?: string[];
}): Promise<{ message: WebInboundMessage; created: boolean }> {
  const where = webInboundWhere({ userId, clientMessageId });
  const uniqueAttachmentIds = [...new Set(attachmentIds)];
  const created = await prisma
    .$transaction(async (tx) => {
      const existing = await tx.message.findUnique({
        where,
        select: webInboundSelect,
      });
      if (existing) {
        assertSameInbound(existing, {
          chatId,
          conversationThreadId,
          payloadHash,
        });
        return { message: existing, created: false };
      }

      const message = await tx.message.create({
        data: {
          userId,
          chatId,
          conversationThreadId,
          channel: "WEB",
          direction: "INBOUND",
          role: "USER",
          type: "TEXT",
          clientMessageId,
          clientMessagePayloadHash: payloadHash,
          parts,
        },
        select: webInboundSelect,
      });
      if (uniqueAttachmentIds.length > 0) {
        const linked = await tx.attachment.updateMany({
          where: {
            id: { in: uniqueAttachmentIds },
            userId,
            messageId: null,
          },
          data: { messageId: message.id },
        });
        if (linked.count !== uniqueAttachmentIds.length) {
          throw new WebInboundConflictError("attachment_claim_failed");
        }
      }
      return { message, created: true };
    })
    .catch((error: unknown) => {
      if (isUniqueConstraintError(error)) return null;
      throw error;
    });
  if (created) return created;

  const winner = await prisma.message.findUnique({
    where,
    select: webInboundSelect,
  });
  if (!winner) {
    throw new Error("Unable to resolve the winning web inbound message");
  }
  assertSameInbound(winner, { chatId, conversationThreadId, payloadHash });
  return { message: winner, created: false };
}

export function textFromPersistedAssistant(
  assistant: WebInboundMessage["generatedResponse"],
) {
  if (!assistant || !Array.isArray(assistant.parts)) return "";
  return assistant.parts
    .flatMap((part) => {
      if (
        !part ||
        typeof part !== "object" ||
        Array.isArray(part) ||
        part.type !== "text" ||
        typeof part.text !== "string"
      ) {
        return [];
      }
      return [part.text];
    })
    .join("");
}

export function createWebTextStreamResponse(messageId: string, text: string) {
  const textPartId = `${messageId}-text`;
  const stream = createUIMessageStream<UIMessage>({
    execute: ({ writer }) => {
      writer.write({ type: "start", messageId });
      writer.write({ type: "start-step" });
      writer.write({ type: "text-start", id: textPartId });
      writer.write({ type: "text-delta", id: textPartId, delta: text });
      writer.write({ type: "text-end", id: textPartId });
      writer.write({ type: "finish-step" });
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
