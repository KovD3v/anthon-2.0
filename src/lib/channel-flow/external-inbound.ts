import { randomUUID } from "node:crypto";
import type { Prisma, SubscriptionStatus, UserRole } from "@/generated/prisma";
import { trackInboundUserMessageFunnelProgress } from "@/lib/analytics/funnel";
import { ensureConversationThread } from "@/lib/conversations/threads";
import { prisma } from "@/lib/db";
import type { RateLimitResult } from "@/lib/rate-limit";
import { checkRateLimit } from "@/lib/rate-limit";

type ExternalChannel = "TELEGRAM" | "WHATSAPP";

type ExternalChannelUser = {
  id: string;
  role: UserRole;
  isGuest: boolean;
  subscription: {
    status: SubscriptionStatus;
    planId: string | null;
  } | null;
};

export type ExternalInboundMessageType =
  | "TEXT"
  | "AUDIO"
  | "IMAGE"
  | "DOCUMENT";

/**
 * The provider adapter supplies its parsed identifiers, metadata and guest
 * creation details. This service owns the durable, provider-neutral portion
 * of accepting an inbound external message.
 */
export interface ExternalChannelInboundEnvelope {
  channel: ExternalChannel;
  externalId: string;
  externalThreadId: string;
  externalMessageId: string;
  messageType: ExternalInboundMessageType;
  metadata: Prisma.InputJsonValue;
  buildGuestUserData: () => Prisma.UserCreateWithoutIdentitiesInput;
  scheduleBackground?: (task: Promise<unknown>) => void;
  onFunnelTrackingError?: (error: unknown) => void;
}

type PreparedExternalChannelInbound =
  | { status: "duplicate"; reason: "completed" | "in_flight" }
  | {
      status: "accepted";
      claimToken: string;
      reclaimed: boolean;
      user: ExternalChannelUser;
      conversationThread: Awaited<ReturnType<typeof ensureConversationThread>>;
      inbound: { id: string };
      rateLimit: RateLimitResult;
    };

export const EXTERNAL_INBOUND_LEASE_MS = 60_000;
const EXTERNAL_INBOUND_ERROR_MAX_LENGTH = 300;

function safeExternalInboundErrorSummary(error: unknown) {
  let summary = "Unknown error";
  if (typeof error === "string") summary = error;
  else if (error instanceof Error) summary = `${error.name}: ${error.message}`;
  else {
    try {
      summary = JSON.stringify(error);
    } catch {
      summary = "Unserializable error";
    }
  }
  return Array.from(summary, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  })
    .join("")
    .slice(0, EXTERNAL_INBOUND_ERROR_MAX_LENGTH);
}

export async function markExternalChannelInboundCompleted({
  inboundId,
  claimToken,
}: {
  inboundId: string;
  claimToken: string;
}) {
  const result = await prisma.message.updateMany({
    where: {
      id: inboundId,
      externalInboundStatus: "PROCESSING",
      externalInboundClaimToken: claimToken,
    },
    data: {
      externalInboundStatus: "COMPLETED",
      externalInboundClaimToken: null,
      externalInboundLeaseExpiresAt: null,
      externalInboundCompletedAt: new Date(),
      externalInboundLastError: null,
    },
  });
  return result.count === 1;
}

export async function markExternalChannelInboundFailed({
  inboundId,
  claimToken,
  error,
}: {
  inboundId: string;
  claimToken: string;
  error: unknown;
}) {
  const result = await prisma.message.updateMany({
    where: {
      id: inboundId,
      externalInboundStatus: "PROCESSING",
      externalInboundClaimToken: claimToken,
    },
    data: {
      externalInboundStatus: "FAILED",
      externalInboundClaimToken: null,
      externalInboundLeaseExpiresAt: null,
      externalInboundLastError: safeExternalInboundErrorSummary(error),
    },
  });
  return result.count === 1;
}

