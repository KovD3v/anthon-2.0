-- Provider webhooks can redeliver one /connect command concurrently. Keep one
-- durable claim per inbound provider message and track its outbound response.
CREATE TYPE "ChannelConnectResponseKind" AS ENUM ('LINK', 'ALREADY_LINKED', 'UNAVAILABLE');
CREATE TYPE "ChannelConnectDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

CREATE TABLE "ChannelConnectRequest" (
    "id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "externalMessageId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "responseKind" "ChannelConnectResponseKind" NOT NULL,
    "status" "ChannelConnectDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryLeaseExpiresAt" TIMESTAMP(3),
    "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "deliveredAt" TIMESTAMP(3),
    "lastDeliveryError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelConnectRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChannelConnectRequest_channel_externalMessageId_key"
  ON "ChannelConnectRequest"("channel", "externalMessageId");
CREATE INDEX "ChannelConnectRequest_status_deliveryLeaseExpiresAt_idx"
  ON "ChannelConnectRequest"("status", "deliveryLeaseExpiresAt");
