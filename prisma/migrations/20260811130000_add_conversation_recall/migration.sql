CREATE TABLE "ConversationRecallChunk" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationThreadId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "startMessageId" TEXT NOT NULL,
    "endMessageId" TEXT NOT NULL,
    "throughMessageId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "sourceCreatedAt" TIMESTAMP(3) NOT NULL,
    "embedding" vector(1536),
    "indexVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConversationRecallChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversationRecallChunk_conversationThreadId_throughMessageId_indexVersion_key"
ON "ConversationRecallChunk"("conversationThreadId", "throughMessageId", "indexVersion");

CREATE INDEX "ConversationRecallChunk_userId_conversationThreadId_sourceCreatedAt_idx"
ON "ConversationRecallChunk"("userId", "conversationThreadId", "sourceCreatedAt" DESC);

CREATE INDEX "ConversationRecallChunk_userId_channel_sourceCreatedAt_idx"
ON "ConversationRecallChunk"("userId", "channel", "sourceCreatedAt" DESC);

CREATE INDEX "ConversationRecallChunk_embedding_hnsw_idx"
ON "ConversationRecallChunk" USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX "ConversationRecallChunk_content_fts_idx"
ON "ConversationRecallChunk" USING gin (to_tsvector('simple', "content"));

ALTER TABLE "ConversationRecallChunk"
ADD CONSTRAINT "ConversationRecallChunk_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationRecallChunk"
ADD CONSTRAINT "ConversationRecallChunk_conversationThreadId_fkey" FOREIGN KEY ("conversationThreadId") REFERENCES "ConversationThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
