import { prisma } from "@/lib/db";
import type { UploadLimits } from "@/lib/organizations/types";

const UPLOAD_RESERVATION_LEASE_MS = 5 * 60 * 1000;
const TERMINAL_RESERVATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type TransactionClient = Pick<
  typeof prisma,
  "$queryRaw" | "$executeRaw" | "uploadReservation" | "dailyUploadUsage"
>;

export type UploadQuotaResult =
  | {
      allowed: true;
      reservationId: string;
      usage: {
        uploadCount: number;
        uploadedBytes: number;
        reservedCount: number;
        reservedBytes: number;
      };
      limits: UploadLimits;
    }
  | {
      allowed: false;
      reason: "Daily upload count reached" | "Daily upload bytes reached";
      usage: {
        uploadCount: number;
        uploadedBytes: number;
        reservedCount: number;
        reservedBytes: number;
      };
      limits: UploadLimits;
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
    throw new Error("Cannot reserve upload quota for an unknown user");
  }
}

async function cleanupUploadReservations(
  tx: TransactionClient,
  userId: string,
  now: Date,
) {
  const expired = await tx.uploadReservation.findMany({
    where: { userId, status: "RESERVED", expiresAt: { lte: now } },
    select: { id: true, date: true, byteCount: true },
  });

  for (const reservation of expired) {
    const transitioned = await tx.uploadReservation.updateMany({
      where: { id: reservation.id, status: "RESERVED" },
      data: { status: "EXPIRED", releasedAt: now },
    });
    if (transitioned.count !== 1) continue;

    await tx.$executeRaw`
      UPDATE "DailyUploadUsage"
      SET
        "reservedCount" = GREATEST(0, "reservedCount" - 1),
        "reservedBytes" = GREATEST(0, "reservedBytes" - ${reservation.byteCount}),
        "updatedAt" = ${now}
      WHERE "userId" = ${userId} AND "date" = ${reservation.date}
    `;
  }

  await tx.uploadReservation.deleteMany({
    where: {
      userId,
      status: { in: ["COMMITTED", "RELEASED", "EXPIRED"] },
      updatedAt: {
        lt: new Date(now.getTime() - TERMINAL_RESERVATION_RETENTION_MS),
      },
    },
  });
}

function numericUsage(usage: {
  uploadCount: number;
  uploadedBytes: bigint;
  reservedCount: number;
  reservedBytes: bigint;
}) {
  return {
    uploadCount: usage.uploadCount,
    uploadedBytes: Number(usage.uploadedBytes),
    reservedCount: usage.reservedCount,
    reservedBytes: Number(usage.reservedBytes),
  };
}

export async function reserveUploadQuota({
  userId,
  byteCount,
  limits,
}: {
  userId: string;
  byteCount: number;
  limits: UploadLimits;
}): Promise<UploadQuotaResult> {
  if (!Number.isSafeInteger(byteCount) || byteCount < 1) {
    throw new Error("Upload size must be a positive safe integer");
  }

  const now = new Date();
  const today = getUTCDateOnly(now);
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    await cleanupUploadReservations(tx, userId, now);

    const usage = (await tx.dailyUploadUsage.findUnique({
      where: { userId_date: { userId, date: today } },
    })) ?? {
      uploadCount: 0,
      uploadedBytes: BigInt(0),
      reservedCount: 0,
      reservedBytes: BigInt(0),
    };
    const responseUsage = numericUsage(usage);
    if (usage.uploadCount + usage.reservedCount + 1 > limits.maxUploadsPerDay) {
      return {
        allowed: false,
        reason: "Daily upload count reached",
        usage: responseUsage,
        limits,
      };
    }

    const nextBytes =
      usage.uploadedBytes + usage.reservedBytes + BigInt(byteCount);
    if (
      Number.isFinite(limits.maxUploadBytesPerDay) &&
      nextBytes > BigInt(limits.maxUploadBytesPerDay)
    ) {
      return {
        allowed: false,
        reason: "Daily upload bytes reached",
        usage: responseUsage,
        limits,
      };
    }

    const reservation = await tx.uploadReservation.create({
      data: {
        userId,
        date: today,
        byteCount: BigInt(byteCount),
        expiresAt: new Date(now.getTime() + UPLOAD_RESERVATION_LEASE_MS),
      },
    });
    const updatedUsage = await tx.dailyUploadUsage.upsert({
      where: { userId_date: { userId, date: today } },
      create: {
        userId,
        date: today,
        reservedCount: 1,
        reservedBytes: BigInt(byteCount),
      },
      update: {
        reservedCount: { increment: 1 },
        reservedBytes: { increment: BigInt(byteCount) },
      },
    });
    return {
      allowed: true,
      reservationId: reservation.id,
      usage: numericUsage(updatedUsage),
      limits,
    };
  });
}

export async function commitUploadReservationInTransaction(
  tx: TransactionClient,
  { reservationId, userId }: { reservationId: string; userId: string },
) {
  const now = new Date();
  await lockUser(tx, userId);
  await cleanupUploadReservations(tx, userId, now);
  const reservation = await tx.uploadReservation.findUnique({
    where: { id: reservationId },
  });
  if (!reservation || reservation.userId !== userId) {
    throw new Error("Upload reservation not found");
  }
  if (reservation.status === "COMMITTED") return { committed: false };
  if (reservation.status !== "RESERVED") {
    throw new Error(
      `Upload reservation is ${reservation.status.toLowerCase()}`,
    );
  }

  await tx.dailyUploadUsage.update({
    where: {
      userId_date: { userId, date: reservation.date },
    },
    data: {
      uploadCount: { increment: 1 },
      uploadedBytes: { increment: reservation.byteCount },
      reservedCount: { decrement: 1 },
      reservedBytes: { decrement: reservation.byteCount },
    },
  });
  await tx.uploadReservation.update({
    where: { id: reservationId },
    data: { status: "COMMITTED", committedAt: now },
  });
  return { committed: true };
}

export async function releaseUploadReservation({
  reservationId,
  userId,
}: {
  reservationId: string;
  userId: string;
}) {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const reservation = await tx.uploadReservation.findUnique({
      where: { id: reservationId },
    });
    if (
      !reservation ||
      reservation.userId !== userId ||
      reservation.status !== "RESERVED"
    ) {
      return false;
    }

    await tx.uploadReservation.update({
      where: { id: reservationId },
      data: { status: "RELEASED", releasedAt: new Date() },
    });
    await tx.dailyUploadUsage.update({
      where: {
        userId_date: { userId, date: reservation.date },
      },
      data: {
        reservedCount: { decrement: 1 },
        reservedBytes: { decrement: reservation.byteCount },
      },
    });
    return true;
  });
}
