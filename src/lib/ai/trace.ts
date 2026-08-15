import type { Prisma } from "@/generated/prisma";
import {
  decryptAiTurnTracePayload,
  encryptAiTurnTracePayload,
} from "@/lib/ai/trace-crypto";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const traceLogger = createLogger("ai");
const TRACE_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export type AiTraceCapture = {
  userId: string;
  conversationThreadId: string;
  userMessageId?: string;
  assistantMessageId?: string;
  metadata: Record<string, unknown>;
  payload: Record<string, unknown>;
};

export async function captureAiTurnTrace(capture: AiTraceCapture) {
  const expiresAt = new Date(Date.now() + TRACE_RETENTION_MS);
  try {
    const encrypted = encryptAiTurnTracePayload(capture.payload);
    return await prisma.aiTurnTrace.create({
      data: {
        userId: capture.userId,
        conversationThreadId: capture.conversationThreadId,
        ...(capture.userMessageId
          ? { userMessageId: capture.userMessageId }
          : {}),
        ...(capture.assistantMessageId
          ? { assistantMessageId: capture.assistantMessageId }
          : {}),
        status: "COMPLETE",
        metadata: capture.metadata as Prisma.InputJsonValue,
        payloadCiphertext: encrypted.ciphertext,
        payloadIv: encrypted.iv,
        payloadTag: encrypted.tag,
        keyVersion: 1,
        contentCaptureStatus: "captured",
        expiresAt,
      },
    });
  } catch (error) {
    traceLogger.error(
      "trace.capture_failed",
      "Failed capturing AI turn trace",
      {
        error,
        userId: capture.userId,
        conversationThreadId: capture.conversationThreadId,
      },
    );
    try {
      return await prisma.aiTurnTrace.create({
        data: {
          userId: capture.userId,
          conversationThreadId: capture.conversationThreadId,
          ...(capture.userMessageId
            ? { userMessageId: capture.userMessageId }
            : {}),
          ...(capture.assistantMessageId
            ? { assistantMessageId: capture.assistantMessageId }
            : {}),
          status: "FAILED",
          metadata: capture.metadata as Prisma.InputJsonValue,
          contentCaptureStatus: "failed",
          expiresAt,
        },
      });
    } catch (fallbackError) {
      traceLogger.error(
        "trace.failure_record_failed",
        "Failed recording trace capture failure",
        {
          error: fallbackError,
          userId: capture.userId,
          conversationThreadId: capture.conversationThreadId,
        },
      );
      return null;
    }
  }
}

export function decryptAiTurnTrace(payload: {
  payloadCiphertext: Uint8Array | null;
  payloadIv: Uint8Array | null;
  payloadTag: Uint8Array | null;
}): Record<string, unknown> | null {
  return decryptAiTurnTracePayload(payload);
}

export async function deleteExpiredAiTurnTraces(now = new Date()) {
  const result = await prisma.aiTurnTrace.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return result.count;
}
