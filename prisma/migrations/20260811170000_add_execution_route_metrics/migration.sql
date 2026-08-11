ALTER TABLE "MessageMetrics"
ADD COLUMN "executionRoute" JSONB;

ALTER TABLE "ModelExperimentPair"
ADD COLUMN "turnDecision" JSONB;
