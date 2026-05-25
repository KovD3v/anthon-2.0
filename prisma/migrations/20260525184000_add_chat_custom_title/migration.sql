-- Add the Chat.customTitle column used by chat creation and rename logic.
ALTER TABLE "Chat"
ADD COLUMN IF NOT EXISTS "customTitle" BOOLEAN NOT NULL DEFAULT false;
