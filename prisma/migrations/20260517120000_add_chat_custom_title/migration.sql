-- Add explicit title ownership tracking for auto-generated chat titles.
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "customTitle" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Chat" ALTER COLUMN "customTitle" SET DEFAULT false;
UPDATE "Chat" SET "customTitle" = false WHERE "customTitle" IS NULL;
ALTER TABLE "Chat" ALTER COLUMN "customTitle" SET NOT NULL;
