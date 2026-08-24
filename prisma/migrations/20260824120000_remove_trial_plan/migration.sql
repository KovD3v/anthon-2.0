UPDATE "Subscription"
SET "status" = 'EXPIRED',
    "canceledAt" = COALESCE("canceledAt", NOW())
WHERE "status" = 'TRIAL';

UPDATE "OrganizationContract"
SET "modelTier" = 'BASIC'
WHERE "modelTier" = 'TRIAL';

ALTER TYPE "SubscriptionStatus" RENAME TO "SubscriptionStatus_old";
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELED', 'EXPIRED', 'PAST_DUE');
ALTER TABLE "Subscription"
ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "status" TYPE "SubscriptionStatus"
USING ("status"::text::"SubscriptionStatus"),
ALTER COLUMN "status" SET DEFAULT 'EXPIRED';
DROP TYPE "SubscriptionStatus_old";

ALTER TYPE "OrganizationModelTier" RENAME TO "OrganizationModelTier_old";
CREATE TYPE "OrganizationModelTier" AS ENUM ('GUEST', 'BASIC', 'BASIC_PLUS', 'PRO', 'ENTERPRISE', 'ADMIN');
ALTER TABLE "OrganizationContract"
ALTER COLUMN "modelTier" DROP DEFAULT,
ALTER COLUMN "modelTier" TYPE "OrganizationModelTier"
USING ("modelTier"::text::"OrganizationModelTier"),
ALTER COLUMN "modelTier" SET DEFAULT 'BASIC';
DROP TYPE "OrganizationModelTier_old";

DROP INDEX IF EXISTS "Subscription_trialEndsAt_idx";
DROP INDEX IF EXISTS "Subscription_status_trialEndsAt_idx";
ALTER TABLE "Subscription"
DROP COLUMN "trialStartedAt",
DROP COLUMN "trialEndsAt";
