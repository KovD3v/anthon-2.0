-- CreateEnum
CREATE TYPE "ModelExperimentStatus" AS ENUM ('DRAFT', 'READY', 'ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ModelExperimentVariantRole" AS ENUM ('CONTROL', 'CANDIDATE');

-- CreateEnum
CREATE TYPE "ModelExperimentNoticeState" AS ENUM ('NOT_SHOWN', 'SHOWN');

-- CreateEnum
CREATE TYPE "ModelExperimentPairStatus" AS ENUM ('GENERATING', 'READY', 'RESOLVED', 'PARTIAL_FAILED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ModelExperimentVote" AS ENUM ('A', 'B', 'TIE', 'AUTO_CONTROL', 'AUTO_SUCCESS');

-- CreateEnum
CREATE TYPE "ModelExperimentResponseStatus" AS ENUM ('PENDING', 'STREAMING', 'COMPLETED', 'FAILED', 'PURGED');

-- CreateTable
CREATE TABLE "ModelExperiment" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ModelExperimentStatus" NOT NULL DEFAULT 'DRAFT',
    "posthogFlagKey" TEXT NOT NULL,
    "targetCountry" VARCHAR(2) NOT NULL DEFAULT 'IT',
    "cooldownHours" INTEGER NOT NULL DEFAULT 24,
    "perUserCap" INTEGER NOT NULL DEFAULT 5,
    "createdByAdminId" TEXT NOT NULL,
    "readyAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelExperiment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ModelExperiment_country_check" CHECK ("targetCountry" = upper("targetCountry")),
    CONSTRAINT "ModelExperiment_cadence_check" CHECK ("cooldownHours" > 0 AND "perUserCap" > 0)
);

-- CreateTable
CREATE TABLE "ModelExperimentVariant" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "role" "ModelExperimentVariantRole" NOT NULL,
    "modelId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'openrouter',
    "generationConfig" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelExperimentVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelExperimentParticipant" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "noticeState" "ModelExperimentNoticeState" NOT NULL DEFAULT 'NOT_SHOWN',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "completedComparisons" INTEGER NOT NULL DEFAULT 0,
    "nextEligibleAt" TIMESTAMP(3),
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastExposedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelExperimentParticipant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ModelExperimentParticipant_counts_check" CHECK ("attempts" >= 0 AND "completedComparisons" >= 0 AND "completedComparisons" <= "attempts")
);

-- CreateTable
CREATE TABLE "ModelExperimentPair" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "conversationThreadId" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "slotAVariantId" TEXT NOT NULL,
    "slotBVariantId" TEXT NOT NULL,
    "status" "ModelExperimentPairStatus" NOT NULL DEFAULT 'GENERATING',
    "vote" "ModelExperimentVote",
    "selectedVariantId" TEXT,
    "canonicalMessageId" TEXT,
    "countryCode" VARCHAR(2) NOT NULL,
    "promptMode" TEXT,
    "exposedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "contentPurgeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelExperimentPair_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ModelExperimentPair_slots_check" CHECK ("slotAVariantId" <> "slotBVariantId"),
    CONSTRAINT "ModelExperimentPair_country_check" CHECK ("countryCode" = upper("countryCode"))
);

