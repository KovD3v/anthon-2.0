import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";

const TERMINAL_RESERVATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface AiUsageReservationRetentionResult {
  expired: number;
  recoveryCleared: number;
  deleted: number;
}

export async function cleanupExpiredAiUsageReservations(
  now = new Date(),
): Promise<AiUsageReservationRetentionResult> {
  const expired = await prisma.aiUsageReservation.updateMany({
    where: {
      status: "RESERVED",
      expiresAt: { lte: now },
    },
    data: {
      status: "EXPIRED",
      releasedAt: now,
    },
  });

  const recoveryCleared = await prisma.aiUsageReservation.updateMany({
    where: {
      status: "RECONCILED",
      recoveryExpiresAt: { lte: now },
    },
    data: {
      recoveryText: null,
      recoveryMetrics: Prisma.DbNull,
      recoveryExpiresAt: null,
    },
  });

  const deleted = await prisma.aiUsageReservation.deleteMany({
    where: {
      status: { in: ["RECONCILED", "RELEASED", "EXPIRED"] },
      recoveryText: null,
      updatedAt: {
        lt: new Date(now.getTime() - TERMINAL_RESERVATION_RETENTION_MS),
      },
    },
  });

  return {
    expired: expired.count,
    recoveryCleared: recoveryCleared.count,
    deleted: deleted.count,
  };
}
