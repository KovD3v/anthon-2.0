import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";

const DEFAULT_GUEST_CREATIONS_PER_DAY = 3;
const ABUSE_BUCKET_RETENTION_DAYS = 30;
const HMAC_DOMAIN = "anthon:guest-creation-abuse:v1";

export class GuestCreationDeniedError extends Error {
  readonly status = 429;

  constructor(
    readonly reason: "identity_unavailable" | "daily_limit_reached",
  ) {
    super(
      reason === "daily_limit_reached"
        ? "Guest creation limit reached"
        : "Guest creation is temporarily unavailable",
    );
    this.name = "GuestCreationDeniedError";
  }
}

function parseForwardedAddress(
  value: string | null,
  options: { allowList?: boolean } = {},
): string | null {
  if (!value) return null;
  if (!options.allowList && value.includes(",")) return null;
  const first = (options.allowList ? value.split(",", 1)[0] : value)?.trim();
  if (!first) return null;

  let candidate = first;
  if (candidate.startsWith("[") && candidate.includes("]")) {
    candidate = candidate.slice(1, candidate.indexOf("]"));
  } else if (candidate.includes(":") && isIP(candidate) === 0) {
    const ipv4WithPort = candidate.match(/^([^:]+):\d+$/);
    if (ipv4WithPort?.[1]) candidate = ipv4WithPort[1];
  }
  if (candidate.toLowerCase().startsWith("::ffff:")) {
    const mapped = candidate.slice(7);
    if (isIP(mapped) === 4) candidate = mapped;
  }
  return isIP(candidate) > 0 ? candidate.toLowerCase() : null;
}

function trustedClientAddress(request: Request): string | null {
  if (process.env.VERCEL === "1") {
    // Vercel overwrites this header with the public client address. Requiring
    // exactly one valid address avoids accidentally trusting a forwarded list.
    return parseForwardedAddress(request.headers.get("x-forwarded-for"));
  }

  if (process.env.TRUST_PROXY_HEADERS === "true") {
    return (
      parseForwardedAddress(request.headers.get("x-forwarded-for"), {
        allowList: true,
      }) ??
      parseForwardedAddress(request.headers.get("x-real-ip"))
    );
  }

  if (process.env.NODE_ENV === "test") {
    return (
      parseForwardedAddress(request.headers.get("x-forwarded-for"), {
        allowList: true,
      }) ??
      parseForwardedAddress(request.headers.get("x-real-ip"))
    );
  }

  if (process.env.NODE_ENV === "development") {
    return "local-development";
  }

  return null;
}

function guestAbuseSecret(): string | null {
  const override = process.env.GUEST_ABUSE_HMAC_SECRET?.trim();
  if (override) return override;
  const clerkSecret = process.env.CLERK_SECRET_KEY?.trim();
  return clerkSecret || null;
}

function guestCreationLimit(): number {
  const configured = Number(process.env.GUEST_CREATIONS_PER_IP_PER_DAY);
  if (
    Number.isSafeInteger(configured) &&
    configured >= 1 &&
    configured <= 100
  ) {
    return configured;
  }
  return DEFAULT_GUEST_CREATIONS_PER_DAY;
}

function getUTCDateOnly(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function fingerprintForRequest(request: Request): string | null {
  const address = trustedClientAddress(request);
  const secret = guestAbuseSecret();
  if (!address || !secret) return null;

  return createHmac("sha256", secret)
    .update(HMAC_DOMAIN)
    .update("\0")
    .update(address)
    .digest("hex");
}

export interface GuestCreationReservation {
  fingerprintHash: string;
  windowStart: Date;
}

/**
 * Reserves a guest creation before any user row is created. The database sees
 * only a domain-separated keyed digest, never the source address.
 */
export async function reserveGuestCreation(
  request: Request,
): Promise<GuestCreationReservation> {
  const fingerprintHash = fingerprintForRequest(request);
  if (!fingerprintHash) {
    throw new GuestCreationDeniedError("identity_unavailable");
  }

  const now = new Date();
  const windowStart = getUTCDateOnly(now);
  const limit = guestCreationLimit();
  const retentionCutoff = new Date(
    windowStart.getTime() - ABUSE_BUCKET_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  const reserved = await prisma.$transaction(async (tx) => {
    await tx.guestAbuseBucket.deleteMany({
      where: { windowStart: { lt: retentionCutoff } },
    });
    return tx.$queryRaw<Array<{ createdSessions: number }>>(Prisma.sql`
      INSERT INTO "GuestAbuseBucket" (
        "id",
        "fingerprintHash",
        "windowStart",
        "createdSessions",
        "updatedAt"
      )
      VALUES (
        ${randomUUID()},
        ${fingerprintHash},
        ${windowStart},
        1,
        ${now}
      )
      ON CONFLICT ("fingerprintHash", "windowStart")
      DO UPDATE SET
        "createdSessions" = "GuestAbuseBucket"."createdSessions" + 1,
        "updatedAt" = ${now}
      WHERE "GuestAbuseBucket"."createdSessions" < ${limit}
      RETURNING "createdSessions"
    `);
  });

  if (reserved.length !== 1) {
    throw new GuestCreationDeniedError("daily_limit_reached");
  }
  return { fingerprintHash, windowStart };
}

export async function releaseGuestCreation(
  reservation: GuestCreationReservation,
) {
  await prisma.$transaction(async (tx) => {
    const bucket = await tx.guestAbuseBucket.findUnique({
      where: {
        fingerprintHash_windowStart: {
          fingerprintHash: reservation.fingerprintHash,
          windowStart: reservation.windowStart,
        },
      },
      select: { id: true, createdSessions: true },
    });
    if (!bucket) return;

    if (bucket.createdSessions <= 1) {
      await tx.guestAbuseBucket.delete({ where: { id: bucket.id } });
      return;
    }
    await tx.guestAbuseBucket.update({
      where: { id: bucket.id },
      data: { createdSessions: { decrement: 1 } },
    });
  });
}
