-- Create ChannelLinkToken table for one-time channel linking
CREATE TABLE "ChannelLinkToken"(
    "id" text NOT NULL,
    "channel" "Channel" NOT NULL,
    "tokenHash" text NOT NULL,
    "externalId" text NOT NULL,
    "chatId" text NOT NULL,
    "expiresAt" timestamp(3) NOT NULL,
    "consumedAt" timestamp(3),
    "consumedByUserId" text,
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChannelLinkToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChannelLinkToken_tokenHash_key" ON "ChannelLinkToken"("tokenHash");

CREATE INDEX "ChannelLinkToken_channel_externalId_idx" ON "ChannelLinkToken"("channel", "externalId");

CREATE INDEX "ChannelLinkToken_expiresAt_idx" ON "ChannelLinkToken"("expiresAt");

ALTER TABLE "ChannelLinkToken"
    ADD CONSTRAINT "ChannelLinkToken_consumedByUserId_fkey" FOREIGN KEY ("consumedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

