CREATE TYPE "AiTraceAccessPurpose" AS ENUM (
    'DEBUGGING',
    'USER_SUPPORT',
    'SAFETY_ABUSE_INVESTIGATION'
);

ALTER TABLE "AiTraceAccessAudit"
    ADD COLUMN "purpose" "AiTraceAccessPurpose",
    ADD COLUMN "reason" TEXT,
    ADD COLUMN "caseId" TEXT;
