-- Repair databases where the original Memory.category migration was recorded
-- as applied but the column/index are missing.
ALTER TABLE "Memory" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'other';

UPDATE "Memory"
SET category = value->>'category'
WHERE value->>'category' IS NOT NULL
  AND value->>'category' <> ''
  AND category = 'other';

CREATE INDEX IF NOT EXISTS "Memory_userId_category_idx" ON "Memory"("userId", "category");
