-- CreateEnum
CREATE TYPE "MemoryApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "MemoryApproval" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceInboundMessageId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "category" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" "MemoryApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "MemoryApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemoryApproval_userId_status_createdAt_idx" ON "MemoryApproval"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MemoryApproval_sourceInboundMessageId_idx" ON "MemoryApproval"("sourceInboundMessageId");

-- AddForeignKey
ALTER TABLE "MemoryApproval" ADD CONSTRAINT "MemoryApproval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryApproval" ADD CONSTRAINT "MemoryApproval_sourceInboundMessageId_fkey" FOREIGN KEY ("sourceInboundMessageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
