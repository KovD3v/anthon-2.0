-- Preserve historical string-step routine snapshots as v1 while allowing
-- typed v2 snapshots to be introduced by subsequent writes.
ALTER TABLE "Routine"
  ADD COLUMN IF NOT EXISTS "formatVersion" INTEGER NOT NULL DEFAULT 1;
