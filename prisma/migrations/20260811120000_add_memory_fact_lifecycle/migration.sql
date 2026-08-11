CREATE TYPE "MemoryFactOrigin" AS ENUM ('EXPLICIT', 'INFERRED', 'CONFIRMED', 'MIGRATED');
CREATE TYPE "MemoryFactSensitivity" AS ENUM ('LOW', 'HIGH');
CREATE TYPE "MemoryFactStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'DELETED');

ALTER TABLE "Memory"
ADD COLUMN "origin" "MemoryFactOrigin" NOT NULL DEFAULT 'MIGRATED',
ADD COLUMN "sensitivity" "MemoryFactSensitivity" NOT NULL DEFAULT 'LOW',
ADD COLUMN "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN "status" "MemoryFactStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "sourceMessageId" TEXT,
ADD COLUMN "sourceThreadId" TEXT,
ADD COLUMN "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "lastConfirmedAt" TIMESTAMP(3),
ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "Memory"
SET
  "sensitivity" = CASE
    WHEN "category" IN ('health', 'diagnosis', 'trauma', 'intimate')
      THEN 'HIGH'::"MemoryFactSensitivity"
    ELSE 'LOW'::"MemoryFactSensitivity"
  END,
  "confidence" = COALESCE(
    CASE
      WHEN jsonb_typeof("value"->'confidence') = 'number'
        THEN ("value"->>'confidence')::double precision
    END,
    1.0
  ),
  "observedAt" = "createdAt";

CREATE TABLE "MemoryRevision" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "memoryId" TEXT NOT NULL,
  "sourceMessageId" TEXT,
  "previousValue" JSONB,
  "nextValue" JSONB,
  "origin" "MemoryFactOrigin" NOT NULL,
  "reason" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemoryRevision_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MemoryApproval"
ADD COLUMN "presentationInboundMessageId" TEXT,
ADD COLUMN "presentationAssistantMessageId" TEXT;

CREATE UNIQUE INDEX "MemoryRevision_dedupeKey_key" ON "MemoryRevision"("dedupeKey");
CREATE INDEX "Memory_userId_status_updatedAt_idx" ON "Memory"("userId", "status", "updatedAt" DESC);
CREATE INDEX "Memory_userId_expiresAt_idx" ON "Memory"("userId", "expiresAt");
CREATE INDEX "Memory_sourceMessageId_idx" ON "Memory"("sourceMessageId");
CREATE INDEX "Memory_sourceThreadId_idx" ON "Memory"("sourceThreadId");
CREATE INDEX "MemoryRevision_userId_createdAt_idx" ON "MemoryRevision"("userId", "createdAt" DESC);
CREATE INDEX "MemoryRevision_memoryId_createdAt_idx" ON "MemoryRevision"("memoryId", "createdAt" DESC);
CREATE INDEX "MemoryRevision_sourceMessageId_idx" ON "MemoryRevision"("sourceMessageId");
CREATE INDEX "MemoryApproval_presentationInboundMessageId_idx" ON "MemoryApproval"("presentationInboundMessageId");
CREATE INDEX "MemoryApproval_presentationAssistantMessageId_idx" ON "MemoryApproval"("presentationAssistantMessageId");

ALTER TABLE "Memory"
ADD CONSTRAINT "Memory_sourceMessageId_fkey"
FOREIGN KEY ("sourceMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Memory"
ADD CONSTRAINT "Memory_sourceThreadId_fkey"
FOREIGN KEY ("sourceThreadId") REFERENCES "ConversationThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MemoryRevision"
ADD CONSTRAINT "MemoryRevision_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemoryRevision"
ADD CONSTRAINT "MemoryRevision_memoryId_fkey"
FOREIGN KEY ("memoryId") REFERENCES "Memory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemoryRevision"
ADD CONSTRAINT "MemoryRevision_sourceMessageId_fkey"
FOREIGN KEY ("sourceMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MemoryApproval"
ADD CONSTRAINT "MemoryApproval_presentationInboundMessageId_fkey"
FOREIGN KEY ("presentationInboundMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MemoryApproval"
ADD CONSTRAINT "MemoryApproval_presentationAssistantMessageId_fkey"
FOREIGN KEY ("presentationAssistantMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
