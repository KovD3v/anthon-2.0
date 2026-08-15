import { Prisma } from "@/generated/prisma";
import { captureClientTraceStored } from "@/lib/ai/telemetry";
import { prisma } from "@/lib/db";
import {
  type ClientTraceV1,
  clientTracesEqual,
  parseClientTrace,
} from "./contracts";

export type PersistClientTraceResult =
  | { status: "stored" }
  | { status: "unchanged" }
  | { status: "pending" }
  | { status: "conflict" }
  | { status: "forbidden" }
  | { status: "not_found" };

export async function persistClientTrace(input: {
  userId: string;
  chatId: string;
  clientMessageId: string;
  trace: ClientTraceV1;
}): Promise<PersistClientTraceResult> {
  const inbound = await prisma.message.findFirst({
    where: {
      userId: input.userId,
      chatId: input.chatId,
      channel: "WEB",
      role: "USER",
      clientMessageId: input.clientMessageId,
      chat: { is: { userId: input.userId } },
    },
    select: {
      chat: { select: { userId: true, visibility: true } },
      generatedResponse: {
        select: {
          id: true,
          metrics: {
            select: {
              messageId: true,
              clientTrace: true,
              model: true,
              provider: true,
            },
          },
        },
      },
    },
  });

  if (!inbound) return { status: "not_found" };
  if (
    inbound.chat?.userId !== input.userId ||
    inbound.chat.visibility !== "PRIVATE"
  ) {
    return { status: "forbidden" };
  }

  const metrics = inbound.generatedResponse?.metrics;
  if (!inbound.generatedResponse || !metrics) return { status: "pending" };

  if (metrics.clientTrace !== null) {
    const existingTrace = parseClientTrace(metrics.clientTrace);
    return {
      status:
        existingTrace && clientTracesEqual(existingTrace, input.trace)
          ? "unchanged"
          : "conflict",
    };
  }

  const stored = await prisma.messageMetrics.updateMany({
    where: {
      messageId: metrics.messageId,
      clientTrace: { equals: Prisma.DbNull },
    },
    data: {
      clientTrace: input.trace as Prisma.InputJsonValue,
    },
  });

  if (stored.count === 1) {
    captureClientTraceStored({
      distinctId: input.userId,
      trace: input.trace,
      model: metrics.model,
      provider: metrics.provider,
    });
    return { status: "stored" };
  }

  const concurrent = await prisma.messageMetrics.findUnique({
    where: { messageId: metrics.messageId },
    select: { clientTrace: true },
  });
  const concurrentTrace = parseClientTrace(concurrent?.clientTrace);
  return {
    status:
      concurrentTrace && clientTracesEqual(concurrentTrace, input.trace)
        ? "unchanged"
        : "conflict",
  };
}
