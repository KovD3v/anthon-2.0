CREATE TYPE "CapabilityPlannerMode" AS ENUM ('legacy', 'agentic');

ALTER TABLE "ModelExperimentPair"
ADD COLUMN "capabilityPlannerMode" "CapabilityPlannerMode" NOT NULL DEFAULT 'legacy';
