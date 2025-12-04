"use client";

import { Brain, AlertTriangle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContextIndicatorProps {
  /**
   * Percentage of context window used (0-100)
   */
  percentUsed: number;
  /**
   * Whether the context is near the limit (>75%)
   */
  isNearLimit?: boolean;
  /**
   * Optional class name for styling
   */
  className?: string;
  /**
   * Show detailed text (default: false for compact display)
   */
  showDetails?: boolean;
}

/**
 * Visual indicator for context window usage
 * Shows a progress bar and percentage of context used
 */
export function ContextIndicator({
  percentUsed,
  isNearLimit,
  className,
  showDetails = false,
}: ContextIndicatorProps) {
  // Determine color based on usage
  const getColorClass = () => {
    if (percentUsed >= 90) return "bg-red-500";
    if (percentUsed >= 75 || isNearLimit) return "bg-yellow-500";
    if (percentUsed >= 50) return "bg-blue-500";
    return "bg-green-500";
  };

  const getTextColorClass = () => {
    if (percentUsed >= 90) return "text-red-500";
    if (percentUsed >= 75 || isNearLimit) return "text-yellow-500";
    return "text-muted-foreground";
  };

  const getStatusIcon = () => {
    if (percentUsed >= 90) {
      return <AlertCircle className="h-3 w-3" />;
    }
    if (percentUsed >= 75 || isNearLimit) {
      return <AlertTriangle className="h-3 w-3" />;
    }
    return <Brain className="h-3 w-3" />;
  };

  const getStatusText = () => {
    if (percentUsed >= 90) {
      return "Context nearly full - older messages may be summarized";
    }
    if (percentUsed >= 75 || isNearLimit) {
      return "Approaching context limit";
    }
    return "Context available";
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Icon */}
      <span className={getTextColorClass()}>{getStatusIcon()}</span>

      {/* Progress bar */}
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full transition-all duration-300", getColorClass())}
          style={{ width: `${Math.min(percentUsed, 100)}%` }}
        />
      </div>

      {/* Percentage */}
      <span className={cn("text-xs font-medium", getTextColorClass())}>
        {Math.round(percentUsed)}%
      </span>

      {/* Detailed text */}
      {showDetails && (
        <span className={cn("text-xs", getTextColorClass())}>
          {getStatusText()}
        </span>
      )}
    </div>
  );
}

/**
 * Compact context badge for use in headers or sidebars
 */
export function ContextBadge({
  percentUsed,
  isNearLimit,
  className,
}: Omit<ContextIndicatorProps, "showDetails">) {
  const getColorClass = () => {
    if (percentUsed >= 90)
      return "bg-red-500/10 text-red-500 border-red-500/20";
    if (percentUsed >= 75 || isNearLimit)
      return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    return "bg-muted text-muted-foreground";
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        getColorClass(),
        className
      )}
    >
      <Brain className="h-3 w-3" />
      {Math.round(percentUsed)}%
    </span>
  );
}
