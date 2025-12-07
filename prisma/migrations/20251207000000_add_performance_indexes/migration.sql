-- P0 Performance Indexes Migration
-- Purpose: Add critical missing indexes for query optimization

-- 1. Add index on Message.externalMessageId for deduplication checks
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'Message') THEN
        CREATE INDEX IF NOT EXISTS "Message_externalMessageId_idx" ON "Message"("externalMessageId");
        COMMENT ON INDEX "Message_externalMessageId_idx" IS 'Optimize duplicate message detection';
        
        CREATE INDEX IF NOT EXISTS "Message_role_createdAt_idx" ON "Message"("role", "createdAt");
        COMMENT ON INDEX "Message_role_createdAt_idx" IS 'Optimize filtering messages by role (e.g., ASSISTANT only)';
    END IF;
END $$;

-- 2. Add index on ChannelIdentity.userId for reverse lookups
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'ChannelIdentity') THEN
        CREATE INDEX IF NOT EXISTS "ChannelIdentity_userId_idx" ON "ChannelIdentity"("userId");
        COMMENT ON INDEX "ChannelIdentity_userId_idx" IS 'Optimize reverse lookups from user to channel identities';
    END IF;
END $$;

-- 3. Add index on Artifact.messageId for message → artifact lookups (only if table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'Artifact') THEN
        CREATE INDEX IF NOT EXISTS "Artifact_messageId_idx" ON "Artifact"("messageId");
        COMMENT ON INDEX "Artifact_messageId_idx" IS 'Optimize finding artifacts for a specific message';
    END IF;
END $$;

-- 4. Add indexes on Subscription (only if table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'Subscription') THEN
        CREATE INDEX IF NOT EXISTS "Subscription_trialEndsAt_idx" ON "Subscription"("trialEndsAt");
        COMMENT ON INDEX "Subscription_trialEndsAt_idx" IS 'Optimize finding expiring trials for notifications';
        
        CREATE INDEX IF NOT EXISTS "Subscription_userId_status_idx" ON "Subscription"("userId", "status");
        COMMENT ON INDEX "Subscription_userId_status_idx" IS 'Optimize user subscription status queries';
    END IF;
END $$;
