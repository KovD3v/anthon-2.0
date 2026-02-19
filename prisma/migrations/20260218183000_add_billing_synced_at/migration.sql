ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "billingSyncedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_billingSyncedAt_idx"
ON "User"("billingSyncedAt");
