-- CreateIndex
CREATE INDEX IF NOT EXISTS "Chat_userId_updatedAt_idx" ON "Chat"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Message_userId_createdAt_idx" ON "Message"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Message_chatId_userId_createdAt_idx" ON "Message"("chatId", "userId", "createdAt" DESC);
