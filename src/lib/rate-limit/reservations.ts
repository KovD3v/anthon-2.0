import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma";
import { normalizePreDeliveryCapabilityUsage } from "@/lib/ai/capability-usage";
import type { AIMetrics } from "@/lib/ai/cost-calculator";
import { prisma } from "@/lib/db";
import type { RateLimits } from "./types";

const AI_RESERVATION_LEASE_MS = 10 * 60 * 1000;
const TERMINAL_RESERVATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const RECOVERY_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_RECOVERY_METRICS_BYTES = 512 * 1024;
const MAX_RECOVERY_TEXT_CHARS = 128 * 1024;

type TransactionClient = Pick<
  typeof prisma,
  "$queryRaw" | "aiUsageReservation" | "dailyUsage"
>;

export interface AiUsageRecovery {
  text: string;
  metrics: AIMetrics;
}

export interface AiUsagePersistedAssistant extends AiUsageRecovery {
  messageId: string;
}

export type AiUsageReservationResult =
  | {
      allowed: true;
      reservationId: string;
      claimToken: string;
      recovery?: AiUsageRecovery;
      persistedAssistant?: AiUsagePersistedAssistant;
    }
  | {
      allowed: false;
      reason:
        | "Daily request limit reached"
        | "Daily input token limit reached"
        | "Daily output token limit reached"
        | "Daily spending limit reached"
        | "Generation already in progress"
        | "Generation already accounted for";
      retryable: boolean;
    };

