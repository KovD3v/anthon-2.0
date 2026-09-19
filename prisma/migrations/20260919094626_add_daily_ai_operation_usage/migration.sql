-- CreateTable
CREATE TABLE "DailyAiOperationUsage" (
    "date" DATE NOT NULL,
    "operation" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "failedCalls" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadObservedCalls" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteObservedCalls" INTEGER NOT NULL DEFAULT 0,
    "providerReportedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unknownCostCalls" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyAiOperationUsage_pkey" PRIMARY KEY ("date","operation","model")
);
