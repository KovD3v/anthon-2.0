CREATE TABLE "AiRoutingConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "liveClassifierEnabled" BOOLEAN NOT NULL DEFAULT false,
    "executionRoutingMode" TEXT NOT NULL DEFAULT 'off',
    "executionRoutingAllocationPercent" INTEGER NOT NULL DEFAULT 0,
    "executionRoutingTasks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRoutingConfig_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiRoutingConfig_updatedAt_idx" ON "AiRoutingConfig"("updatedAt");

ALTER TABLE "AiRoutingConfig"
ADD CONSTRAINT "AiRoutingConfig_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
