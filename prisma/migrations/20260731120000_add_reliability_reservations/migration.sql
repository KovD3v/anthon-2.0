-- Separate the revocable browser token from the stable, keyed abuse-control
-- fingerprint. Existing rows used guestAbuseIdHash only for token lookup.
ALTER TABLE "User" ADD COLUMN "guestTokenHash" TEXT;
UPDATE "User"
SET "guestTokenHash" = "guestAbuseIdHash",
    "guestAbuseIdHash" = NULL
WHERE "guestAbuseIdHash" IS NOT NULL;

DROP INDEX "User_guestAbuseIdHash_key";
CREATE UNIQUE INDEX "User_guestTokenHash_key" ON "User"("guestTokenHash");
CREATE INDEX "User_guestAbuseIdHash_idx" ON "User"("guestAbuseIdHash");

CREATE TYPE "AiUsageReservationStatus" AS ENUM (
  'RESERVED',
  'RECONCILED',
  'RELEASED',
  'EXPIRED'
);

CREATE TYPE "UploadReservationStatus" AS ENUM (
  'RESERVED',
  'COMMITTED',
  'RELEASED',
  'EXPIRED'
);

ALTER TABLE "Message"
  ADD COLUMN "clientMessageId" TEXT,
  ADD COLUMN "clientMessagePayloadHash" TEXT,
  ADD COLUMN "sourceInboundMessageId" TEXT;

CREATE UNIQUE INDEX "Message_sourceInboundMessageId_key"
  ON "Message"("sourceInboundMessageId");
CREATE UNIQUE INDEX "Message_userId_channel_clientMessageId_key"
  ON "Message"("userId", "channel", "clientMessageId");
ALTER TABLE "Message"
  ADD CONSTRAINT "Message_sourceInboundMessageId_fkey"
  FOREIGN KEY ("sourceInboundMessageId") REFERENCES "Message"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AiUsageReservation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "requestKey" TEXT NOT NULL,
  "claimToken" TEXT NOT NULL,
  "status" "AiUsageReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "reservedRequests" INTEGER NOT NULL DEFAULT 1,
  "reservedInputTokens" INTEGER NOT NULL DEFAULT 0,
  "reservedOutputTokens" INTEGER NOT NULL DEFAULT 0,
  "reservedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "actualInputTokens" INTEGER,
  "actualOutputTokens" INTEGER,
  "actualReasoningTokens" INTEGER,
  "actualCostUsd" DOUBLE PRECISION,
  "recoveryText" TEXT,
  "recoveryMetrics" JSONB,
  "recoveryExpiresAt" TIMESTAMP(3),
  "assistantMessageId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "reconciledAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiUsageReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiUsageReservation_userId_requestKey_key"
  ON "AiUsageReservation"("userId", "requestKey");
CREATE UNIQUE INDEX "AiUsageReservation_assistantMessageId_key"
  ON "AiUsageReservation"("assistantMessageId");
CREATE INDEX "AiUsageReservation_userId_date_status_expiresAt_idx"
  ON "AiUsageReservation"("userId", "date", "status", "expiresAt");
ALTER TABLE "AiUsageReservation"
  ADD CONSTRAINT "AiUsageReservation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiUsageReservation"
  ADD CONSTRAINT "AiUsageReservation_assistantMessageId_fkey"
  FOREIGN KEY ("assistantMessageId") REFERENCES "Message"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DailyUploadUsage" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "uploadCount" INTEGER NOT NULL DEFAULT 0,
  "uploadedBytes" BIGINT NOT NULL DEFAULT 0,
  "reservedCount" INTEGER NOT NULL DEFAULT 0,
  "reservedBytes" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyUploadUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyUploadUsage_userId_date_key"
  ON "DailyUploadUsage"("userId", "date");
ALTER TABLE "DailyUploadUsage"
  ADD CONSTRAINT "DailyUploadUsage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UploadReservation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "byteCount" BIGINT NOT NULL,
  "status" "UploadReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "committedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UploadReservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UploadReservation_userId_date_status_expiresAt_idx"
  ON "UploadReservation"("userId", "date", "status", "expiresAt");
ALTER TABLE "UploadReservation"
  ADD CONSTRAINT "UploadReservation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GuestAbuseBucket" (
  "id" TEXT NOT NULL,
  "fingerprintHash" TEXT NOT NULL,
  "windowStart" DATE NOT NULL,
  "createdSessions" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuestAbuseBucket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuestAbuseBucket_fingerprintHash_windowStart_key"
  ON "GuestAbuseBucket"("fingerprintHash", "windowStart");
CREATE INDEX "GuestAbuseBucket_windowStart_idx"
  ON "GuestAbuseBucket"("windowStart");
