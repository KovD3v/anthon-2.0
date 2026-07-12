-- Conversation identity is intentionally nullable on Message during the
-- backfill window. New writes set it in every channel adapter.
CREATE TYPE "AiTurnTraceStatus" AS ENUM ('PENDING', 'COMPLETE', 'FAILED');

ALTER TABLE "Message" ADD COLUMN "conversationThreadId" TEXT;

CREATE TABLE "ConversationThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "externalThreadId" TEXT NOT NULL,
    "chatId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConversationThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationThreadSummary" (
    "id" TEXT NOT NULL,
    "conversationThreadId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "throughMessageId" TEXT,
    "throughMessageCreatedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConversationThreadSummary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiTurnTrace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationThreadId" TEXT NOT NULL,
    "userMessageId" TEXT,
    "assistantMessageId" TEXT,
    "status" "AiTurnTraceStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB NOT NULL,
    "payloadCiphertext" BYTEA,
    "payloadIv" BYTEA,
    "payloadTag" BYTEA,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "contentCaptureStatus" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiTurnTrace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiTraceAccessAudit" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiTraceAccessAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversationThread_chatId_key" ON "ConversationThread"("chatId");
CREATE INDEX "ConversationThread_userId_channel_updatedAt_idx" ON "ConversationThread"("userId", "channel", "updatedAt" DESC);
CREATE UNIQUE INDEX "ConversationThread_userId_channel_externalThreadId_key" ON "ConversationThread"("userId", "channel", "externalThreadId");
CREATE UNIQUE INDEX "ConversationThreadSummary_conversationThreadId_key" ON "ConversationThreadSummary"("conversationThreadId");
CREATE INDEX "AiTurnTrace_conversationThreadId_createdAt_idx" ON "AiTurnTrace"("conversationThreadId", "createdAt" DESC);
CREATE INDEX "AiTurnTrace_userId_createdAt_idx" ON "AiTurnTrace"("userId", "createdAt" DESC);
CREATE INDEX "AiTurnTrace_expiresAt_idx" ON "AiTurnTrace"("expiresAt");
CREATE INDEX "AiTurnTrace_userMessageId_idx" ON "AiTurnTrace"("userMessageId");
CREATE INDEX "AiTraceAccessAudit_traceId_createdAt_idx" ON "AiTraceAccessAudit"("traceId", "createdAt" DESC);
CREATE INDEX "AiTraceAccessAudit_actorUserId_createdAt_idx" ON "AiTraceAccessAudit"("actorUserId", "createdAt" DESC);
CREATE INDEX "Message_conversationThreadId_createdAt_idx" ON "Message"("conversationThreadId", "createdAt");

ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationThreadId_fkey"
  FOREIGN KEY ("conversationThreadId") REFERENCES "ConversationThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationThread" ADD CONSTRAINT "ConversationThread_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationThread" ADD CONSTRAINT "ConversationThread_chatId_fkey"
  FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationThreadSummary" ADD CONSTRAINT "ConversationThreadSummary_conversationThreadId_fkey"
  FOREIGN KEY ("conversationThreadId") REFERENCES "ConversationThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiTurnTrace" ADD CONSTRAINT "AiTurnTrace_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiTurnTrace" ADD CONSTRAINT "AiTurnTrace_conversationThreadId_fkey"
  FOREIGN KEY ("conversationThreadId") REFERENCES "ConversationThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiTraceAccessAudit" ADD CONSTRAINT "AiTraceAccessAudit_traceId_fkey"
  FOREIGN KEY ("traceId") REFERENCES "AiTurnTrace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
