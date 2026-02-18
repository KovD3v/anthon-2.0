/**
 * Rate Limit Module — shared types.
 */

import type { EffectiveEntitlements } from "@/lib/organizations/types";

export interface RateLimits {
  maxRequestsPerDay: number;
  maxInputTokensPerDay: number;
  maxOutputTokensPerDay: number;
  maxCostPerDay: number; // USD
  maxContextMessages: number; // Session message cap
}

export interface DailyUsageData {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
}

export interface UpgradeInfo {
  currentPlan: string;
  suggestedPlan: string;
  upgradeUrl: string;
  ctaMessage: string;
  limitType?: "requests" | "tokens" | "cost" | "general";
  headline?: string;
  primaryCta?: {
    label: string;
    url: string;
    intent: "signup" | "upgrade";
  };
  secondaryCta?: {
    label: string;
    url: string;
  };
}

export interface RateLimitResult {
  allowed: boolean;
  usage: DailyUsageData;
  limits: RateLimits;
  reason?: string;
  percentUsed: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };
  upgradeInfo?: UpgradeInfo | null;
  entitlements?: {
    modelTier: string;
    sources: Array<{
      type: "personal" | "organization";
      sourceId: string;
      sourceLabel: string;
    }>;
  };
  effectiveEntitlements?: EffectiveEntitlements;
}
