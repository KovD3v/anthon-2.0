-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OrganizationPlanPreset" AS ENUM ('BASIC', 'BASIC_PLUS', 'PRO', 'ENTERPRISE_STARTER', 'ENTERPRISE_GROWTH', 'ENTERPRISE_CUSTOM', 'CUSTOM');

-- CreateEnum
CREATE TYPE "OrganizationModelTier" AS ENUM ('TRIAL', 'BASIC', 'BASIC_PLUS', 'PRO', 'ENTERPRISE', 'ADMIN');

-- CreateEnum
CREATE TYPE "OrganizationMemberRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "OrganizationMembershipStatus" AS ENUM ('ACTIVE', 'REMOVED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "OrganizationAuditActorType" AS ENUM ('ADMIN', 'SYSTEM', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "OrganizationAuditAction" AS ENUM ('ORGANIZATION_CREATED', 'CONTRACT_UPDATED', 'OWNER_ASSIGNED', 'OWNER_TRANSFERRED', 'MEMBERSHIP_SYNCED', 'MEMBERSHIP_BLOCKED_SEAT_LIMIT');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "clerkOrganizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "ownerUserId" TEXT,
    "pendingOwnerEmail" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationContract" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "seatLimit" INTEGER NOT NULL,
    "planPreset" "OrganizationPlanPreset" NOT NULL DEFAULT 'BASIC',
    "planLabel" TEXT NOT NULL,
    "modelTier" "OrganizationModelTier" NOT NULL DEFAULT 'BASIC',
    "maxRequestsPerDay" INTEGER NOT NULL,
    "maxInputTokensPerDay" INTEGER NOT NULL,
    "maxOutputTokensPerDay" INTEGER NOT NULL,
    "maxCostPerDay" DOUBLE PRECISION NOT NULL,
    "maxContextMessages" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clerkMembershipId" TEXT NOT NULL,
    "role" "OrganizationMemberRole" NOT NULL DEFAULT 'MEMBER',
    "status" "OrganizationMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationAuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorType" "OrganizationAuditActorType" NOT NULL,
    "action" "OrganizationAuditAction" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_clerkOrganizationId_key" ON "Organization"("clerkOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_status_idx" ON "Organization"("status");

-- CreateIndex
CREATE INDEX "Organization_ownerUserId_idx" ON "Organization"("ownerUserId");

-- CreateIndex
CREATE INDEX "Organization_createdByUserId_idx" ON "Organization"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationContract_organizationId_key" ON "OrganizationContract"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationContract_planPreset_idx" ON "OrganizationContract"("planPreset");

-- CreateIndex
CREATE INDEX "OrganizationContract_modelTier_idx" ON "OrganizationContract"("modelTier");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_clerkMembershipId_key" ON "OrganizationMembership"("clerkMembershipId");

-- CreateIndex
CREATE INDEX "OrganizationMembership_organizationId_status_idx" ON "OrganizationMembership"("organizationId", "status");

-- CreateIndex
CREATE INDEX "OrganizationMembership_userId_status_idx" ON "OrganizationMembership"("userId", "status");

-- CreateIndex
CREATE INDEX "OrganizationMembership_role_idx" ON "OrganizationMembership"("role");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_userId_key" ON "OrganizationMembership"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "OrganizationAuditLog_organizationId_createdAt_idx" ON "OrganizationAuditLog"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "OrganizationAuditLog_action_createdAt_idx" ON "OrganizationAuditLog"("action", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "OrganizationAuditLog_actorUserId_idx" ON "OrganizationAuditLog"("actorUserId");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationContract" ADD CONSTRAINT "OrganizationContract_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationAuditLog" ADD CONSTRAINT "OrganizationAuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationAuditLog" ADD CONSTRAINT "OrganizationAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

