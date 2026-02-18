/**
 * Rate Limit Module — barrel re-export.
 *
 * All existing `import { ... } from "@/lib/rate-limit"` imports continue
 * to work unchanged because Next.js resolves this directory index file.
 */

// Limit checking
export { checkRateLimit } from "./check";

// Config & plan resolution
export {
  ATTACHMENT_RETENTION_DAYS,
  getAttachmentRetentionDays,
  getRateLimitsForUser,
} from "./config";
// Types
export type {
  DailyUsageData,
  RateLimitResult,
  RateLimits,
  UpgradeInfo,
} from "./types";
// Usage tracking
export { getDailyUsage, incrementUsage } from "./usage";
