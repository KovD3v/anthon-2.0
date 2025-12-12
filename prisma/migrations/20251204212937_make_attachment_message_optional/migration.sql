/*
 NOTE: This migration was made resilient to out-of-order table creation.
 Some environments create Artifact/Chat in later migrations; shadow DB applies
 migrations from scratch and would otherwise fail.
 */
DO $$
BEGIN
  IF NOT EXISTS(
    SELECT
      1
    FROM
      pg_type
    WHERE
      typname = 'ChatVisibility') THEN
  CREATE TYPE "ChatVisibility" AS ENUM(
    'PRIVATE',
    'PUBLIC'
);
END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS(
    SELECT
      1
    FROM
      pg_type
    WHERE
      typname = 'ArtifactKind') THEN
  CREATE TYPE "ArtifactKind" AS ENUM(
    'CODE',
    'TEXT',
    'SHEET',
    'IMAGE'
);
END IF;
END
$$;

-- Artifact may not exist yet (introduced later)
ALTER TABLE IF EXISTS "Artifact"
  DROP COLUMN IF EXISTS "kind",
  ADD COLUMN IF NOT EXISTS "kind" "ArtifactKind";

-- Attachment may not exist yet (introduced later)
ALTER TABLE IF EXISTS "Attachment"
  ALTER COLUMN "messageId" DROP NOT NULL;

-- Chat may not exist yet (introduced later)
ALTER TABLE IF EXISTS "Chat"
  DROP COLUMN IF EXISTS "visibility",
  ADD COLUMN IF NOT EXISTS "visibility" "ChatVisibility" NOT NULL DEFAULT 'PRIVATE';

-- Message may not exist yet (introduced later)
ALTER TABLE IF EXISTS "Message"
  ADD COLUMN IF NOT EXISTS "inputTokens" integer,
  ADD COLUMN IF NOT EXISTS "ragChunksCount" integer,
  ADD COLUMN IF NOT EXISTS "ragUsed" boolean;

