-- CreateEnum
CREATE TYPE "RoutineStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RoutineAttemptOutcome" AS ENUM ('HELPFUL', 'PARTIALLY_HELPFUL', 'NOT_HELPFUL');

-- CreateTable
CREATE TABLE "Routine" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceChatId" TEXT,
    "sourceAssistantMessageId" TEXT,
    "title" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "durationLabel" TEXT,
    "steps" JSONB NOT NULL,
    "completionCue" TEXT NOT NULL,
    "status" "RoutineStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Routine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineAttempt" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "clientActionId" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" "RoutineAttemptOutcome",
    "outcomeNote" TEXT,
    "outcomeRecordedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutineAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Routine_userId_status_updatedAt_idx" ON "Routine"("userId", "status", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Routine_sourceChatId_idx" ON "Routine"("sourceChatId");

-- CreateIndex
CREATE UNIQUE INDEX "Routine_userId_sourceAssistantMessageId_key" ON "Routine"("userId", "sourceAssistantMessageId");

-- CreateIndex
CREATE INDEX "RoutineAttempt_routineId_attemptedAt_idx" ON "RoutineAttempt"("routineId", "attemptedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "RoutineAttempt_routineId_clientActionId_key" ON "RoutineAttempt"("routineId", "clientActionId");

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_sourceChatId_fkey" FOREIGN KEY ("sourceChatId") REFERENCES "Chat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_sourceAssistantMessageId_fkey" FOREIGN KEY ("sourceAssistantMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineAttempt" ADD CONSTRAINT "RoutineAttempt_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
