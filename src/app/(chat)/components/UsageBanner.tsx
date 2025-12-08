"use client";

import {
  AlertCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DailyUsage, RateLimits } from "@/types/chat";

interface UsageBannerProps {
  /**
   * Current daily usage stats
   */
  usage?: DailyUsage | null;
  /**
   * Rate limits for the user's tier
   */
  limits?: RateLimits | null;
  /**
   * User's subscription status
   */
  subscriptionStatus?: "TRIAL" | "ACTIVE" | "CANCELLED" | "EXPIRED" | null;
  /**
   * Optional class name
   */
  className?: string;
}

/**
 * Banner showing daily usage statistics and rate limit warnings
 */
export function UsageBanner({
  usage,
  limits,
  subscriptionStatus,
  className,
}: UsageBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [countdown, setCountdown] = useState("");

  // Calculate and update countdown to midnight
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const msRemaining = tomorrow.getTime() - now.getTime();
      const hours = Math.floor(msRemaining / (1000 * 60 * 60));
      const minutes = Math.floor(
        (msRemaining % (1000 * 60 * 60)) / (1000 * 60),
      );

      if (hours > 0) {
        setCountdown(`${hours}h ${minutes}m`);
      } else {
        setCountdown(`${minutes}m`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Reset dismissal at midnight
  useEffect(() => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    const timeout = setTimeout(() => {
      setIsDismissed(false);
    }, msUntilMidnight);

    return () => clearTimeout(timeout);
  }, []);

  if (isDismissed || !usage || !limits) return null;

  const requestPercent =
    limits.maxRequests > 0
      ? (usage.requestCount / limits.maxRequests) * 100
      : 0;
  const tokenPercent =
    limits.maxInputTokens + limits.maxOutputTokens > 0
      ? ((usage.inputTokens + usage.outputTokens) /
          (limits.maxInputTokens + limits.maxOutputTokens)) *
        100
      : 0;
  const costPercent =
    limits.maxCostUsd > 0 ? (usage.totalCostUsd / limits.maxCostUsd) * 100 : 0;

  const maxPercent = Math.max(requestPercent, tokenPercent, costPercent);

  // Only show if approaching limits (>70%)
  if (maxPercent < 70) return null;

  const isAtLimit = maxPercent >= 100;
  const isNearLimit = maxPercent >= 90;

  const getBannerStyle = () => {
    if (isAtLimit) {
      return "bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200";
    }
    if (isNearLimit) {
      return "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-200";
    }
    return "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-200";
  };

  const getIcon = () => {
    if (isAtLimit) return <AlertCircle className="h-4 w-4" />;
    if (isNearLimit) return <AlertTriangle className="h-4 w-4" />;
    return <TrendingUp className="h-4 w-4" />;
  };

  const getMessage = () => {
    if (isAtLimit) {
      return countdown
        ? `Limite raggiunto. Reset tra ${countdown}.`
        : "Limite raggiunto. Reset a mezzanotte.";
    }
    if (isNearLimit) {
      return `Sei al ${Math.round(maxPercent)}% del limite giornaliero.`;
    }
    return `Hai usato il ${Math.round(maxPercent)}% del limite giornaliero.`;
  };

  const getTierName = () => {
    if (subscriptionStatus === "ACTIVE") return "Pro";
    return "Free";
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border px-4 py-3",
        getBannerStyle(),
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {getIcon()}
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium">{getMessage()}</p>
          <p className="text-xs opacity-75">
            {getTierName()}: {usage.requestCount}/{limits.maxRequests} messaggi
            scritti oggi
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {subscriptionStatus !== "ACTIVE" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs font-medium"
            onClick={() => {
              window.location.href = "/pricing";
            }}
          >
            <Zap className="mr-1 h-3 w-3" />
            Upgrade
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setIsDismissed(true)}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Compact usage stats for sidebars or footers
 */
export function UsageStats({
  usage,
  limits,
  className,
}: Omit<UsageBannerProps, "subscriptionStatus">) {
  if (!usage || !limits) return null;

  const requestPercent = Math.min(
    (usage.requestCount / limits.maxRequests) * 100,
    100,
  );

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>Today&apos;s usage</span>
        </div>
        <span>
          {usage.requestCount}/{limits.maxRequests} requests
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full transition-all duration-300",
            requestPercent >= 90
              ? "bg-red-500"
              : requestPercent >= 70
                ? "bg-yellow-500"
                : "bg-primary",
          )}
          style={{ width: `${requestPercent}%` }}
        />
      </div>

      {/* Token and cost info */}
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>
          {((usage.inputTokens + usage.outputTokens) / 1000).toFixed(1)}k tokens
        </span>
        <span>${usage.totalCostUsd.toFixed(4)}</span>
      </div>
    </div>
  );
}

/**
 * Rate limit error display
 */
export function RateLimitError({
  reason,
  onDismiss,
  className,
}: {
  reason: string;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 text-red-500" />
        <div className="flex-1">
          <h4 className="font-medium text-red-800 dark:text-red-200">
            Limite raggiunto
          </h4>
          <p className="mt-1 text-sm text-red-700 dark:text-red-300">
            {reason}
          </p>
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            Il tuo utilizzo si azzererà a mezzanotte. Considera di effettuare
            l'upgrade per limiti più alti.
          </p>
        </div>
        {onDismiss && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-red-500"
            onClick={onDismiss}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
