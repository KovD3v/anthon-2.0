"use client";

import { Loader2 } from "lucide-react";
import { BenchmarkCategory } from "@/generated/prisma";
import { AVAILABLE_MODELS as LIB_AVAILABLE_MODELS } from "@/lib/benchmark/constants";
import type {
  BenchmarkCategory as CategoryType,
  ToolUsageCritique as LibToolUsageCritique,
  WritingQualityCritique as LibWritingQualityCritique,
  TestCase,
  TestCaseSetup,
} from "@/lib/benchmark/types";
import { cn } from "@/lib/utils";

// ============================================================================
// Types & Interfaces
// ============================================================================

export { BenchmarkCategory };
export type {
  TestCase,
  TestCaseSetup,
  LibToolUsageCritique,
  LibWritingQualityCritique,
};

export interface Dataset {
  testCases: Array<{
    id: string;
    name: string;
    userMessage: string;
    category: string;
    setup?: TestCaseSetup;
  }>;
}

export interface BenchmarkRun {
  id: string;
  name: string;
  description?: string;
  models: string[];
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  startedAt?: string;
  endedAt?: string;
  approved?: boolean;
  createdAt: string;
  _count?: { results: number };
}

export interface ModelScore {
  modelId: string;
  testCount: number;
  avgOverallScore: number;
  avgJudge1Score: number;
  avgJudge2Score: number | null;
  avgConsensusScore: number | null;
  flaggedForReviewCount: number;
  avgInferenceTimeMs: number;
  avgTtftMs: number | null;
  avgCostUsd: number;
  avgToolUsageScore: number | null;
  avgWritingQualityScore: number | null;
  reliability: number;
  variance: number;
  reasoningEfficiency: number | null;
  tokenEfficiencyIndex: number | null;
  totalCostUsd: number;
}

export interface BenchmarkResult {
  id: string;
  testCaseId: string;
  category: CategoryType;
  modelId: string;
  inferenceTimeMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  responseText: string;
  toolCalls?: Array<{ name: string; args: unknown; result?: unknown }>;
  toolUsageScore?: number;
  toolUsageReasoning?: string;
  writingQualityScore?: number;
  writingQualityReasoning?: string;
  overallScore: number;
  ttftMs: number | null;
  reasoningTokens: number | null;
  adminScore?: number;
  adminReasoning?: string;
  finalScore?: number;
  memoriesUsed?: string[];
  sessionUsed?: { messageCount: number; sessions: number };
  judge2OverallScore?: number;
  judge2ToolUsageScore?: number;
  judge2ToolUsageReasoning?: string;
  judge2WritingQualityScore?: number;
  judge2WritingQualityReasoning?: string;
  consensusScore?: number;
  judgeDisagreement?: number;
  flaggedForReview?: boolean;
  toolUsageCritique?: LibToolUsageCritique;
  writingQualityCritique?: LibWritingQualityCritique;
  judge2ToolUsageCritique?: LibToolUsageCritique;
  judge2WritingQualityCritique?: LibWritingQualityCritique;
}

export type BenchmarkTestCase = TestCase;

// ============================================================================
// Constants
// ============================================================================

export const AVAILABLE_MODELS = LIB_AVAILABLE_MODELS;

// ============================================================================
// Helper Components
// ============================================================================

export function StatusBadge({
  status,
  small,
}: {
  status: string;
  small?: boolean;
}) {
  const config = {
    PENDING: {
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    },
    RUNNING: {
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
      animate: true,
    },
    COMPLETED: {
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
    },
    FAILED: {
      color: "text-rose-500",
      bg: "bg-rose-500/10",
      border: "border-rose-500/20",
    },
  }[status] || {
    color: "text-muted-foreground",
    bg: "bg-muted",
    border: "border-transparent",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium border",
        config.color,
        config.bg,
        config.border,
        small ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2.5 py-0.5",
        config.animate && "animate-pulse",
      )}
    >
      {status === "RUNNING" && (
        <Loader2 className="h-2 w-2 animate-spin mr-1.5" />
      )}
      {small ? status[0] : status}
    </span>
  );
}

export function ScoreBadge({
  score,
  large,
}: {
  score: number;
  large?: boolean;
}) {
  const color =
    score >= 8
      ? "text-emerald-500 bg-emerald-500/10"
      : score >= 6
        ? "text-amber-500 bg-amber-500/10"
        : "text-rose-500 bg-rose-500/10";

  return (
    <span
      className={cn(
        "font-bold rounded",
        color,
        large ? "text-sm px-2 py-1" : "text-xs px-1.5 py-0.5",
      )}
    >
      {(score || 0).toFixed(1)}
    </span>
  );
}
