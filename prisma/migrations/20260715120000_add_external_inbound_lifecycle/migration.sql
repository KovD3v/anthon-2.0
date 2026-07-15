CREATE TYPE "ExternalInboundProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "Message"
  ADD COLUMN "externalInboundStatus" "ExternalInboundProcessingStatus",
  ADD COLUMN "externalInboundClaimToken" TEXT,
  ADD COLUMN "externalInboundLeaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "externalInboundAttempts" INTEGER,
  ADD COLUMN "externalInboundCompletedAt" TIMESTAMP(3),
  ADD COLUMN "externalInboundLastError" TEXT;

-- Existing provider-addressable rows predate the lifecycle and must remain
-- terminal so deploying this migration cannot replay acknowledged messages.
UPDATE "Message"
SET "externalInboundStatus" = 'COMPLETED',
    "externalInboundAttempts" = 0,
    "externalInboundCompletedAt" = COALESCE("updatedAt", "createdAt")
WHERE "externalMessageId" IS NOT NULL;

CREATE INDEX "Message_externalInboundStatus_externalInboundLeaseExpiresAt_idx"
  ON "Message"("externalInboundStatus", "externalInboundLeaseExpiresAt");
