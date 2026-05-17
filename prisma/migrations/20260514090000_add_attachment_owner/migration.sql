-- Add explicit upload ownership so unattached files do not rely on blob path parsing.
ALTER TABLE "Attachment" ADD COLUMN "userId" TEXT;

UPDATE "Attachment" AS a
SET "userId" = m."userId"
FROM "Message" AS m
WHERE a."messageId" = m.id
  AND a."userId" IS NULL;

ALTER TABLE "Attachment"
ADD CONSTRAINT "Attachment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Attachment_userId_idx" ON "Attachment"("userId");
