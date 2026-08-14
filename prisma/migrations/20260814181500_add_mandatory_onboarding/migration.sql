CREATE TYPE "OnboardingSessionStatus" AS ENUM ('IN_PROGRESS', 'REVIEW');

ALTER TABLE "User"
ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

ALTER TABLE "Profile"
ADD COLUMN "age" INTEGER,
ADD COLUMN "occupation" TEXT;

CREATE TABLE "OnboardingSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "OnboardingSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "draft" JSONB NOT NULL DEFAULT '{}',
    "skippedFields" JSONB NOT NULL DEFAULT '[]',
    "transcript" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnboardingSession_userId_version_key"
ON "OnboardingSession"("userId", "version");

CREATE INDEX "OnboardingSession_userId_status_idx"
ON "OnboardingSession"("userId", "status");

ALTER TABLE "OnboardingSession"
ADD CONSTRAINT "OnboardingSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Every account that exists when the migration is deployed is exempt.
-- Accounts created by the application after this transaction keep NULL.
UPDATE "User"
SET "onboardingCompletedAt" = "createdAt"
WHERE "onboardingCompletedAt" IS NULL;
