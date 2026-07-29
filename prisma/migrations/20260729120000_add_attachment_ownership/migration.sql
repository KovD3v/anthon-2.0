-- Attach durable ownership to every attachment. Existing rows are backfilled
-- only from authoritative message ownership or the exact user-scoped pathname
-- emitted by the upload route. The migration aborts rather than guessing.
ALTER TABLE "Attachment"
  ADD COLUMN "userId" TEXT;

UPDATE "Attachment" AS attachment
SET "userId" = message."userId"
FROM "Message" AS message
WHERE attachment."messageId" = message."id"
  AND attachment."userId" IS NULL;

UPDATE "Attachment" AS attachment
SET "userId" = app_user."id"
FROM "User" AS app_user
WHERE attachment."messageId" IS NULL
  AND attachment."userId" IS NULL
  AND (
    attachment."blobUrl" LIKE (
      '%/uploads/' || app_user."id" || '/%'
    )
    OR attachment."blobUrl" LIKE (
      '%/attachments/' || app_user."id" || '/%'
    )
  );

DO $$
DECLARE
  unmatched_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO unmatched_count
  FROM "Attachment"
  WHERE "userId" IS NULL;

  IF unmatched_count > 0 THEN
    RAISE EXCEPTION
      'Attachment ownership backfill failed: % row(s) remain unmapped',
      unmatched_count;
  END IF;
END
$$;

ALTER TABLE "Attachment"
  ALTER COLUMN "userId" SET NOT NULL;

CREATE INDEX "Attachment_userId_idx"
  ON "Attachment"("userId");

ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