function getUTCDateOnly(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

async function lockUser(tx: TransactionClient, userId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "User"
    WHERE "id" = ${userId}
    FOR UPDATE
  `;
  if (rows.length !== 1) {
    throw new Error("Cannot reserve usage for an unknown user");
  }
}

async function cleanupAiReservations(
  tx: TransactionClient,
  userId: string,
  now: Date,
) {
  await tx.aiUsageReservation.updateMany({
    where: {
      userId,
      status: "RESERVED",
      expiresAt: { lte: now },
    },
    data: {
      status: "EXPIRED",
      releasedAt: now,
    },
  });

  await tx.aiUsageReservation.updateMany({
    where: {
      userId,
      status: "RECONCILED",
      recoveryExpiresAt: { lte: now },
    },
    data: {
      recoveryText: null,
      recoveryMetrics: Prisma.DbNull,
      recoveryExpiresAt: null,
    },
  });

  await tx.aiUsageReservation.deleteMany({
    where: {
      userId,
      status: { in: ["RECONCILED", "RELEASED", "EXPIRED"] },
      recoveryText: null,
      updatedAt: {
        lt: new Date(now.getTime() - TERMINAL_RESERVATION_RETENTION_MS),
      },
    },
  });
}

function finiteRemaining(limit: number, used: number): number {
  return Number.isFinite(limit) ? Math.max(0, Math.floor(limit - used)) : 0;
}

function finiteRemainingCost(limit: number, used: number): number {
  return Number.isFinite(limit) ? Math.max(0, limit - used) : 0;
}

function getLimitReason(
  usage: {
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
  },
  limits: RateLimits,
): (AiUsageReservationResult & { allowed: false }) | null {
  if (usage.requestCount >= limits.maxRequestsPerDay) {
    return {
      allowed: false,
      reason: "Daily request limit reached",
      retryable: false,
    };
  }
  if (usage.inputTokens >= limits.maxInputTokensPerDay) {
    return {
      allowed: false,
      reason: "Daily input token limit reached",
      retryable: false,
    };
  }
  if (usage.outputTokens >= limits.maxOutputTokensPerDay) {
    return {
      allowed: false,
      reason: "Daily output token limit reached",
      retryable: false,
    };
  }
  if (usage.totalCostUsd >= limits.maxCostPerDay) {
    return {
      allowed: false,
      reason: "Daily spending limit reached",
      retryable: false,
    };
  }
  return null;
}

function parseRecovery(
  text: string | null,
  metrics: Prisma.JsonValue | null,
): AiUsageRecovery | undefined {
  if (
    !text ||
    !metrics ||
    typeof metrics !== "object" ||
    Array.isArray(metrics)
  ) {
    return undefined;
  }
  const {
    providerMetadata: _providerMetadata,
    reasoningContent: _reasoningContent,
    ...safeMetrics
  } = metrics as Record<string, unknown>;
  return {
    text,
    metrics: {
      ...safeMetrics,
      capabilitiesUsed: normalizePreDeliveryCapabilityUsage(
        safeMetrics.capabilitiesUsed,
      ),
    } as unknown as AIMetrics,
  };
}

function textFromMessageParts(parts: Prisma.JsonValue | null): string {
  if (!Array.isArray(parts)) return "";
  return parts
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

/**
 * Reserve one user-facing generation. Token and cost capacity reserve the
 * entire remaining daily budget, intentionally serializing finite-plan turns
 * so concurrent requests cannot both spend the same allowance.
 */
export async function reserveAiUsage({
  userId,
  requestKey,
  limits,
}: {
  userId: string;
  requestKey: string;
  limits: RateLimits;
}): Promise<AiUsageReservationResult> {
  const now = new Date();
  const today = getUTCDateOnly(now);

  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    await cleanupAiReservations(tx, userId, now);

    const existing = await tx.aiUsageReservation.findUnique({
      where: { userId_requestKey: { userId, requestKey } },
      include: {
        assistantMessage: {
          include: { metrics: true },
        },
      },
    });
    if (existing?.status === "RESERVED") {
      return {
        allowed: false,
        reason: "Generation already in progress",
        retryable: true,
      };
    }
    if (existing?.status === "RECONCILED") {
      const recovery = parseRecovery(
        existing.recoveryText,
        existing.recoveryMetrics,
      );
      if (recovery) {
        return {
          allowed: true,
          reservationId: existing.id,
          claimToken: existing.claimToken,
          recovery,
        };
      }
      if (existing.assistantMessage) {
        const assistant = existing.assistantMessage;
        const messageMetrics = assistant.metrics;
        return {
          allowed: true,
          reservationId: existing.id,
          claimToken: existing.claimToken,
          persistedAssistant: {
            messageId: assistant.id,
            text: textFromMessageParts(assistant.parts),
            metrics: {
              model: assistant.model ?? messageMetrics?.model ?? "persisted",
              provider: messageMetrics?.provider,
              inputTokens:
                assistant.inputTokens ?? messageMetrics?.inputTokens ?? 0,
              outputTokens:
                assistant.outputTokens ?? messageMetrics?.outputTokens ?? 0,
              reasoningTokens:
                assistant.reasoningTokens ??
                messageMetrics?.reasoningTokens ??
                null,
              toolCalls: assistant.toolCalls as AIMetrics["toolCalls"] | null,
              toolCallCount: messageMetrics?.toolCallCount ?? undefined,
              toolResultChars: messageMetrics?.toolResultChars ?? undefined,
              toolTiming: messageMetrics?.toolTiming as
                | AIMetrics["toolTiming"]
                | undefined,
              ragUsed: assistant.ragUsed ?? messageMetrics?.ragUsed ?? false,
              ragChunksCount:
                assistant.ragChunksCount ?? messageMetrics?.ragChunksCount ?? 0,
              costUsd: assistant.costUsd ?? messageMetrics?.costUsd ?? 0,
              generationTimeMs:
                assistant.generationTimeMs ??
                messageMetrics?.generationTimeMs ??
                0,
              reasoningTimeMs:
                assistant.reasoningTimeMs ??
                messageMetrics?.reasoningTimeMs ??
                null,
            },
          },
        };
      }
      return {
        allowed: false,
        reason: "Generation already accounted for",
        retryable: false,
      };
    }

    const usage = (await tx.dailyUsage.findUnique({
      where: { userId_date: { userId, date: today } },
    })) ?? {
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalCostUsd: 0,
    };
    const activeReservations = await tx.aiUsageReservation.aggregate({
      where: { userId, date: today, status: "RESERVED" },
      _sum: {
        reservedRequests: true,
        reservedInputTokens: true,
        reservedOutputTokens: true,
        reservedCostUsd: true,
      },
      _count: { _all: true },
    });
    const effectiveUsage = {
      requestCount:
        usage.requestCount + (activeReservations._sum.reservedRequests ?? 0),
      inputTokens:
        usage.inputTokens + (activeReservations._sum.reservedInputTokens ?? 0),
      outputTokens:
        usage.outputTokens +
        (activeReservations._sum.reservedOutputTokens ?? 0),
      totalCostUsd:
        usage.totalCostUsd + (activeReservations._sum.reservedCostUsd ?? 0),
    };
    const hasFiniteBudget =
      Number.isFinite(limits.maxRequestsPerDay) ||
      Number.isFinite(limits.maxInputTokensPerDay) ||
      Number.isFinite(limits.maxOutputTokensPerDay) ||
      Number.isFinite(limits.maxCostPerDay);
    if ((activeReservations._count._all ?? 0) > 0 && hasFiniteBudget) {
      return {
        allowed: false,
        reason: "Generation already in progress",
        retryable: true,
      };
    }

    const denied = getLimitReason(effectiveUsage, limits);
    if (denied) return denied;

    const reservationData = {
      date: today,
      claimToken: randomUUID(),
      status: "RESERVED" as const,
      reservedRequests: 1,
      reservedInputTokens: finiteRemaining(
        limits.maxInputTokensPerDay,
        effectiveUsage.inputTokens,
      ),
      reservedOutputTokens: finiteRemaining(
        limits.maxOutputTokensPerDay,
        effectiveUsage.outputTokens,
      ),
      reservedCostUsd: finiteRemainingCost(
        limits.maxCostPerDay,
        effectiveUsage.totalCostUsd,
      ),
      expiresAt: new Date(now.getTime() + AI_RESERVATION_LEASE_MS),
      actualInputTokens: null,
      actualOutputTokens: null,
      actualReasoningTokens: null,
      actualCostUsd: null,
      recoveryText: null,
      recoveryMetrics: Prisma.DbNull,
      recoveryExpiresAt: null,
      assistantMessageId: null,
      reconciledAt: null,
      releasedAt: null,
    };
    const reservation = existing
      ? await tx.aiUsageReservation.update({
          where: { id: existing.id },
          data: reservationData,
        })
      : await tx.aiUsageReservation.create({
          data: {
            userId,
            requestKey,
            ...reservationData,
          },
        });

    return {
      allowed: true,
      reservationId: reservation.id,
      claimToken: reservation.claimToken,
    };
  });
}

function buildUsageUpdate(metrics: AIMetrics) {
  return {
    requestCount: { increment: 1 },
    inputTokens: { increment: metrics.inputTokens },
    outputTokens: { increment: metrics.outputTokens },
    reasoningTokens: { increment: metrics.reasoningTokens ?? 0 },
    totalCostUsd: { increment: metrics.costUsd },
  };
}

function buildUsageCreate(userId: string, date: Date, metrics: AIMetrics) {
  return {
    userId,
    date,
    requestCount: 1,
    inputTokens: metrics.inputTokens,
    outputTokens: metrics.outputTokens,
    reasoningTokens: metrics.reasoningTokens ?? 0,
    totalCostUsd: metrics.costUsd,
  };
}

export async function reconcileAiUsageInTransaction(
  tx: TransactionClient,
  {
    reservationId,
    claimToken,
    userId,
    metrics,
    assistantMessageId,
    allowAlreadyReconciled = false,
  }: {
    reservationId: string;
    claimToken: string;
    userId: string;
    metrics: AIMetrics;
    assistantMessageId?: string;
    allowAlreadyReconciled?: boolean;
  },
) {
  await lockUser(tx, userId);
  const reservation = await tx.aiUsageReservation.findUnique({
    where: { id: reservationId },
  });
  if (
    !reservation ||
    reservation.userId !== userId ||
    reservation.claimToken !== claimToken
  ) {
    throw new Error("Usage reservation not found");
  }

  if (reservation.status === "RECONCILED" && allowAlreadyReconciled) {
    if (assistantMessageId) {
      await tx.aiUsageReservation.update({
        where: { id: reservationId },
        data: {
          assistantMessageId,
          recoveryText: null,
          recoveryMetrics: Prisma.DbNull,
          recoveryExpiresAt: null,
        },
      });
    }
    return { charged: false };
  }
  if (reservation.status !== "RESERVED") {
    throw new Error(`Usage reservation is ${reservation.status.toLowerCase()}`);
  }

  await tx.dailyUsage.upsert({
    where: {
      userId_date: { userId, date: reservation.date },
    },
    create: buildUsageCreate(userId, reservation.date, metrics),
    update: buildUsageUpdate(metrics),
  });
  await tx.aiUsageReservation.update({
    where: { id: reservationId },
    data: {
      status: "RECONCILED",
      actualInputTokens: metrics.inputTokens,
      actualOutputTokens: metrics.outputTokens,
      actualReasoningTokens: metrics.reasoningTokens ?? 0,
      actualCostUsd: metrics.costUsd,
      ...(assistantMessageId ? { assistantMessageId } : {}),
      recoveryText: null,
      recoveryMetrics: Prisma.DbNull,
      recoveryExpiresAt: null,
      reconciledAt: new Date(),
    },
  });
  return { charged: true };
}

function recoverableMetrics(metrics: AIMetrics): Prisma.InputJsonValue {
  const minimal = {
    model: metrics.model,
    provider: metrics.provider,
    inputTokens: metrics.inputTokens,
    outputTokens: metrics.outputTokens,
    reasoningTokens: metrics.reasoningTokens,
    toolCalls: null,
    toolCallCount: metrics.toolCallCount,
    toolResultChars: metrics.toolResultChars,
    ragAttempted: metrics.ragAttempted,
    ragUsed: metrics.ragUsed,
    ragChunksCount: metrics.ragChunksCount,
    capabilitiesUsed: normalizePreDeliveryCapabilityUsage(
      metrics.capabilitiesUsed,
    ),
    costUsd: metrics.costUsd,
    generationTimeMs: metrics.generationTimeMs,
    reasoningTimeMs: metrics.reasoningTimeMs,
  };
  const serialized = JSON.stringify(minimal);
  if (Buffer.byteLength(serialized, "utf8") > MAX_RECOVERY_METRICS_BYTES) {
    throw new Error("Recovery metrics exceed the persistence limit");
  }
  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

/** Charge provider work exactly once and retain enough data for a retry to
 * persist the generated answer without invoking the provider again. */
export async function reconcileAiUsageForRecovery({
  reservationId,
  claimToken,
  userId,
  text,
  metrics,
}: {
  reservationId: string;
  claimToken: string;
  userId: string;
  text: string;
  metrics: AIMetrics;
}) {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const reservation = await tx.aiUsageReservation.findUnique({
      where: { id: reservationId },
    });
    if (
      !reservation ||
      reservation.userId !== userId ||
      reservation.claimToken !== claimToken
    ) {
      throw new Error("Usage reservation not found");
    }
    if (reservation.status === "RECONCILED") {
      return { charged: false };
    }
    if (reservation.status !== "RESERVED") {
      throw new Error(
        `Usage reservation is ${reservation.status.toLowerCase()}`,
      );
    }

    await tx.dailyUsage.upsert({
      where: {
        userId_date: { userId, date: reservation.date },
      },
      create: buildUsageCreate(userId, reservation.date, metrics),
      update: buildUsageUpdate(metrics),
    });
    await tx.aiUsageReservation.update({
      where: { id: reservationId },
      data: {
        status: "RECONCILED",
        actualInputTokens: metrics.inputTokens,
        actualOutputTokens: metrics.outputTokens,
        actualReasoningTokens: metrics.reasoningTokens ?? 0,
        actualCostUsd: metrics.costUsd,
        recoveryText: text.slice(0, MAX_RECOVERY_TEXT_CHARS),
        recoveryMetrics: recoverableMetrics(metrics),
        recoveryExpiresAt: new Date(Date.now() + RECOVERY_RETENTION_MS),
        reconciledAt: new Date(),
      },
    });
    return { charged: true };
  });
}

export async function releaseAiUsageReservation({
  reservationId,
  claimToken,
  userId,
}: {
  reservationId: string;
  claimToken: string;
  userId: string;
}) {
  const result = await prisma.aiUsageReservation.updateMany({
    where: {
      id: reservationId,
      userId,
      claimToken,
      status: "RESERVED",
    },
    data: { status: "RELEASED", releasedAt: new Date() },
  });
  return result.count === 1;
}
