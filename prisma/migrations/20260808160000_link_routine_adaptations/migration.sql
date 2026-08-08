-- Preserve adapted routines if their original is removed.
ALTER TABLE "Routine" ADD COLUMN "derivedFromRoutineId" TEXT;

ALTER TABLE "Routine"
ADD CONSTRAINT "Routine_derivedFromRoutineId_fkey"
FOREIGN KEY ("derivedFromRoutineId") REFERENCES "Routine"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Routine_derivedFromRoutineId_idx" ON "Routine"("derivedFromRoutineId");
