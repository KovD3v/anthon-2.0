-- Existing beta configurations were active before this flag existed.
ALTER TABLE "BetaAccessConfig"
ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;

-- A newly created configuration must opt in explicitly.
ALTER TABLE "BetaAccessConfig"
ALTER COLUMN "enabled" SET DEFAULT false;
