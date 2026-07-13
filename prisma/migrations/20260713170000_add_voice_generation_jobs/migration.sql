-- Durable, idempotent web TTS jobs. QStash delivers at least once, so each
-- assistant message owns one job and worker ownership is guarded by a lease.
CREATE TYPE "VoiceGenerationStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'READY',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "VoiceGenerationJob" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "VoiceGenerationStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "claimToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "queuedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "blobUrl" TEXT,
  "audioSize" INTEGER,
  "characterCount" INTEGER,
  "costUsd" DOUBLE PRECISION,
  "attachmentId" TEXT,
  "errorCode" TEXT,
  "processingTimeMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VoiceGenerationJob_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "VoiceUsage"
  ADD COLUMN "voiceGenerationJobId" TEXT;

CREATE UNIQUE INDEX "VoiceGenerationJob_messageId_key"
  ON "VoiceGenerationJob"("messageId");
CREATE UNIQUE INDEX "VoiceGenerationJob_attachmentId_key"
  ON "VoiceGenerationJob"("attachmentId");
CREATE UNIQUE INDEX "VoiceUsage_voiceGenerationJobId_key"
  ON "VoiceUsage"("voiceGenerationJobId");
CREATE INDEX "VoiceGenerationJob_status_leaseExpiresAt_idx"
  ON "VoiceGenerationJob"("status", "leaseExpiresAt");
CREATE INDEX "VoiceGenerationJob_status_expiresAt_idx"
  ON "VoiceGenerationJob"("status", "expiresAt");
CREATE INDEX "VoiceGenerationJob_userId_createdAt_idx"
  ON "VoiceGenerationJob"("userId", "createdAt" DESC);

ALTER TABLE "VoiceGenerationJob"
  ADD CONSTRAINT "VoiceGenerationJob_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceGenerationJob"
  ADD CONSTRAINT "VoiceGenerationJob_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceGenerationJob"
  ADD CONSTRAINT "VoiceGenerationJob_attachmentId_fkey"
  FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VoiceUsage"
  ADD CONSTRAINT "VoiceUsage_voiceGenerationJobId_fkey"
  FOREIGN KEY ("voiceGenerationJobId") REFERENCES "VoiceGenerationJob"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
