-- Remove legacy proactive-notification tables that are no longer represented
-- in the Prisma schema or used by runtime code.
DROP TABLE IF EXISTS "ScheduledNotification";
DROP TABLE IF EXISTS "PushSubscription";

-- Remove redundant indexes that are covered by existing unique constraints.
DROP INDEX IF EXISTS "User_email_idx";
DROP INDEX IF EXISTS "Memory_userId_key_idx";
DROP INDEX IF EXISTS "DailyUsage_userId_date_idx";
