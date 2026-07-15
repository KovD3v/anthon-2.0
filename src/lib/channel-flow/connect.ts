import { randomUUID } from "node:crypto";
import type { Channel, ChannelConnectResponseKind } from "@/generated/prisma";
import { prisma } from "@/lib/db";

export const CONNECT_DELIVERY_LEASE_MS = 60_000;

const CONNECT_TOKEN_TTL_MS = 10 * 60 * 1000;
const MAX_DELIVERY_ERROR_LENGTH = 300;

export type PrepareChannelConnectRequestInput = {
  channel: Extract<Channel, "TELEGRAM" | "WHATSAPP">;
  externalMessageId: string;
  externalId: string;
  chatId: string;
  tokenHash: string | null;
};

export type ChannelConnectRequestResult = {
  id: string;
  responseKind: ChannelConnectResponseKind;
};

function isUniqueConstraintError(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function boundedErrorSummary(error: unknown) {
  let summary: string;
  if (!error) summary = "Unknown error";
  else if (typeof error === "string") summary = error;
  else if (error instanceof Error) {
    summary = `${error.name}: ${error.message}`.trim();
  } else {
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
    .slice(0, MAX_DELIVERY_ERROR_LENGTH);
}

export async function prepareChannelConnectRequest(
  input: PrepareChannelConnectRequestInput,
): Promise<ChannelConnectRequestResult | null> {
  try {
    return await prisma.$transaction(async (tx) => {
      // Creating the provider-message marker first serializes duplicate
      // deliveries before any link token can be created or refreshed.
      const connectRequest = await tx.channelConnectRequest.create({
        data: {
          channel: input.channel,
          externalMessageId: input.externalMessageId,
          externalId: input.externalId,
          chatId: input.chatId,
          responseKind: "LINK",
        },
        select: { id: true, responseKind: true },
      });

      const existingIdentity = await tx.channelIdentity.findUnique({
        where: {
          channel_externalId: {
            channel: input.channel,
            externalId: input.externalId,
          },
        },
        select: { user: { select: { isGuest: true } } },
      });

      if (existingIdentity?.user && !existingIdentity.user.isGuest) {
        return await tx.channelConnectRequest.update({
          where: { id: connectRequest.id },
          data: { responseKind: "ALREADY_LINKED" },
          select: { id: true, responseKind: true },
        });
      }

      if (!input.tokenHash) {
        return await tx.channelConnectRequest.update({
          where: { id: connectRequest.id },
          data: { responseKind: "UNAVAILABLE" },
          select: { id: true, responseKind: true },
        });
      }

      const expiresAt = new Date(Date.now() + CONNECT_TOKEN_TTL_MS);
      const existingToken = await tx.channelLinkToken.findUnique({
        where: { tokenHash: input.tokenHash },
        select: { id: true, expiresAt: true, consumedAt: true },
      });

      if (!existingToken) {
        await tx.channelLinkToken.create({
          data: {
            channel: input.channel,
            tokenHash: input.tokenHash,
            externalId: input.externalId,
            chatId: input.chatId,
            expiresAt,
          },
          select: { id: true },
        });
      } else if (
        !existingToken.consumedAt &&
        existingToken.expiresAt.getTime() < Date.now()
      ) {
        await tx.channelLinkToken.update({
          where: { id: existingToken.id },
          data: { expiresAt },
          select: { id: true },
        });
      }

      return connectRequest;
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    return await prisma.channelConnectRequest.findUnique({
      where: {
        channel_externalMessageId: {
          channel: input.channel,
          externalMessageId: input.externalMessageId,
        },
      },
      select: { id: true, responseKind: true },
    });
  }
}

export async function claimChannelConnectDelivery(connectRequestId: string) {
  const now = new Date();
  const claimToken = randomUUID();
  const result = await prisma.channelConnectRequest.updateMany({
    where: {
      id: connectRequestId,
      OR: [
        { status: { in: ["PENDING", "FAILED"] } },
        { status: "SENDING", deliveryLeaseExpiresAt: { lt: now } },
      ],
    },
    data: {
      status: "SENDING",
      claimToken,
      deliveryLeaseExpiresAt: new Date(
        now.getTime() + CONNECT_DELIVERY_LEASE_MS,
      ),
      deliveryAttempts: { increment: 1 },
      lastDeliveryError: null,
    },
  });

  return result.count === 1 ? claimToken : null;
}

export async function markChannelConnectDeliverySent({
  connectRequestId,
  claimToken,
}: {
  connectRequestId: string;
  claimToken: string;
}) {
  const result = await prisma.channelConnectRequest.updateMany({
    where: { id: connectRequestId, status: "SENDING", claimToken },
    data: {
      status: "SENT",
      claimToken: null,
      deliveredAt: new Date(),
      deliveryLeaseExpiresAt: null,
      lastDeliveryError: null,
    },
  });
  return result.count === 1;
}

export async function markChannelConnectDeliveryFailed({
  connectRequestId,
  claimToken,
  error,
}: {
  connectRequestId: string;
  claimToken: string;
  error: unknown;
}) {
  const result = await prisma.channelConnectRequest.updateMany({
    where: { id: connectRequestId, status: "SENDING", claimToken },
    data: {
      status: "FAILED",
      claimToken: null,
      deliveryLeaseExpiresAt: null,
      lastDeliveryError: boundedErrorSummary(error),
    },
  });
  return result.count === 1;
}
