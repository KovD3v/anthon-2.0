DO $$
BEGIN
  CREATE TYPE "OrganizationBasePlan" AS ENUM ('BASIC', 'BASIC_PLUS', 'PRO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "OrganizationContract"
ADD COLUMN IF NOT EXISTS "basePlan" "OrganizationBasePlan";

UPDATE "OrganizationContract"
SET "basePlan" = CASE
  WHEN "modelTier" IN ('PRO', 'ENTERPRISE', 'ADMIN') THEN 'PRO'::"OrganizationBasePlan"
  WHEN "modelTier" = 'BASIC_PLUS' THEN 'BASIC_PLUS'::"OrganizationBasePlan"
  ELSE 'BASIC'::"OrganizationBasePlan"
END
WHERE "basePlan" IS NULL;

ALTER TABLE "OrganizationContract"
ALTER COLUMN "basePlan" SET DEFAULT 'BASIC';

ALTER TABLE "OrganizationContract"
ALTER COLUMN "basePlan" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "OrganizationContract_basePlan_idx"
ON "OrganizationContract"("basePlan");
