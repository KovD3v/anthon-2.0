CREATE TYPE "BetaAbuseAction" AS ENUM ('UNLOCK', 'MAILING_SUBSCRIPTION');

CREATE TABLE "BetaAccessConfig" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "passwordDigest" TEXT NOT NULL,
    "accessVersion" INTEGER NOT NULL DEFAULT 1,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BetaAccessConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BetaMailingSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "releaseOptInAt" TIMESTAMP(3) NOT NULL,
    "updatesOptInAt" TIMESTAMP(3),
    "updatesOptOutAt" TIMESTAMP(3),
    "consentVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BetaMailingSubscriber_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BetaAbuseBucket" (
    "id" TEXT NOT NULL,
    "fingerprintHash" TEXT NOT NULL,
    "action" "BetaAbuseAction" NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BetaAbuseBucket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BetaAccessConfig_updatedAt_idx"
ON "BetaAccessConfig"("updatedAt");

CREATE UNIQUE INDEX "BetaMailingSubscriber_normalizedEmail_key"
ON "BetaMailingSubscriber"("normalizedEmail");

CREATE INDEX "BetaMailingSubscriber_createdAt_idx"
ON "BetaMailingSubscriber"("createdAt");

CREATE INDEX "BetaMailingSubscriber_updatesOptInAt_idx"
ON "BetaMailingSubscriber"("updatesOptInAt");

CREATE INDEX "BetaAbuseBucket_windowStart_idx"
ON "BetaAbuseBucket"("windowStart");

CREATE UNIQUE INDEX "BetaAbuseBucket_fingerprintHash_action_windowStart_key"
ON "BetaAbuseBucket"("fingerprintHash", "action", "windowStart");

ALTER TABLE "BetaAccessConfig"
ADD CONSTRAINT "BetaAccessConfig_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
