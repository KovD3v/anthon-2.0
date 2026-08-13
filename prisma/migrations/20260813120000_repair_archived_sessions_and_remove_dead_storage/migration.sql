-- Repair schema drift: this model is active in the session archiver but was
-- never introduced by a migration. IF NOT EXISTS keeps development databases
-- that already received it through schema synchronization compatible.
CREATE TABLE IF NOT EXISTS "ArchivedSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchivedSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ArchivedSession_userId_startDate_idx"
ON "ArchivedSession"("userId", "startDate");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ArchivedSession_userId_fkey'
      AND conrelid = '"ArchivedSession"'::regclass
  ) THEN
    ALTER TABLE "ArchivedSession"
    ADD CONSTRAINT "ArchivedSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Remove storage with no application readers or writers and no persisted rows.
DROP TABLE IF EXISTS "ArtifactVersion";
DROP TABLE IF EXISTS "Artifact";
DROP TYPE IF EXISTS "ArtifactKind";

ALTER TABLE "User" DROP COLUMN IF EXISTS "lastActivityAt";
ALTER TABLE "Message" DROP COLUMN IF EXISTS "reasoningContent";
