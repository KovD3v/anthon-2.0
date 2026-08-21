import { randomUUID } from "node:crypto";
import { type BetaAbuseAction, Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { getBetaClientFingerprint } from "./client-fingerprint";

const RETENTION_DAYS = 7;

const POLICIES: Record<
  BetaAbuseAction,
  { limit: number; windowMilliseconds: number }
> = {
  UNLOCK: { limit: 10, windowMilliseconds: 15 * 60 * 1000 },
  MAILING_SUBSCRIPTION: { limit: 5, windowMilliseconds: 60 * 60 * 1000 },
};

export class BetaAbuseDeniedError extends Error {
  readonly status = 429;

  constructor(readonly reason: "identity_unavailable" | "limit_reached") {
    super("Beta access request limit reached");
    this.name = "BetaAbuseDeniedError";
  }
}

export type BetaAbuseReservation = {
  fingerprintHash: string;
  action: BetaAbuseAction;
  windowStart: Date;
};

function getWindowStart(now: Date, windowMilliseconds: number): Date {
  return new Date(
    Math.floor(now.getTime() / windowMilliseconds) * windowMilliseconds,
  );
}

export async function reserveBetaAction(
  request: Request,
  action: BetaAbuseAction,
  now = new Date(),
): Promise<BetaAbuseReservation> {
  const fingerprintHash = getBetaClientFingerprint(request, action);
  if (!fingerprintHash) {
    throw new BetaAbuseDeniedError("identity_unavailable");
  }

  const policy = POLICIES[action];
  const windowStart = getWindowStart(now, policy.windowMilliseconds);
  const retentionCutoff = new Date(
    now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  const rows = await prisma.$transaction(async (tx) => {
    await tx.betaAbuseBucket.deleteMany({
      where: { windowStart: { lt: retentionCutoff } },
    });
    return tx.$queryRaw<Array<{ attemptCount: number }>>(Prisma.sql`
      INSERT INTO "BetaAbuseBucket" (
        "id",
        "fingerprintHash",
        "action",
        "windowStart",
        "attemptCount",
        "updatedAt"
      )
      VALUES (
        ${randomUUID()},
        ${fingerprintHash},
        CAST(${action} AS "BetaAbuseAction"),
        ${windowStart},
        1,
        ${now}
      )
      ON CONFLICT ("fingerprintHash", "action", "windowStart")
      DO UPDATE SET
        "attemptCount" = "BetaAbuseBucket"."attemptCount" + 1,
        "updatedAt" = ${now}
      WHERE "BetaAbuseBucket"."attemptCount" < ${policy.limit}
      RETURNING "attemptCount"
    `);
  });

  if (rows.length !== 1) {
    throw new BetaAbuseDeniedError("limit_reached");
  }

  return { fingerprintHash, action, windowStart };
}

export async function releaseBetaAction(reservation: BetaAbuseReservation) {
  await prisma.$transaction(async (tx) => {
    const bucket = await tx.betaAbuseBucket.findUnique({
      where: {
        fingerprintHash_action_windowStart: reservation,
      },
      select: { id: true, attemptCount: true },
    });
    if (!bucket) return;

    if (bucket.attemptCount <= 1) {
      await tx.betaAbuseBucket.delete({ where: { id: bucket.id } });
      return;
    }
    await tx.betaAbuseBucket.update({
      where: { id: bucket.id },
      data: { attemptCount: { decrement: 1 } },
    });
  });
}
