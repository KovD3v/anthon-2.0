-- Migration: Add Artifact, Attachment, DailyUsage models and drop ModelPricing
-- Purpose: Support artifacts (code generation), file attachments, and usage tracking (replacing ModelPricing with TokenLens)
-- -----------------------------------------------------
-- 1. CREATE ARTIFACT TABLE
-- -----------------------------------------------------
CREATE TABLE "Artifact"(
    "id" text NOT NULL,
    "chatId" text NOT NULL,
    "messageId" text,
    "title" text NOT NULL,
    "kind" text NOT NULL, -- 'code', 'text', 'sheet', 'image', etc.
    "language" text, -- Programming language if kind='code'
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) NOT NULL,
    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "Artifact"
    ADD CONSTRAINT "Artifact_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Artifact"
    ADD CONSTRAINT "Artifact_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "Artifact_chatId_idx" ON "Artifact"("chatId");

-- -----------------------------------------------------
-- 2. CREATE ARTIFACT VERSION TABLE
-- -----------------------------------------------------
CREATE TABLE "ArtifactVersion"(
    "id" text NOT NULL,
    "artifactId" text NOT NULL,
    "content" text NOT NULL, -- Actual artifact content
    "blobUrl" text, -- Vercel Blob URL for large content
    "versionNumber" integer NOT NULL DEFAULT 1,
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArtifactVersion_pkey" PRIMARY KEY ("id")
);

-- Foreign key
ALTER TABLE "ArtifactVersion"
    ADD CONSTRAINT "ArtifactVersion_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Index for version queries
CREATE INDEX "ArtifactVersion_artifactId_versionNumber_idx" ON "ArtifactVersion"("artifactId", "versionNumber" DESC);

-- -----------------------------------------------------
-- 3. CREATE ATTACHMENT TABLE
-- -----------------------------------------------------
CREATE TABLE "Attachment"(
    "id" text NOT NULL,
    "messageId" text NOT NULL,
    "name" text NOT NULL, -- Original filename
    "contentType" text NOT NULL, -- MIME type
    "size" integer NOT NULL, -- Size in bytes
    "blobUrl" text NOT NULL, -- Vercel Blob URL
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- Foreign key
ALTER TABLE "Attachment"
    ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Index
CREATE INDEX "Attachment_messageId_idx" ON "Attachment"("messageId");

-- -----------------------------------------------------
-- 4. CREATE DAILY USAGE TABLE (for rate limiting)
-- -----------------------------------------------------
CREATE TABLE "DailyUsage"(
    "id" text NOT NULL,
    "userId" text NOT NULL,
    "date" date NOT NULL, -- UTC date
    "requestCount" integer NOT NULL DEFAULT 0,
    "inputTokens" integer NOT NULL DEFAULT 0,
    "outputTokens" integer NOT NULL DEFAULT 0,
    "totalCostUsd" double precision NOT NULL DEFAULT 0,
    "updatedAt" timestamp(3) NOT NULL,
    CONSTRAINT "DailyUsage_pkey" PRIMARY KEY ("id")
);

-- Foreign key
ALTER TABLE "DailyUsage"
    ADD CONSTRAINT "DailyUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Unique constraint for one record per user per day
CREATE UNIQUE INDEX "DailyUsage_userId_date_key" ON "DailyUsage"("userId", "date");

-- Index for queries
CREATE INDEX "DailyUsage_userId_date_idx" ON "DailyUsage"("userId", "date" DESC);

-- -----------------------------------------------------
-- 5. DROP MODEL PRICING TABLE (replaced by TokenLens)
-- -----------------------------------------------------
-- ModelPricing is no longer needed as TokenLens provides up-to-date pricing from OpenRouter API
DROP TABLE IF EXISTS "ModelPricing";

-- -----------------------------------------------------
-- 6. COMMENTS FOR DOCUMENTATION
-- -----------------------------------------------------
COMMENT ON TABLE "Artifact" IS 'Generated artifacts (code, text, etc.) associated with chat messages';

COMMENT ON COLUMN "Artifact"."kind" IS 'Type of artifact: code, text, sheet, image, etc.';

COMMENT ON TABLE "ArtifactVersion" IS 'Version history for artifacts - each edit creates a new version';

COMMENT ON TABLE "Attachment" IS 'File attachments uploaded by users to messages';

COMMENT ON TABLE "DailyUsage" IS 'Daily usage tracking for rate limiting and analytics';

