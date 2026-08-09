-- Persist the routine collection context for chats created by Ripeti/Adatta.
-- A routine can be invoked by many chats; this relation is not ownership.
CREATE TYPE "RoutineChatMode" AS ENUM ('REPEAT', 'ADAPT');

ALTER TABLE "Chat"
  ADD COLUMN "routineContextRoutineId" TEXT,
  ADD COLUMN "routineContextMode" "RoutineChatMode";

CREATE INDEX "Chat_routineContextRoutineId_idx"
  ON "Chat"("routineContextRoutineId");

ALTER TABLE "Chat"
  ADD CONSTRAINT "Chat_routineContextRoutineId_fkey"
  FOREIGN KEY ("routineContextRoutineId") REFERENCES "Routine"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
