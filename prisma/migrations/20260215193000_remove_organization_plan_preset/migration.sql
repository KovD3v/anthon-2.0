-- Drop plan preset from organization contracts; limits and model tier remain the source of truth.
DROP INDEX IF EXISTS "OrganizationContract_planPreset_idx";
ALTER TABLE "OrganizationContract" DROP COLUMN IF EXISTS "planPreset";
DROP TYPE IF EXISTS "OrganizationPlanPreset";