-- CreateTable
CREATE TABLE "ModelExperimentResponse" (
    "id" TEXT NOT NULL,
    "pairId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "status" "ModelExperimentResponseStatus" NOT NULL DEFAULT 'PENDING',
    "parts" JSONB,
    "text" TEXT,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "generationConfig" JSONB NOT NULL,
    "traceId" TEXT NOT NULL,
    "errorCode" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "reasoningTokens" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "timeToFirstTokenMs" INTEGER,
    "generationTimeMs" INTEGER,
    "firstTokenAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelExperimentResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelExperimentAudit" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelExperimentAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModelExperiment_key_key" ON "ModelExperiment"("key");
CREATE INDEX "ModelExperiment_status_idx" ON "ModelExperiment"("status");
CREATE INDEX "ModelExperiment_createdAt_idx" ON "ModelExperiment"("createdAt" DESC);

-- Only one database experiment may accept new enrollments at a time.
CREATE UNIQUE INDEX "ModelExperiment_single_active_idx" ON "ModelExperiment" ((1)) WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "ModelExperimentVariant_experimentId_role_key" ON "ModelExperimentVariant"("experimentId", "role");
CREATE INDEX "ModelExperimentVariant_modelId_idx" ON "ModelExperimentVariant"("modelId");
CREATE UNIQUE INDEX "ModelExperimentParticipant_experimentId_userId_key" ON "ModelExperimentParticipant"("experimentId", "userId");
CREATE INDEX "ModelExperimentParticipant_userId_idx" ON "ModelExperimentParticipant"("userId");
CREATE INDEX "ModelExperimentParticipant_experimentId_nextEligibleAt_idx" ON "ModelExperimentParticipant"("experimentId", "nextEligibleAt");
CREATE UNIQUE INDEX "ModelExperimentPair_sourceMessageId_key" ON "ModelExperimentPair"("sourceMessageId");
CREATE UNIQUE INDEX "ModelExperimentPair_canonicalMessageId_key" ON "ModelExperimentPair"("canonicalMessageId");
CREATE INDEX "ModelExperimentPair_experimentId_status_idx" ON "ModelExperimentPair"("experimentId", "status");
CREATE INDEX "ModelExperimentPair_participantId_createdAt_idx" ON "ModelExperimentPair"("participantId", "createdAt" DESC);
CREATE INDEX "ModelExperimentPair_userId_status_idx" ON "ModelExperimentPair"("userId", "status");
CREATE INDEX "ModelExperimentPair_expiresAt_idx" ON "ModelExperimentPair"("expiresAt");
CREATE INDEX "ModelExperimentPair_contentPurgeAt_idx" ON "ModelExperimentPair"("contentPurgeAt");
CREATE UNIQUE INDEX "ModelExperimentResponse_traceId_key" ON "ModelExperimentResponse"("traceId");
CREATE UNIQUE INDEX "ModelExperimentResponse_pairId_variantId_key" ON "ModelExperimentResponse"("pairId", "variantId");
CREATE INDEX "ModelExperimentResponse_variantId_status_idx" ON "ModelExperimentResponse"("variantId", "status");
CREATE INDEX "ModelExperimentResponse_pairId_status_idx" ON "ModelExperimentResponse"("pairId", "status");
CREATE INDEX "ModelExperimentAudit_experimentId_createdAt_idx" ON "ModelExperimentAudit"("experimentId", "createdAt" DESC);
CREATE INDEX "ModelExperimentAudit_actorUserId_createdAt_idx" ON "ModelExperimentAudit"("actorUserId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "ModelExperiment" ADD CONSTRAINT "ModelExperiment_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelExperimentVariant" ADD CONSTRAINT "ModelExperimentVariant_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "ModelExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelExperimentParticipant" ADD CONSTRAINT "ModelExperimentParticipant_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "ModelExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelExperimentParticipant" ADD CONSTRAINT "ModelExperimentParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelExperimentPair" ADD CONSTRAINT "ModelExperimentPair_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "ModelExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelExperimentPair" ADD CONSTRAINT "ModelExperimentPair_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "ModelExperimentParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelExperimentPair" ADD CONSTRAINT "ModelExperimentPair_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelExperimentPair" ADD CONSTRAINT "ModelExperimentPair_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelExperimentPair" ADD CONSTRAINT "ModelExperimentPair_conversationThreadId_fkey" FOREIGN KEY ("conversationThreadId") REFERENCES "ConversationThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelExperimentPair" ADD CONSTRAINT "ModelExperimentPair_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelExperimentPair" ADD CONSTRAINT "ModelExperimentPair_slotAVariantId_fkey" FOREIGN KEY ("slotAVariantId") REFERENCES "ModelExperimentVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelExperimentPair" ADD CONSTRAINT "ModelExperimentPair_slotBVariantId_fkey" FOREIGN KEY ("slotBVariantId") REFERENCES "ModelExperimentVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelExperimentPair" ADD CONSTRAINT "ModelExperimentPair_selectedVariantId_fkey" FOREIGN KEY ("selectedVariantId") REFERENCES "ModelExperimentVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelExperimentPair" ADD CONSTRAINT "ModelExperimentPair_canonicalMessageId_fkey" FOREIGN KEY ("canonicalMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModelExperimentResponse" ADD CONSTRAINT "ModelExperimentResponse_pairId_fkey" FOREIGN KEY ("pairId") REFERENCES "ModelExperimentPair"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelExperimentResponse" ADD CONSTRAINT "ModelExperimentResponse_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ModelExperimentVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelExperimentAudit" ADD CONSTRAINT "ModelExperimentAudit_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "ModelExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelExperimentAudit" ADD CONSTRAINT "ModelExperimentAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
