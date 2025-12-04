-- Migration: Add Chat model and restructure Message for multi-chat support
-- Purpose: Enable multiple conversations per user with chat titles, visibility settings, and message parts format
-- -----------------------------------------------------
-- 1. CREATE CHAT TABLE
-- -----------------------------------------------------
CREATE TABLE "Chat"(
    "id" text NOT NULL,
    "userId" text NOT NULL,
    "title" text,
    "visibility" text NOT NULL DEFAULT 'private',
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) NOT NULL,
    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- Add foreign key to User
ALTER TABLE "Chat"
    ADD CONSTRAINT "Chat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Index for efficient queries
CREATE INDEX "Chat_userId_createdAt_idx" ON "Chat"("userId", "createdAt" DESC);

-- -----------------------------------------------------
-- 2. ADD CHAT REFERENCE TO MESSAGE
-- -----------------------------------------------------
-- Add chatId column (nullable initially for backward compatibility during migration)
ALTER TABLE "Message"
    ADD COLUMN "chatId" text;

-- Add foreign key constraint
ALTER TABLE "Message"
    ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create index for chat-based queries
CREATE INDEX "Message_chatId_createdAt_idx" ON "Message"("chatId", "createdAt");

-- -----------------------------------------------------
-- 3. ADD PARTS COLUMN FOR AI SDK MESSAGE FORMAT
-- -----------------------------------------------------
-- Add parts column for storing message parts (text, tool calls, tool results, etc.)
-- This follows AI SDK v5 format: { type: 'text', text: '...' } or { type: 'tool-call', ... }
ALTER TABLE "Message"
    ADD COLUMN "parts" jsonb;

-- Note: The 'content' column is kept for backward compatibility and simple text extraction
-- The 'parts' column should be the source of truth for complex messages
-- -----------------------------------------------------
-- 4. COMMENTS FOR DOCUMENTATION
-- -----------------------------------------------------
COMMENT ON TABLE "Chat" IS 'Conversation sessions - each chat contains multiple messages';

COMMENT ON COLUMN "Chat"."visibility" IS 'Access level: private (user only) or public (shareable)';

COMMENT ON COLUMN "Chat"."title" IS 'Auto-generated or user-provided title for the conversation';

COMMENT ON COLUMN "Message"."parts" IS 'AI SDK v5 message parts format - supports text, tool calls, tool results, etc.';

COMMENT ON COLUMN "Message"."chatId" IS 'Reference to parent chat conversation';

