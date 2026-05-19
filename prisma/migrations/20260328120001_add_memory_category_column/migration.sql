-- AlterTable
ALTER TABLE "Memory" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'other';

-- Backfill from JSON
UPDATE "Memory"
SET category = value->>'category'
WHERE value->>'category' IS NOT NULL
  AND value->>'category' <> '';

-- CreateIndex
CREATE INDEX "Memory_userId_category_idx" ON "Memory"("userId", "category");