function isUniqueConstraintError(error: unknown) {
  return (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Maps the shared media taxonomy to the persisted message type while keeping
 * provider parsing at the adapter boundary.
 */
export function getExternalInboundMessageType({
  hasImage,
  hasDocument,
  hasAudio,
}: {
  hasImage: boolean;
  hasDocument: boolean;
  hasAudio: boolean;
}): ExternalInboundMessageType {
  if (hasImage) return "IMAGE";
  if (hasDocument) return "DOCUMENT";
  if (hasAudio) return "AUDIO";
  return "TEXT";
}

const externalChannelIdentitySelect = {
  user: {
    select: {
      id: true,
      role: true,
      isGuest: true,
      subscription: {
        select: {
          status: true,
          planId: true,
        },
      },
    },
  },
} as const;

/**
 * Resolves the existing channel identity or atomically creates the identity
 * together with its guest user. The update branch deliberately leaves an
 * existing relation untouched: concurrent first deliveries must converge on
 * one guest, never move an identity to a later losing guest.
 */
async function resolveExternalChannelUser(
  envelope: ExternalChannelInboundEnvelope,
): Promise<ExternalChannelUser> {
  const where = {
    channel_externalId: {
      channel: envelope.channel,
      externalId: envelope.externalId,
    },
  } as const;
  const existingIdentity = await prisma.channelIdentity.findUnique({
    where,
    select: externalChannelIdentitySelect,
  });

  if (existingIdentity?.user) {
    return existingIdentity.user;
  }

  if (existingIdentity) {
    throw new Error(
      `Channel identity ${envelope.channel}:${envelope.externalId} has no user`,
    );
  }

  const identity = await prisma.channelIdentity
    .upsert({
      where,
      update: {},
      create: {
        channel: envelope.channel,
        externalId: envelope.externalId,
        user: {
          create: envelope.buildGuestUserData(),
        },
      },
      select: externalChannelIdentitySelect,
    })
    .catch(async (error: unknown) => {
      // Nested writes can make Prisma use an emulated upsert. If another
      // worker inserted the identity first, re-read its committed winner
      // rather than creating or attaching another guest user.
      if (!isUniqueConstraintError(error)) throw error;

      return await prisma.channelIdentity.findUnique({
        where,
        select: externalChannelIdentitySelect,
      });
    });

  if (!identity?.user) {
    throw new Error(
      `Unable to resolve channel identity ${envelope.channel}:${envelope.externalId}`,
    );
  }

  return identity.user;
}

/**
 * Claims a provider message, resolves its channel-local user/thread scope,
 * persists the inbound marker, and evaluates its rate limit. A duplicate
 * result is safe to return from a retried webhook without invoking AI or
 * downstream provider transport.
 */
export async function prepareExternalChannelInbound(
  envelope: ExternalChannelInboundEnvelope,
): Promise<PreparedExternalChannelInbound> {
  const now = new Date();
  const claimToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + EXTERNAL_INBOUND_LEASE_MS);
  const existing = await prisma.message.findFirst({
    where: {
      channel: envelope.channel,
      externalMessageId: envelope.externalMessageId,
    },
    select: {
      id: true,
      externalInboundStatus: true,
      externalInboundLeaseExpiresAt: true,
      user: { select: externalChannelIdentitySelect.user.select },
      conversationThread: true,
    },
  });

  if (existing) {
    if (existing.externalInboundStatus === "COMPLETED") {
      return { status: "duplicate", reason: "completed" };
    }

    const reclaimed = await prisma.message.updateMany({
      where: {
        id: existing.id,
        OR: [
          { externalInboundStatus: "PENDING" },
          { externalInboundStatus: "FAILED" },
          {
            externalInboundStatus: "PROCESSING",
            externalInboundLeaseExpiresAt: { lte: now },
          },
        ],
      },
      data: {
        externalInboundStatus: "PROCESSING",
        externalInboundClaimToken: claimToken,
        externalInboundLeaseExpiresAt: leaseExpiresAt,
        externalInboundAttempts: { increment: 1 },
        externalInboundLastError: null,
      },
    });

    if (reclaimed.count !== 1) {
      return { status: "duplicate", reason: "in_flight" };
    }
    if (!existing.conversationThread) {
      await markExternalChannelInboundFailed({
        inboundId: existing.id,
        claimToken,
        error: "Inbound message has no conversation thread",
      });
      throw new Error("Inbound message has no conversation thread");
    }

    let rateLimit: RateLimitResult;
    try {
      rateLimit = await checkRateLimit(
        existing.user.id,
        existing.user.subscription?.status,
        existing.user.role,
        existing.user.subscription?.planId,
        existing.user.isGuest,
      );
    } catch (error) {
      await markExternalChannelInboundFailed({
        inboundId: existing.id,
        claimToken,
        error,
      });
      throw error;
    }

    return {
      status: "accepted",
      claimToken,
      reclaimed: true,
      user: existing.user,
      conversationThread: existing.conversationThread,
      inbound: { id: existing.id },
      rateLimit,
    };
  }

  const user = await resolveExternalChannelUser(envelope);
  const conversationThread = await ensureConversationThread({
    userId: user.id,
    channel: envelope.channel,
    externalThreadId: envelope.externalThreadId,
  });

  const inbound = await prisma.message
    .create({
      data: {
        userId: user.id,
        conversationThreadId: conversationThread.id,
        channel: envelope.channel,
        direction: "INBOUND",
        role: "USER",
        type: envelope.messageType,
        externalMessageId: envelope.externalMessageId,
        metadata: envelope.metadata,
        externalInboundStatus: "PROCESSING",
        externalInboundClaimToken: claimToken,
        externalInboundLeaseExpiresAt: leaseExpiresAt,
        externalInboundAttempts: 1,
      },
      select: { id: true },
    })
    .catch((error: unknown) => {
      // The pre-check short-circuits normal retries. This catches two workers
      // that both passed it before the unique database constraint resolved.
      if (isUniqueConstraintError(error)) return null;
      throw error;
    });

  if (!inbound) {
    return await prepareExternalChannelInbound(envelope);
  }

  let rateLimit: RateLimitResult;
  try {
    rateLimit = await checkRateLimit(
      user.id,
      user.subscription?.status,
      user.role,
      user.subscription?.planId,
      user.isGuest,
    );
  } catch (error) {
    await markExternalChannelInboundFailed({
      inboundId: inbound.id,
      claimToken,
      error,
    });
    throw error;
  }

  if (rateLimit.allowed) {
    const funnelTask = trackInboundUserMessageFunnelProgress({
      userId: user.id,
      isGuest: user.isGuest,
      userRole: user.role,
      channel: envelope.channel,
      planId: user.subscription?.planId,
      subscriptionStatus: user.subscription?.status,
    }).catch((error) => {
      envelope.onFunnelTrackingError?.(error);
    });

    if (envelope.scheduleBackground) {
      envelope.scheduleBackground(funnelTask);
    } else {
      void funnelTask;
    }
  }

  return {
    status: "accepted",
    claimToken,
    reclaimed: false,
    user,
    conversationThread,
    inbound,
    rateLimit,
  };
}
