-- CreateTable
CREATE TABLE "MessageMetrics" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "model" TEXT,
    "provider" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "reasoningTokens" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "generationTimeMs" INTEGER,
    "reasoningTimeMs" INTEGER,
    "toolCallCount" INTEGER,
    "toolResultChars" INTEGER,
    "toolTiming" JSONB,
    "ragUsed" BOOLEAN,
    "ragChunksCount" INTEGER,
    "providerMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageMetrics_pkey" PRIMARY KEY ("id")
);

-- Backfill metrics that were already stored directly on assistant messages.
INSERT INTO "MessageMetrics" (
    "id",
    "messageId",
    "model",
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "reasoningTokens",
    "costUsd",
    "generationTimeMs",
    "reasoningTimeMs",
    "ragUsed",
    "ragChunksCount",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "id",
    "model",
    "inputTokens",
    "outputTokens",
    CASE
        WHEN "inputTokens" IS NULL AND "outputTokens" IS NULL THEN NULL
        ELSE COALESCE("inputTokens", 0) + COALESCE("outputTokens", 0)
    END,
    "reasoningTokens",
    "costUsd",
    "generationTimeMs",
    "reasoningTimeMs",
    "ragUsed",
    "ragChunksCount",
    "createdAt",
    CURRENT_TIMESTAMP
FROM "Message"
WHERE "role" = 'ASSISTANT'
  AND (
    "model" IS NOT NULL
    OR "inputTokens" IS NOT NULL
    OR "outputTokens" IS NOT NULL
    OR "reasoningTokens" IS NOT NULL
    OR "costUsd" IS NOT NULL
    OR "generationTimeMs" IS NOT NULL
    OR "reasoningTimeMs" IS NOT NULL
    OR "ragUsed" IS NOT NULL
    OR "ragChunksCount" IS NOT NULL
  );

-- CreateIndex
CREATE UNIQUE INDEX "MessageMetrics_messageId_key" ON "MessageMetrics"("messageId");

-- CreateIndex
CREATE INDEX "MessageMetrics_model_createdAt_idx" ON "MessageMetrics"("model", "createdAt");

-- CreateIndex
CREATE INDEX "MessageMetrics_provider_createdAt_idx" ON "MessageMetrics"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "MessageMetrics_createdAt_idx" ON "MessageMetrics"("createdAt");

-- AddForeignKey
ALTER TABLE "MessageMetrics" ADD CONSTRAINT "MessageMetrics_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
