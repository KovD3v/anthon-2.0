-- Migration: db_improvements
-- Add WEB channel, soft deletes, Message.updatedAt, Message model index, make Attachment.messageId required

-- 1. Add WEB to Channel enum (first position)
ALTER TYPE "Channel" ADD VALUE IF NOT EXISTS 'WEB' BEFORE 'WHATSAPP';

-- 2. Add deletedAt columns for soft delete support
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- 3. Add updatedAt to Message (set default to createdAt for existing rows, then to now() for new ones)
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
UPDATE "Message" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "Message" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "Message" ALTER COLUMN "updatedAt" SET DEFAULT now();

-- 4. Handle orphaned attachments (delete those without messageId, then make it required)
DELETE FROM "Attachment" WHERE "messageId" IS NULL;
ALTER TABLE "Attachment" ALTER COLUMN "messageId" SET NOT NULL;

-- 5. Add indexes for soft deletes and model analytics
CREATE INDEX IF NOT EXISTS "User_deletedAt_idx" ON "User"("deletedAt");
CREATE INDEX IF NOT EXISTS "Chat_deletedAt_idx" ON "Chat"("deletedAt");
CREATE INDEX IF NOT EXISTS "Message_deletedAt_idx" ON "Message"("deletedAt");
CREATE INDEX IF NOT EXISTS "Message_model_createdAt_idx" ON "Message"("model", "createdAt");
