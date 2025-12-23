"use client";

import { motion } from "framer-motion";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Coins,
  Database,
  Eye,
  FileJson,
  FlaskConical,
  Gauge,
  Loader2,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  Trophy,
  User,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { Prisma } from "@/generated/prisma";
// Static dataset for user prompts (loaded at build time)
import datasetJson from "@/lib/benchmark/dataset.json";
import type {
  TestCaseSetup,
  ToolUsageCritique,
  WritingQualityCritique,
} from "@/lib/benchmark/types";
import { cn } from "@/lib/utils";

const dataset = datasetJson as unknown as Dataset;

interface Dataset {
  testCases: Array<{
    id: string;
    name: string;
    userMessage: string;
    category: string;
    setup?: {
      session?: Array<{ role: string; content: string }>;
      memories?: Array<{ key: string; value: string }>;
      userContext?: {
        profile?: Record<string, string | null>;
        preferences?: Record<string, string | null>;
      };
    };
  }>;
}

interface BenchmarkRun {
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

interface ModelScore {
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

interface BenchmarkResult {
  id: string;
  testCaseId: string;
  category: string;
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
  // Session and memories context
  memoriesUsed?: string[];
  sessionUsed?: { messageCount: number; sessions: number };
  // Multi-judge consensus fields
  judge2OverallScore?: number;
  judge2ToolUsageScore?: number;
  judge2ToolUsageReasoning?: string;
  judge2WritingQualityScore?: number;
  judge2WritingQualityReasoning?: string;
  consensusScore?: number;
  judgeDisagreement?: number;
  flaggedForReview?: boolean;
  toolUsageCritique?: ToolUsageCritique;
  writingQualityCritique?: WritingQualityCritique;
  judge2ToolUsageCritique?: ToolUsageCritique;
  judge2WritingQualityCritique?: WritingQualityCritique;
}

// Available models for benchmarking
const AVAILABLE_MODELS = [
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite-preview-09-2025",
  "google/gemini-2.0-flash-001",
  // "google/gemini-2.0-flash-lite-001",
  // "xiaomi/mimo-v2-flash:free",
  // "x-ai/grok-4-fast",
  // "x-ai/grok-4.1-fast",
  "openai/gpt-oss-120b",
];

export default function BenchmarkPage() {
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<BenchmarkRun | null>(null);
  const [modelScores, setModelScores] = useState<ModelScore[]>([]);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [_error, setError] = useState<string | null>(null);

  // Navigation state
  const [selectedTestCaseId, setSelectedTestCaseId] = useState<string | null>(
    null,
  );
  const [_selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedResult, setSelectedResult] = useState<BenchmarkResult | null>(
    null,
  );

  // Sidebar state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Benchmark config state
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedTests, setSelectedTests] = useState<Set<string>>(new Set());
  const [selectedModels, setSelectedModels] = useState<Set<string>>(
    new Set(AVAILABLE_MODELS),
  );

  // Result filtering state
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"SCORE" | "LATENCY" | "COST">("SCORE");
  const [leaderboardMetric, setLeaderboardMetric] = useState<
    "SCORE" | "SPEED" | "COST"
  >("SCORE");

  // Live progress state
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    completed: number;
    total: number;
    status: string;
    currentProgress?: {
      testCaseId: string;
      modelId: string;
      startedAt: string;
    };
  } | null>(null);

  // Test Case Management state
  const [manageDatasetsOpen, setManageDatasetsOpen] = useState(false);
  const [dbTestCases, setDbTestCases] = useState<
    Prisma.BenchmarkTestCaseGetPayload<Record<string, never>>[]
  >([]);
  const [testCaseFormOpen, setTestCaseFormOpen] = useState(false);
  const [editingTestCase, setEditingTestCase] =
    useState<Prisma.BenchmarkTestCaseGetPayload<Record<string, never>> | null>(
      null,
    );
  const [activeDatasetTab, setActiveDatasetTab] = useState<
    "ALL" | "ADVERSARIAL"
  >("ALL");
  const [pendingAdversarial, setPendingAdversarial] = useState<
    Prisma.BenchmarkTestCaseGetPayload<Record<string, never>>[]
  >([]);
  const [generatingAdversarial, setGeneratingAdversarial] = useState(false);

  // Blind A/B Testing state
  const [blindModeEnabled, setBlindModeEnabled] = useState(false);
  const [blindComparisonOpen, setBlindComparisonOpen] = useState(false);
  const [blindPair, setBlindPair] = useState<{
    resultA: BenchmarkResult;
    resultB: BenchmarkResult;
    randomizedOrder: [string, string]; // [modelIdForA, modelIdForB]
    testCaseId: string;
  } | null>(null);
  const [blindScores, setBlindScores] = useState<{
    preference: "A" | "B" | "both_good" | "both_bad" | null;
    starA: boolean;
    starB: boolean;
    tomatoA: boolean;
    tomatoB: boolean;
  }>({
    preference: null,
    starA: false,
    starB: false,
    tomatoA: false,
    tomatoB: false,
  });
  const [modelsRevealed, setModelsRevealed] = useState(false);

  const testCaseIds = [...new Set(results.map((r) => r.testCaseId))];
  const _modelIds = [...new Set(results.map((r) => r.modelId))];

  // Filtering and grouping logic
  const filteredRuns = useMemo(() => {
    return runs.filter(
      (run) =>
        run.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        run.models.some((m) =>
          m.toLowerCase().includes(searchQuery.toLowerCase()),
        ),
    );
  }, [runs, searchQuery]);

  const groupedRuns = useMemo(() => {
    const groups: Record<string, BenchmarkRun[]> = {
      Today: [],
      Yesterday: [],
      "Last 7 Days": [],
      Older: [],
    };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    filteredRuns.forEach((run) => {
      const date = new Date(run.createdAt);
      if (date >= today) {
        groups.Today.push(run);
      } else if (date >= yesterday) {
        groups.Yesterday.push(run);
      } else if (date >= lastWeek) {
        groups["Last 7 Days"].push(run);
      } else {
        groups.Older.push(run);
      }
    });

    return Object.entries(groups).filter(
      ([_, groupRuns]) => groupRuns.length > 0,
    );
  }, [filteredRuns]);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/benchmark");
      if (!res.ok) throw new Error("Failed to fetch benchmark runs");
      const data = await res.json();
      setRuns(data.runs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRunDetails = useCallback(async (runId: string) => {
    try {
      const res = await fetch(`/api/admin/benchmark?runId=${runId}`);
      if (!res.ok) throw new Error("Failed to fetch run details");
      const data = await res.json();
      setSelectedRun(data.run);
      setModelScores(data.modelScores || []);
      setResults(data.run?.results || []);
      // Auto-select first test case and model
      if (data.run?.results?.length > 0) {
        const firstResult = data.run.results[0];
        setSelectedTestCaseId(firstResult.testCaseId);
        setSelectedModelId(null); // Show all models for this test
      }

      // If run is still running or pending, start polling
      if (data.run?.status === "RUNNING" || data.run?.status === "PENDING") {
        setActiveRunId(runId);
      } else {
        setActiveRunId(null);
        setProgress(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  }, []);

  const startBenchmark = async (options?: {
    testCaseIds?: string[];
    models?: string[];
    iterations?: number;
    concurrency?: number;
  }) => {
    setStarting(true);
    try {
      const res = await fetch("/api/admin/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testCaseIds: options?.testCaseIds,
          models: options?.models,
          iterations: options?.iterations || 1,
          concurrency: options?.concurrency || 10,
        }),
      });
      if (!res.ok) throw new Error("Failed to start benchmark");
      const data = await res.json();
      alert(`Benchmark started! Run ID: ${data.runId}`);
      fetchRuns();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to start benchmark");
    } finally {
      setStarting(false);
    }
  };

  const cancelBenchmark = async (runId: string) => {
    if (!confirm("Stop this benchmark run?")) return;
    try {
      const res = await fetch("/api/admin/benchmark", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, action: "cancel" }),
      });
      if (!res.ok) throw new Error("Failed to cancel benchmark");
      alert("Benchmark cancellation requested.");
      fetchRuns();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cancel benchmark");
    }
  };

  const fetchTestCases = useCallback(async () => {
    try {
      const res = await fetch(
        "/api/admin/benchmark/test-cases?activeOnly=false",
      );
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch test cases");
      }
      const data = await res.json();
      setDbTestCases(data.testCases || []);

      // Also fetch pending adversarial
      const advRes = await fetch("/api/admin/benchmark/adversarial");
      if (advRes.ok) {
        const advData = await advRes.json();
        setPendingAdversarial(advData.cases || []);
      }
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Failed to load test cases",
      );
    }
  }, []);

  const generateAdversarial = async () => {
    setGeneratingAdversarial(true);
    try {
      const res = await fetch("/api/admin/benchmark/adversarial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 3, autoSave: true }),
      });
      if (!res.ok) throw new Error("Failed to generate adversarial cases");
      alert("Generated 3 new adversarial cases for review.");
      fetchTestCases();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGeneratingAdversarial(false);
    }
  };

  const handleAdversarialAction = async (
    id: string,
    action: "approve" | "reject",
  ) => {
    try {
      const res = await fetch("/api/admin/benchmark/adversarial", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseId: id, action }),
      });
      if (!res.ok) throw new Error(`Failed to ${action}`);
      fetchTestCases();
      fetchRuns();
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to ${action}`);
    }
  };

  const exportResults = async (runId: string) => {
    window.open(`/api/admin/benchmark/export?runId=${runId}`, "_blank");
  };

  // Toggle helpers
  const toggleTest = (testId: string) => {
    setSelectedTests((prev) => {
      const next = new Set(prev);
      if (next.has(testId)) {
        next.delete(testId);
      } else {
        next.add(testId);
      }
      return next;
    });
  };

  const toggleModel = (modelId: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  };

  const selectAllTests = () => {
    setSelectedTests(new Set(dataset.testCases.map((tc) => tc.id)));
  };

  const clearAllTests = () => {
    setSelectedTests(new Set());
  };

  const deleteRun = async (runId: string) => {
    if (!confirm("Delete this benchmark run?")) return;
    try {
      const res = await fetch(`/api/admin/benchmark?runId=${runId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      if (selectedRun?.id === runId) {
        setSelectedRun(null);
        setResults([]);
        setModelScores([]);
      }
      fetchRuns();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const submitAdminScore = async (
    resultId: string,
    adminScore: number,
    adminReasoning: string,
  ) => {
    try {
      const res = await fetch("/api/admin/benchmark", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultId, adminScore, adminReasoning }),
      });
      if (!res.ok) throw new Error("Failed to submit");
      if (selectedRun) fetchRunDetails(selectedRun.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to submit");
    }
  };

  // Get results for current test case
  const currentTestResults = useMemo(() => {
    if (!selectedTestCaseId) return [];

    let filtered = results.filter((r) => r.testCaseId === selectedTestCaseId);

    if (filterCategory !== "ALL") {
      filtered = filtered.filter((r) => r.category === filterCategory);
    }

    return [...filtered].sort((a, b) => {
      if (sortBy === "SCORE")
        return (
          (b.finalScore ?? b.overallScore) - (a.finalScore ?? a.overallScore)
        );
      if (sortBy === "LATENCY") return a.inferenceTimeMs - b.inferenceTimeMs;
      if (sortBy === "COST") return (b.costUsd || 0) - (a.costUsd || 0);
      return 0;
    });
  }, [results, selectedTestCaseId, filterCategory, sortBy]);

  // Navigate between test cases
  const currentTestIndex = testCaseIds.indexOf(selectedTestCaseId || "");
  const goToPrevTest = () => {
    if (currentTestIndex > 0) {
      setSelectedTestCaseId(testCaseIds[currentTestIndex - 1]);
    }
  };
  const goToNextTest = () => {
    if (currentTestIndex < testCaseIds.length - 1) {
      setSelectedTestCaseId(testCaseIds[currentTestIndex + 1]);
    }
  };

  // Start a blind A/B comparison for the current test case
  const startBlindComparison = useCallback(() => {
    if (!selectedTestCaseId || currentTestResults.length < 2) return;

    // Pick two random results from different models
    const shuffled = [...currentTestResults].sort(() => Math.random() - 0.5);
    const [resultA, resultB] = shuffled.slice(0, 2);

    // Randomize which model is shown as A or B
    const shouldSwap = Math.random() > 0.5;

    setBlindPair({
      resultA: shouldSwap ? resultB : resultA,
      resultB: shouldSwap ? resultA : resultB,
      randomizedOrder: shouldSwap
        ? [resultB.modelId, resultA.modelId]
        : [resultA.modelId, resultB.modelId],
      testCaseId: selectedTestCaseId,
    });
    setBlindScores({
      preference: null,
      starA: false,
      starB: false,
      tomatoA: false,
      tomatoB: false,
    });
    setModelsRevealed(false);
    setBlindComparisonOpen(true);
  }, [selectedTestCaseId, currentTestResults]);

  // Submit blind comparison scores
  const submitBlindScores = async () => {
    if (!blindPair || !blindScores.preference) return;

    try {
      const preferenceLabel = {
        A: "A preferred",
        B: "B preferred",
        both_good: "Both good",
        both_bad: "Both bad",
      }[blindScores.preference];

      // Derive scores from preference (no manual scoring)
      let scoreA: number;
      let scoreB: number;
      switch (blindScores.preference) {
        case "A":
          scoreA = 8;
          scoreB = 4;
          break;
        case "B":
          scoreA = 4;
          scoreB = 8;
          break;
        case "both_good":
          scoreA = 8;
          scoreB = 8;
          break;
        case "both_bad":
          scoreA = 3;
          scoreB = 3;
          break;
      }

      // Apply star (+2) and tomato (-2) modifiers
      if (blindScores.starA) scoreA = Math.min(10, scoreA + 2);
      if (blindScores.tomatoA) scoreA = Math.max(1, scoreA - 2);
      if (blindScores.starB) scoreB = Math.min(10, scoreB + 2);
      if (blindScores.tomatoB) scoreB = Math.max(1, scoreB - 2);

      // Build modifier labels
      const modifiersA = [
        blindScores.starA && "⭐+2",
        blindScores.tomatoA && "🍅-2",
      ]
        .filter(Boolean)
        .join(" ");
      const modifiersB = [
        blindScores.starB && "⭐+2",
        blindScores.tomatoB && "🍅-2",
      ]
        .filter(Boolean)
        .join(" ");

      // Submit scores for both results
      await Promise.all([
        submitAdminScore(
          blindPair.resultA.id,
          scoreA,
          `Blind A/B comparison: ${preferenceLabel}${modifiersA ? ` (${modifiersA})` : ""}`,
        ),
        submitAdminScore(
          blindPair.resultB.id,
          scoreB,
          `Blind A/B comparison: ${preferenceLabel}${modifiersB ? ` (${modifiersB})` : ""}`,
        ),
      ]);

      // Reveal the models instead of closing immediately
      setModelsRevealed(true);

      // Refresh results
      if (selectedRun) fetchRunDetails(selectedRun.id);
    } catch (err) {
      console.error("Failed to submit blind scores:", err);
    }
  };

  // Close the blind comparison modal
  const closeBlindComparison = () => {
    setBlindComparisonOpen(false);
    setBlindPair(null);
    setModelsRevealed(false);
  };

  useEffect(() => {
    fetchRuns();
    fetchTestCases();
  }, [fetchRuns, fetchTestCases]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeRunId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(
            `/api/admin/benchmark/progress?runId=${activeRunId}`,
          );
          if (res.ok) {
            const data = await res.json();
            setProgress(data);
            if (data.status === "COMPLETED" || data.status === "FAILED") {
              setActiveRunId(null);
              fetchRuns();
              if (selectedRun?.id === activeRunId) {
                fetchRunDetails(activeRunId);
              }
            }
          }
        } catch (err) {
          console.error("Progress poll error:", err);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [activeRunId, selectedRun?.id, fetchRuns, fetchRunDetails]);

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-primary" />
            AI Benchmark
          </h1>
          <p className="text-sm text-muted-foreground">Compare AI models</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchRuns}
            className="bg-white/5 hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfigModalOpen(true)}
            disabled={starting}
            className="bg-amber-500/20 border-amber-500/30 text-amber-400 hover:bg-amber-500/30 hover:text-amber-300"
          >
            ⚙️ Config ({selectedTests.size || "all"} tests)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setManageDatasetsOpen(true)}
            className="bg-white/5 hover:bg-white/10"
          >
            📂 Datasets
          </Button>
          <Button
            variant={blindModeEnabled ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setBlindModeEnabled(!blindModeEnabled)}
            className={cn(
              "transition-colors",
              blindModeEnabled
                ? "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
                : "bg-white/5 hover:bg-white/10",
            )}
          >
            👁️ Blind Mode {blindModeEnabled ? "ON" : "OFF"}
          </Button>
          {blindModeEnabled && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModelsRevealed(!modelsRevealed)}
              className={cn(
                "transition-all",
                modelsRevealed
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10",
              )}
            >
              {modelsRevealed
                ? "🔓 Identities Revealed"
                : "🔒 Identities Masked"}
            </Button>
          )}
          <Button
            onClick={() => startBenchmark()}
            disabled={starting}
            size="sm"
          >
            {starting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Start All
          </Button>
        </div>
      </div>

      {/* Live Progress Bar */}
      {progress && progress.status === "RUNNING" && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium flex items-center gap-2 text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running Benchmark: {progress.completed} / {progress.total}
                </span>
                {progress.currentProgress && (
                  <span className="text-[10px] font-mono text-muted-foreground ml-6">
                    Active:{" "}
                    <span className="text-blue-400">
                      {progress.currentProgress.testCaseId}
                    </span>{" "}
                    on{" "}
                    <span className="text-purple-400">
                      {progress.currentProgress.modelId.split("/")[1]}
                    </span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs font-bold text-primary">
                  {Math.round((progress.completed / progress.total) * 100)}%
                </span>
                {activeRunId && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => cancelBenchmark(activeRunId)}
                    className="h-6 text-[10px] font-bold"
                  >
                    STOP
                  </Button>
                )}
              </div>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden shadow-inner">
              <motion.div
                className="bg-primary h-full shadow-[0_0_10px_rgba(var(--primary),0.5)]"
                initial={{ width: 0 }}
                animate={{
                  width: `${(progress.completed / progress.total) * 100}%`,
                }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex h-[calc(100vh-12rem)] gap-6">
        {/* Sidebar: Runs List */}
        <motion.div
          animate={{ width: isSidebarCollapsed ? 48 : 320 }}
          className="relative flex flex-col h-full shrink-0"
        >
          <Card className="h-full border-white/5 bg-background/40 flex flex-col overflow-hidden">
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
              {!isSidebarCollapsed && (
                <CardTitle className="text-sm">
                  Runs ({filteredRuns.length})
                </CardTitle>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="h-6 w-6 text-muted-foreground hover:bg-white/5"
              >
                {isSidebarCollapsed ? (
                  <PanelLeftOpen className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </Button>
            </CardHeader>
            {!isSidebarCollapsed && (
              <div className="px-4 pb-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search runs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-8 text-xs bg-white/5 border-white/10"
                  />
                </div>
              </div>
            )}
            <CardContent className="flex-1 overflow-y-auto space-y-4 p-2 custom-scrollbar">
              {isSidebarCollapsed ? (
                <div className="flex flex-col items-center gap-2 mt-2">
                  {filteredRuns.map((run) => (
                    <Button
                      key={run.id}
                      variant={selectedRun?.id === run.id ? "default" : "ghost"}
                      size="icon"
                      onClick={() => fetchRunDetails(run.id)}
                      className={cn(
                        "w-8 h-8",
                        selectedRun?.id !== run.id &&
                          "text-muted-foreground hover:bg-white/5",
                      )}
                      title={run.name}
                    >
                      <FlaskConical className="h-4 w-4" />
                    </Button>
                  ))}
                </div>
              ) : groupedRuns.length > 0 ? (
                groupedRuns.map(([label, groupRuns]) => (
                  <div key={label} className="space-y-1">
                    <div className="flex items-center gap-2 px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      <Calendar className="h-3 w-3" />
                      {label}
                    </div>
                    {groupRuns.map((run) => (
                      <div key={run.id} className="group relative">
                        <button
                          type="button"
                          className={cn(
                            "relative w-full text-left p-3 rounded-lg cursor-pointer transition-all",
                            selectedRun?.id === run.id
                              ? "bg-primary/10 border border-primary/20 ring-1 ring-primary/20"
                              : "hover:bg-white/5 border border-transparent",
                          )}
                          onClick={() => fetchRunDetails(run.id)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p
                                className={cn(
                                  "text-sm font-medium truncate mb-1",
                                  selectedRun?.id === run.id
                                    ? "text-primary"
                                    : "text-foreground",
                                )}
                              >
                                {run.name}
                              </p>
                              <div className="flex flex-wrap gap-1 mb-2">
                                {run.models.slice(0, 2).map((m) => (
                                  <span
                                    key={m}
                                    className="text-[9px] bg-white/5 px-1.5 py-0.5 rounded text-muted-foreground"
                                  >
                                    {m.split("/")[1]}
                                  </span>
                                ))}
                                {run.models.length > 2 && (
                                  <span className="text-[9px] text-muted-foreground">
                                    +{run.models.length - 2}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span>
                                  {new Date(run.createdAt).toLocaleTimeString(
                                    [],
                                    { hour: "2-digit", minute: "2-digit" },
                                  )}
                                </span>
                                {run._count?.results && (
                                  <>
                                    <span>•</span>
                                    <span>{run._count.results} results</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2 pr-6">
                              <StatusBadge status={run.status} small />
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteRun(run.id);
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 text-destructive flex items-center justify-center rounded-lg transition-all"
                          title="Delete run"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Search className="h-8 w-8 mb-2 opacity-20" />
                  <p className="text-xs">No runs found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Main Content */}
        <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar pr-2">
          {selectedRun ? (
            <>
              {/* Model Leaderboard */}
              {modelScores.length > 0 && (
                <Card className="border-white/5 bg-background/40">
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-amber-500" />
                        Leaderboard
                      </CardTitle>
                      <div className="flex bg-white/5 rounded-lg p-0.5 gap-0.5">
                        <Button
                          variant={
                            leaderboardMetric === "SCORE" ? "default" : "ghost"
                          }
                          size="sm"
                          onClick={() => setLeaderboardMetric("SCORE")}
                          className="h-6 text-[10px] px-2"
                        >
                          <Star className="h-3 w-3 mr-1" /> Score
                        </Button>
                        <Button
                          variant={
                            leaderboardMetric === "SPEED" ? "default" : "ghost"
                          }
                          size="sm"
                          onClick={() => setLeaderboardMetric("SPEED")}
                          className="h-6 text-[10px] px-2"
                        >
                          <Gauge className="h-3 w-3 mr-1" /> Speed
                        </Button>
                        <Button
                          variant={
                            leaderboardMetric === "COST" ? "default" : "ghost"
                          }
                          size="sm"
                          onClick={() => setLeaderboardMetric("COST")}
                          className="h-6 text-[10px] px-2"
                        >
                          <Coins className="h-3 w-3 mr-1" /> Cost
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {modelScores
                        .sort((a, b) => {
                          if (leaderboardMetric === "SPEED")
                            return a.avgInferenceTimeMs - b.avgInferenceTimeMs;
                          if (leaderboardMetric === "COST")
                            return a.avgCostUsd - b.avgCostUsd;
                          return b.avgOverallScore - a.avgOverallScore;
                        })
                        .map((score, i) => (
                          <div
                            key={score.modelId}
                            className={cn(
                              "shrink-0 p-3 rounded-lg border text-left min-w-[180px]",
                              i === 0
                                ? "border-amber-500/30 bg-amber-500/10"
                                : "border-white/5 bg-white/5",
                            )}
                          >
                            <div className="text-xs font-medium mb-1 truncate">
                              {i === 0 && "🥇 "}
                              {i === 1 && "🥈 "}
                              {i === 2 && "🥉 "}
                              {blindModeEnabled
                                ? `Model #${i + 1}`
                                : score.modelId.split("/")[1]}
                            </div>
                            <div className="flex flex-col gap-1 mb-3">
                              {leaderboardMetric === "SCORE" && (
                                <>
                                  <div className="flex items-end justify-between">
                                    <span className="text-2xl font-bold">
                                      {score.avgOverallScore.toFixed(1)}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground mb-1 uppercase tracking-tighter">
                                      Avg Score
                                    </span>
                                  </div>
                                  <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{
                                        width: `${score.avgOverallScore * 10}%`,
                                      }}
                                      className={cn(
                                        "h-full",
                                        score.avgOverallScore >= 8
                                          ? "bg-emerald-500"
                                          : score.avgOverallScore >= 6
                                            ? "bg-amber-500"
                                            : "bg-red-500",
                                      )}
                                    />
                                  </div>
                                </>
                              )}

                              {leaderboardMetric === "SPEED" && (
                                <>
                                  <div className="flex items-end justify-between">
                                    <span className="text-2xl font-bold">
                                      {Math.round(score.avgInferenceTimeMs)}
                                      <span className="text-sm font-normal text-muted-foreground ml-1">
                                        ms
                                      </span>
                                    </span>
                                    <span className="text-[10px] text-muted-foreground mb-1 uppercase tracking-tighter">
                                      Avg Latency
                                    </span>
                                  </div>
                                  <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                                    {/* Inverse bar for speed: shorter is cleaner/better, but bar length usually implies quantity. Let's do relative to a safe max of 5000ms? */}
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{
                                        width: `${Math.min(100, (score.avgInferenceTimeMs / 5000) * 100)}%`,
                                      }}
                                      className={cn(
                                        "h-full",
                                        score.avgInferenceTimeMs < 1000
                                          ? "bg-emerald-500"
                                          : score.avgInferenceTimeMs < 3000
                                            ? "bg-amber-500"
                                            : "bg-red-500",
                                      )}
                                    />
                                  </div>
                                </>
                              )}

                              {leaderboardMetric === "COST" && (
                                <>
                                  <div className="flex items-end justify-between">
                                    <span className="text-2xl font-bold">
                                      ${score.avgCostUsd.toFixed(5)}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground mb-1 uppercase tracking-tighter">
                                      Avg Cost
                                    </span>
                                  </div>
                                  <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{
                                        width: `${Math.min(100, (score.avgCostUsd / 0.01) * 100)}%`,
                                      }} // normalized to 1 cent
                                      className="h-full bg-blue-500"
                                    />
                                  </div>
                                </>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
                              {/* Judge Scores */}
                              <div className="text-muted-foreground">
                                J1 (grok):
                              </div>
                              <div className="font-mono text-blue-400">
                                {score.avgJudge1Score?.toFixed(1) ?? "—"}
                              </div>

                              <div className="text-muted-foreground">
                                J2 (gemini):
                              </div>
                              <div className="font-mono text-purple-400">
                                {score.avgJudge2Score?.toFixed(1) ?? "—"}
                              </div>

                              <div className="text-muted-foreground">
                                Reliability:
                              </div>
                              <div
                                className={cn(
                                  "font-medium",
                                  score.reliability > 0.9
                                    ? "text-green-400"
                                    : score.reliability > 0.7
                                      ? "text-amber-400"
                                      : "text-red-400",
                                )}
                              >
                                {Math.round(score.reliability * 100)}%
                              </div>

                              <div className="text-muted-foreground">
                                Variance:
                              </div>
                              <div className="font-mono">
                                ±{score.variance.toFixed(2)}
                              </div>

                              {score.flaggedForReviewCount > 0 && (
                                <>
                                  <div className="text-muted-foreground">
                                    Flagged:
                                  </div>
                                  <div className="font-mono text-amber-400">
                                    ⚠️ {score.flaggedForReviewCount}
                                  </div>
                                </>
                              )}

                              <div className="text-muted-foreground">
                                Avg TTFT:
                              </div>
                              <div className="font-mono">
                                {score.avgTtftMs
                                  ? `${Math.round(score.avgTtftMs)}ms`
                                  : "—"}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Test Case Navigator */}
              {testCaseIds.length > 0 && (
                <Card className="border-white/5 bg-background/40">
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" />
                          Test:{" "}
                          <span className="text-primary">
                            {selectedTestCaseId}
                          </span>
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => exportResults(selectedRun.id)}
                          className="h-6 text-[10px] text-blue-400 hover:text-blue-300 hover:bg-blue-500/20"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          Export JSONL
                        </Button>
                        {blindModeEnabled && currentTestResults.length >= 2 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={startBlindComparison}
                            className="h-6 text-[10px] text-purple-400 hover:text-purple-300 hover:bg-purple-500/20"
                          >
                            👁️ Blind Compare
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={goToPrevTest}
                            disabled={currentTestIndex <= 0}
                            className="h-6 w-6"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <span className="text-xs text-muted-foreground font-mono">
                            {currentTestIndex + 1} / {testCaseIds.length}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={goToNextTest}
                            disabled={
                              currentTestIndex >= testCaseIds.length - 1
                            }
                            className="h-6 w-6"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Test case selector dropdown */}
                    <Select
                      value={selectedTestCaseId || ""}
                      onValueChange={(val) => setSelectedTestCaseId(val)}
                    >
                      <SelectTrigger className="w-full mb-4 bg-black/20 border-white/10">
                        <SelectValue placeholder="Select a test case..." />
                      </SelectTrigger>
                      <SelectContent>
                        <ScrollArea className="h-[300px]">
                          {testCaseIds.map((id) => {
                            const sample = results.find(
                              (r) => r.testCaseId === id,
                            );
                            return (
                              <SelectItem key={id} value={id}>
                                {id} (
                                {sample?.category === "TOOL_USAGE" ? "🔧" : "✍️"}
                                )
                              </SelectItem>
                            );
                          })}
                        </ScrollArea>
                      </SelectContent>
                    </Select>

                    {/* Filters & Sorting */}
                    <div className="flex flex-wrap items-center gap-4 mb-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground">
                          Filter:
                        </span>
                        <Select
                          value={filterCategory}
                          onValueChange={(val) => setFilterCategory(val)}
                        >
                          <SelectTrigger className="w-[180px] h-8 text-xs bg-white/5 border-white/10">
                            <SelectValue placeholder="Category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALL">All Categories</SelectItem>
                            <SelectItem value="TOOL_USAGE">
                              Tool Usage
                            </SelectItem>
                            <SelectItem value="WRITING_QUALITY">
                              Writing Quality
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground">
                          Sort By:
                        </span>
                        <Select
                          value={sortBy}
                          onValueChange={(val: "SCORE" | "LATENCY" | "COST") =>
                            setSortBy(val)
                          }
                        >
                          <SelectTrigger className="w-[150px] h-8 text-xs bg-white/5 border-white/10">
                            <SelectValue placeholder="Sort By" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="SCORE">Score</SelectItem>
                            <SelectItem value="LATENCY">Latency</SelectItem>
                            <SelectItem value="COST">Cost</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono"
                        >
                          {currentTestResults.length} results
                        </Badge>
                      </div>
                    </div>

                    {/* Results Table for current test */}
                    <div className="border border-white/10 rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader className="bg-white/5">
                          <TableRow className="border-white/5 hover:bg-transparent">
                            <TableHead className="text-left font-medium p-2 text-xs">
                              Model
                            </TableHead>
                            <TableHead className="text-center font-medium p-2 text-xs">
                              AI Score
                            </TableHead>
                            <TableHead className="text-right font-medium p-2 text-xs">
                              TTFT
                            </TableHead>
                            <TableHead className="text-right font-medium p-2 text-xs">
                              Time (ms)
                            </TableHead>
                            <TableHead className="text-right font-medium p-2 text-xs">
                              Cost
                            </TableHead>
                            <TableHead className="text-right font-medium p-2 text-xs">
                              Tokens
                            </TableHead>
                            <TableHead className="text-center font-medium p-2 text-xs">
                              View
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {currentTestResults.map((result) => (
                            <TableRow
                              key={result.id}
                              className="border-white/5 hover:bg-white/5"
                            >
                              <TableCell className="p-2 font-medium text-xs">
                                {blindModeEnabled && !modelsRevealed
                                  ? `Model ${String.fromCharCode(65 + currentTestResults.indexOf(result))}`
                                  : result.modelId.split("/")[1]}
                              </TableCell>
                              <TableCell className="p-2 text-center">
                                <ScoreBadge
                                  score={
                                    result.finalScore ?? result.overallScore
                                  }
                                  large
                                />
                              </TableCell>
                              <TableCell className="p-2 text-right text-xs font-mono text-muted-foreground">
                                {result.ttftMs ? `${result.ttftMs}ms` : "—"}
                              </TableCell>
                              <TableCell className="p-2 text-right text-xs font-mono text-muted-foreground">
                                {result.inferenceTimeMs}
                              </TableCell>
                              <TableCell className="p-2 text-right text-xs font-mono text-muted-foreground">
                                ${result.costUsd?.toFixed(6) || "0.00"}
                              </TableCell>
                              <TableCell className="p-2 text-right text-xs font-mono text-muted-foreground">
                                {result.inputTokens + result.outputTokens}
                              </TableCell>
                              <TableCell className="p-2 text-center">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedResult(result);
                                    setDetailModalOpen(true);
                                  }}
                                  className="h-6 w-6 p-0 text-primary hover:text-primary hover:bg-primary/20"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card className="border-white/5 bg-background/40">
              <CardContent className="flex flex-col items-center justify-center py-20">
                <FlaskConical className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">Select a benchmark run</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Blind A/B Comparison Modal */}
      {blindComparisonOpen && blindPair && (
        <Dialog
          open={true}
          onOpenChange={(open) => !open && closeBlindComparison()}
        >
          <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
            <DialogHeader className="p-4 border-b border-white/10 flex flex-row items-center justify-between space-y-0">
              <div>
                <DialogTitle className="text-base font-semibold flex items-center gap-2">
                  👁️ Blind A/B Comparison
                  <Badge
                    variant="secondary"
                    className="text-xs bg-purple-500/20 text-purple-400"
                  >
                    Model names hidden
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Test: {blindPair.testCaseId}
                </DialogDescription>
              </div>
            </DialogHeader>

            <ScrollArea className="flex-1 p-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Response A */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-lg">
                      {modelsRevealed ? (
                        <span className="text-green-400">
                          {blindPair.resultA.modelId.split("/")[1]}
                        </span>
                      ) : (
                        "Response A"
                      )}
                    </h3>
                    {!modelsRevealed && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant={blindScores.starA ? "ghost" : "ghost"}
                          size="sm"
                          onClick={() =>
                            setBlindScores((prev) => ({
                              ...prev,
                              starA: !prev.starA,
                            }))
                          }
                          className={cn(
                            "h-7 px-2",
                            blindScores.starA
                              ? "bg-yellow-500/30 text-yellow-400 hover:bg-yellow-500/40"
                              : "bg-white/5 hover:bg-white/10",
                          )}
                          title="+2 bonus"
                        >
                          ⭐
                        </Button>
                        <Button
                          variant={blindScores.tomatoA ? "ghost" : "ghost"}
                          size="sm"
                          onClick={() =>
                            setBlindScores((prev) => ({
                              ...prev,
                              tomatoA: !prev.tomatoA,
                            }))
                          }
                          className={cn(
                            "h-7 px-2",
                            blindScores.tomatoA
                              ? "bg-red-500/30 text-red-400 hover:bg-red-500/40"
                              : "bg-white/5 hover:bg-white/10",
                          )}
                          title="-2 penalty"
                        >
                          🍅
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <p className="text-sm whitespace-pre-wrap">
                      {blindPair.resultA.responseText}
                    </p>
                  </div>
                </div>

                {/* Response B */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-lg">
                      {modelsRevealed ? (
                        <span className="text-green-400">
                          {blindPair.resultB.modelId.split("/")[1]}
                        </span>
                      ) : (
                        "Response B"
                      )}
                    </h3>
                    {!modelsRevealed && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant={blindScores.starB ? "ghost" : "ghost"}
                          size="sm"
                          onClick={() =>
                            setBlindScores((prev) => ({
                              ...prev,
                              starB: !prev.starB,
                            }))
                          }
                          className={cn(
                            "h-7 px-2",
                            blindScores.starB
                              ? "bg-yellow-500/30 text-yellow-400 hover:bg-yellow-500/40"
                              : "bg-white/5 hover:bg-white/10",
                          )}
                          title="+2 bonus"
                        >
                          ⭐
                        </Button>
                        <Button
                          variant={blindScores.tomatoB ? "ghost" : "ghost"}
                          size="sm"
                          onClick={() =>
                            setBlindScores((prev) => ({
                              ...prev,
                              tomatoB: !prev.tomatoB,
                            }))
                          }
                          className={cn(
                            "h-7 px-2",
                            blindScores.tomatoB
                              ? "bg-red-500/30 text-red-400 hover:bg-red-500/40"
                              : "bg-white/5 hover:bg-white/10",
                          )}
                          title="-2 penalty"
                        >
                          🍅
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <p className="text-sm whitespace-pre-wrap">
                      {blindPair.resultB.responseText}
                    </p>
                  </div>
                </div>
              </div>

              {/* Preference Selection */}
              <div className="mt-8 pt-4 border-t border-white/10 space-y-4">
                {modelsRevealed ? (
                  <div className="flex items-center justify-center gap-4">
                    <div className="text-center space-y-2">
                      <p className="text-lg font-medium text-green-400">
                        ✅ Models Revealed!
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Your preference:{" "}
                        <span className="font-medium text-purple-400">
                          {blindScores.preference === "A"
                            ? "A is Better"
                            : blindScores.preference === "B"
                              ? "B is Better"
                              : blindScores.preference === "both_good"
                                ? "Both Good"
                                : "Both Bad"}
                        </span>
                      </p>
                    </div>
                    <Button
                      onClick={closeBlindComparison}
                      className="bg-green-500 hover:bg-green-600 text-white"
                    >
                      Done
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-center gap-4 flex-wrap">
                      <span className="text-sm text-muted-foreground">
                        Preference:
                      </span>
                      <div className="flex gap-2 flex-wrap">
                        {[
                          {
                            value: "both_good" as const,
                            label: "👍 Both Good",
                          },
                          { value: "A" as const, label: "✨ A is Better" },
                          { value: "B" as const, label: "✨ B is Better" },
                          { value: "both_bad" as const, label: "👎 Both Bad" },
                        ].map(({ value, label }) => (
                          <Button
                            key={value}
                            variant={
                              blindScores.preference === value
                                ? "default"
                                : "outline"
                            }
                            onClick={() =>
                              setBlindScores((prev) => ({
                                ...prev,
                                preference: value,
                              }))
                            }
                            className={cn(
                              "transition-all",
                              blindScores.preference === value
                                ? "bg-purple-500 text-white border-purple-500 hover:bg-purple-600"
                                : "bg-white/5 border-white/10 hover:bg-white/10",
                            )}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground italic">
                        Model identities will be revealed after you submit
                      </p>
                      <Button
                        onClick={submitBlindScores}
                        disabled={!blindScores.preference}
                        className="bg-purple-500 hover:bg-purple-600 text-white"
                      >
                        Submit & Reveal Models
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}

      {/* Config Modal - Test/Model Selection */}
      <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="p-4 border-b border-white/10 space-y-0">
            <DialogTitle className="font-semibold">
              Configure Benchmark
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 p-4">
            <div className="grid grid-cols-2 gap-6">
              {/* Models */}
              <div>
                <h3 className="text-sm font-medium mb-3">
                  Models ({selectedModels.size})
                </h3>
                <div className="space-y-2">
                  {AVAILABLE_MODELS.map((modelId) => (
                    <label
                      key={modelId}
                      className="flex items-center gap-2 p-2 rounded hover:bg-white/5 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedModels.has(modelId)}
                        onChange={() => toggleModel(modelId)}
                        className="rounded bg-white/5 border-white/10"
                      />
                      <span className="text-sm">{modelId.split("/")[1]}</span>
                    </label>
                  ))}
                </div>
              </div>
              {/* Tests */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium">
                    Tests ({selectedTests.size || "all"})
                  </h3>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={selectAllTests}
                      className="h-6 text-[10px]"
                    >
                      Select All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAllTests}
                      className="h-6 text-[10px]"
                    >
                      Clear All
                    </Button>
                  </div>
                </div>
                <div className="space-y-1 max-h-[400px] overflow-y-auto custom-scrollbar">
                  {dataset.testCases.map((tc) => (
                    <label
                      key={tc.id}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded cursor-pointer",
                        selectedTests.has(tc.id)
                          ? "bg-primary/20"
                          : "hover:bg-white/5",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selectedTests.has(tc.id)}
                        onChange={() => toggleTest(tc.id)}
                        className="rounded bg-white/5 border-white/10"
                      />
                      <span className="text-xs font-mono">{tc.id}</span>
                      <span
                        className={cn(
                          "text-[10px] px-1 rounded",
                          tc.category === "tool_usage"
                            ? "bg-purple-500/20 text-purple-400"
                            : "bg-blue-500/20 text-blue-400",
                        )}
                      >
                        {tc.category === "tool_usage" ? "🔧" : "✍️"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>

          <div className="p-4 border-t border-white/10 flex justify-between bg-black/20">
            <p className="text-xs text-muted-foreground self-center">
              {selectedTests.size === 0
                ? "All tests"
                : `${selectedTests.size} tests`}{" "}
              × {selectedModels.size} models ={" "}
              {(selectedTests.size || dataset.testCases.length) *
                selectedModels.size}{" "}
              runs
            </p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="concurrency-input-v2"
                  className="text-xs text-muted-foreground"
                >
                  Parallel:
                </label>
                <Input
                  type="number"
                  id="concurrency-input-v2"
                  min="1"
                  max="20"
                  defaultValue="10"
                  className="w-16 h-8 text-xs bg-black/20 border-white/10"
                />
              </div>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="iterations-input-v2"
                  className="text-xs text-muted-foreground"
                >
                  Iterations:
                </label>
                <Input
                  type="number"
                  id="iterations-input-v2"
                  min="1"
                  max="10"
                  defaultValue="1"
                  className="w-16 h-8 text-xs bg-black/20 border-white/10"
                />
              </div>
              <Button
                onClick={() => {
                  const iterationsInput = document.getElementById(
                    "iterations-input-v2",
                  ) as HTMLInputElement;
                  const concurrencyInput = document.getElementById(
                    "concurrency-input-v2",
                  ) as HTMLInputElement;
                  const iterations = iterationsInput?.value;
                  const concurrency = concurrencyInput?.value;
                  const testsToRun =
                    selectedTests.size > 0 ? [...selectedTests] : undefined;
                  const modelsToRun =
                    selectedModels.size > 0 ? [...selectedModels] : undefined;
                  startBenchmark({
                    testCaseIds: testsToRun,
                    models: modelsToRun,
                    iterations: parseInt(iterations, 10) || 1,
                    concurrency: parseInt(concurrency, 10) || 10,
                  });
                  setConfigModalOpen(false);
                }}
                disabled={starting || selectedModels.size === 0}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {starting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Start Selected
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      {detailModalOpen && selectedResult && (
        <ResultDetailModal
          result={selectedResult}
          onClose={() => setDetailModalOpen(false)}
          onSubmitScore={submitAdminScore}
          dataset={dataset}
        />
      )}

      {/* Manage Datasets Modal */}
      <Dialog open={manageDatasetsOpen} onOpenChange={setManageDatasetsOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden shadow-2xl">
          <DialogHeader className="p-4 border-b border-white/10 bg-white/5 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              <DialogTitle className="font-semibold text-lg">
                Manage Benchmark Datasets
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setEditingTestCase(null);
                  setTestCaseFormOpen(true);
                }}
                className="h-8 text-xs gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                New Test Case
              </Button>
            </div>
          </DialogHeader>

          <div className="flex border-b border-white/10 px-4 pt-2">
            <Button
              variant="ghost"
              onClick={() => setActiveDatasetTab("ALL")}
              className={cn(
                "rounded-none border-b-2 pb-2 px-4 h-9 font-medium text-sm hover:bg-transparent",
                activeDatasetTab === "ALL"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              All Test Cases ({dbTestCases.length})
            </Button>
            <Button
              variant="ghost"
              onClick={() => setActiveDatasetTab("ADVERSARIAL")}
              className={cn(
                "rounded-none border-b-2 pb-2 px-4 h-9 font-medium text-sm hover:bg-transparent flex items-center gap-2",
                activeDatasetTab === "ADVERSARIAL"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              Pending Adversarial ({pendingAdversarial.length})
              <span className="flex h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            </Button>
          </div>

          <ScrollArea className="flex-1 p-4 bg-black/20">
            {activeDatasetTab === "ADVERSARIAL" && (
              <div className="mb-6 p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-purple-400">
                      Adversarial Generator
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Uses LLM to find weaknesses in current models by
                      generating tricky edge cases.
                    </p>
                  </div>
                  <Button
                    onClick={generateAdversarial}
                    disabled={generatingAdversarial}
                    className="bg-purple-500 hover:bg-purple-600 text-white gap-2"
                  >
                    {generatingAdversarial ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Star className="h-4 w-4" />
                    )}
                    Generate 3 New Cases
                  </Button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(activeDatasetTab === "ALL" ? dbTestCases : pendingAdversarial)
                .length === 0 ? (
                <div className="col-span-full py-20 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-white/5 rounded-xl">
                  <Search className="h-10 w-10 mb-4 opacity-10" />
                  <p className="text-sm">
                    No{" "}
                    {activeDatasetTab === "ADVERSARIAL"
                      ? "pending adversarial"
                      : "test"}{" "}
                    cases found.
                  </p>
                </div>
              ) : (
                (activeDatasetTab === "ALL"
                  ? dbTestCases
                  : pendingAdversarial
                ).map((tc) => (
                  <Card
                    key={tc.id}
                    className={cn(
                      "border-white/5 bg-white/5 hover:border-primary/30 transition-all group overflow-hidden",
                      activeDatasetTab === "ADVERSARIAL" &&
                        "border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.1)]",
                    )}
                  >
                    <CardContent className="p-4 flex flex-col h-full">
                      <div className="flex justify-between items-start mb-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 font-bold uppercase border-0",
                            tc.category === "TOOL_USAGE"
                              ? "bg-blue-500/10 text-blue-400"
                              : "bg-purple-500/10 text-purple-400",
                          )}
                        >
                          {tc.category.replace("_", " ")}
                        </Badge>
                        <div className="flex gap-1">
                          {activeDatasetTab === "ADVERSARIAL" ? (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() =>
                                  handleAdversarialAction(tc.id, "approve")
                                }
                                className="h-6 w-6 hover:bg-emerald-500/20 text-emerald-400"
                                title="Approve & Add to Dataset"
                              >
                                <Play className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() =>
                                  handleAdversarialAction(tc.id, "reject")
                                }
                                className="h-6 w-6 hover:bg-red-500/20 text-red-400"
                                title="Reject & Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setEditingTestCase(tc);
                                setTestCaseFormOpen(true);
                              }}
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-white/10 text-muted-foreground transition-all"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <h3 className="text-sm font-semibold mb-1 line-clamp-1">
                        {tc.name}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-3 mb-3 h-12 overflow-hidden">
                        {tc.description}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-auto pt-2 border-t border-white/5">
                        <span className="flex items-center gap-1 font-mono">
                          ID: {tc.externalId || tc.id.substring(0, 8)}
                        </span>
                        <div
                          className={cn(
                            "w-2 h-2 rounded-full",
                            tc.isActive
                              ? "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]"
                              : "bg-rose-500",
                          )}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Test Case Form Modal */}
      <Dialog open={testCaseFormOpen} onOpenChange={setTestCaseFormOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-6 gap-0 overflow-y-auto">
          <DialogHeader className="mb-6 flex flex-row items-center justify-between space-y-0">
            <DialogTitle className="text-lg font-bold">
              {editingTestCase ? "Edit Test Case" : "New Test Case"}
            </DialogTitle>
          </DialogHeader>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);

              let setupData = { session: [], memories: [], userContext: {} };
              let expectedBehaviorData = {};

              try {
                const setupStr = formData.get("setup") as string;
                if (setupStr) setupData = JSON.parse(setupStr);

                const expectedBehaviorStr = formData.get(
                  "expectedBehavior",
                ) as string;
                if (expectedBehaviorStr)
                  expectedBehaviorData = JSON.parse(expectedBehaviorStr);
              } catch (_err) {
                alert("Invalid JSON in Setup or Expected Behavior fields");
                return;
              }

              const data = {
                id: editingTestCase?.id,
                name: formData.get("name"),
                category: formData.get("category"),
                userMessage: formData.get("userMessage"),
                description: formData.get("description"),
                setup: setupData,
                expectedBehavior: expectedBehaviorData,
                isActive: true,
              };

              try {
                const res = await fetch("/api/admin/benchmark/test-cases", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(data),
                });
                if (res.ok) {
                  setTestCaseFormOpen(false);
                  fetchTestCases();
                }
              } catch (_err) {
                alert("Failed to save test case");
              }
            }}
            className="space-y-4"
          >
            <div>
              <Label
                htmlFor="tc-name"
                className="text-xs font-medium text-muted-foreground uppercase block mb-1"
              >
                Name
              </Label>
              <Input
                id="tc-name"
                name="name"
                defaultValue={editingTestCase?.name}
                required
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label
                  htmlFor="tc-category"
                  className="text-xs font-medium text-muted-foreground uppercase block mb-1"
                >
                  Category
                </Label>
                <Select
                  name="category"
                  defaultValue={editingTestCase?.category || "TOOL_USAGE"}
                >
                  <SelectTrigger className="bg-white/5 border-white/10">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TOOL_USAGE">Tool Usage</SelectItem>
                    <SelectItem value="WRITING_QUALITY">
                      Writing Quality
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label
                  htmlFor="tc-externalId"
                  className="text-xs font-medium text-muted-foreground uppercase block mb-1"
                >
                  External ID
                </Label>
                <Input
                  id="tc-externalId"
                  name="externalId"
                  defaultValue={editingTestCase?.externalId || ""}
                  className="bg-white/5 border-white/10"
                  placeholder="e.g. tool_001"
                />
              </div>
            </div>
            <div>
              <Label
                htmlFor="tc-userMessage"
                className="text-xs font-medium text-muted-foreground uppercase block mb-1"
              >
                User Message
              </Label>
              <Textarea
                id="tc-userMessage"
                name="userMessage"
                defaultValue={editingTestCase?.userMessage || ""}
                required
                className="bg-white/5 border-white/10 h-24 resize-none"
              />
            </div>
            <div>
              <Label
                htmlFor="tc-description"
                className="text-xs font-medium text-muted-foreground uppercase block mb-1"
              >
                Description
              </Label>
              <Textarea
                id="tc-description"
                name="description"
                defaultValue={editingTestCase?.description || ""}
                className="bg-white/5 border-white/10 h-20 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label
                    htmlFor="tc-setup"
                    className="text-xs font-medium text-muted-foreground uppercase block text-[10px]"
                  >
                    Setup (JSON)
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const el = document.getElementById(
                        "tc-setup",
                      ) as HTMLTextAreaElement;
                      try {
                        el.value = JSON.stringify(
                          JSON.parse(el.value),
                          null,
                          2,
                        );
                      } catch (_e) {
                        alert("Invalid JSON");
                      }
                    }}
                    className="h-5 text-[9px] px-1.5 py-0.5"
                  >
                    PRETTIFY
                  </Button>
                </div>
                <div className="text-[9px] text-muted-foreground mb-1">
                  Includes session, memories, userContext
                </div>
                <Textarea
                  id="tc-setup"
                  name="setup"
                  rows={Math.max(
                    15,
                    (
                      JSON.stringify(
                        editingTestCase?.setup || {},
                        null,
                        2,
                      ).match(/\n/g) || []
                    ).length + 2,
                  )}
                  defaultValue={JSON.stringify(
                    editingTestCase?.setup || {
                      session: [],
                      memories: [],
                      userContext: {},
                    },
                    null,
                    2,
                  )}
                  className="bg-white/5 border-white/10 font-mono text-xs resize-y"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label
                    htmlFor="tc-expectedBehavior"
                    className="text-xs font-medium text-muted-foreground uppercase block text-[10px]"
                  >
                    Expected Behavior (JSON)
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const el = document.getElementById(
                        "tc-expectedBehavior",
                      ) as HTMLTextAreaElement;
                      try {
                        el.value = JSON.stringify(
                          JSON.parse(el.value),
                          null,
                          2,
                        );
                      } catch (_e) {
                        alert("Invalid JSON");
                      }
                    }}
                    className="h-5 text-[9px] px-1.5 py-0.5"
                  >
                    PRETTIFY
                  </Button>
                </div>
                <div className="text-[9px] text-muted-foreground mb-1">
                  Validation rules
                </div>
                <Textarea
                  id="tc-expectedBehavior"
                  name="expectedBehavior"
                  rows={Math.max(
                    15,
                    (
                      JSON.stringify(
                        editingTestCase?.expectedBehavior || {},
                        null,
                        2,
                      ).match(/\n/g) || []
                    ).length + 2,
                  )}
                  defaultValue={JSON.stringify(
                    editingTestCase?.expectedBehavior || {},
                    null,
                    2,
                  )}
                  className="bg-white/5 border-white/10 font-mono text-xs resize-y"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setTestCaseFormOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Save Test Case</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResultDetailModal({
  result,
  onClose,
  onSubmitScore,
  dataset,
}: {
  result: BenchmarkResult;
  onClose: () => void;
  onSubmitScore: (id: string, score: number, reasoning: string) => void;
  dataset: Dataset;
}) {
  const [score, setScore] = useState<number>(result.adminScore ?? 5);
  const [reasoning, setReasoning] = useState(result.adminReasoning ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    await onSubmitScore(result.id, score, reasoning);
    setSubmitting(false);
  };

  const testCase = dataset.testCases.find(
    (tc: Dataset["testCases"][number]) => tc.id === result.testCaseId,
  );

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl max-h-[95vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 border-b border-white/10 flex flex-row items-center justify-between space-y-0">
          <div>
            <DialogTitle className="text-base font-semibold">
              {result.testCaseId} — {result.modelId.split("/")[1]}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {result.category === "TOOL_USAGE"
                ? "🔧 Tool Usage"
                : "✍️ Writing Quality"}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showRawJson ? "default" : "ghost"}
              size="icon"
              onClick={() => setShowRawJson(!showRawJson)}
              className="h-8 w-8"
              title="View Raw JSON"
            >
              <FileJson className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-6">
            {showRawJson ? (
              <div className="bg-black/50 p-4 rounded-lg overflow-auto">
                <pre className="text-[10px] font-mono whitespace-pre-wrap">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-sm">
                  <div className="p-3 bg-white/5 rounded-lg text-center">
                    <div className="text-2xl font-bold">
                      {result.overallScore.toFixed(1)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      AI Score
                    </div>
                  </div>
                  <div className="p-3 bg-white/5 rounded-lg text-center">
                    <div className="text-2xl font-bold">
                      {result.adminScore?.toFixed(1) ?? "—"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Admin Score
                    </div>
                  </div>
                  <div className="p-3 bg-primary/10 rounded-lg text-center border border-primary/20">
                    <div className="text-2xl font-bold text-primary">
                      {(result.finalScore ?? result.overallScore).toFixed(1)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Final Score
                    </div>
                  </div>
                  <div className="p-3 bg-white/5 rounded-lg text-center">
                    <div className="text-lg font-mono">
                      {result.inferenceTimeMs}ms
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Time
                    </div>
                  </div>
                  <div className="p-3 bg-white/5 rounded-lg text-center">
                    <div className="text-lg font-mono">
                      ${result.costUsd?.toFixed(5) ?? "0.00"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Cost
                    </div>
                  </div>
                  <div className="p-3 bg-white/5 rounded-lg text-center">
                    <div className="text-lg font-mono">
                      {result.inputTokens + result.outputTokens}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Tokens ({result.outputTokens} out)
                    </div>
                  </div>
                </div>

                {/* Multi-Judge Consensus Display */}
                {(result.judge2OverallScore !== undefined ||
                  result.consensusScore !== undefined) && (
                  <div className="p-4 bg-linear-to-r from-purple-500/10 to-blue-500/10 rounded-lg border border-purple-500/20">
                    <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                      ⚖️ Multi-Judge Consensus
                      {result.flaggedForReview && (
                        <Badge
                          variant="warning"
                          className="text-[10px] bg-amber-500/20 text-amber-400"
                        >
                          ⚠️ Flagged for Review
                        </Badge>
                      )}
                    </h3>
                    <div className="grid grid-cols-4 gap-3">
                      <div className="text-center p-2 bg-black/20 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">
                          Judge 1
                        </div>
                        <div className="text-sm font-mono text-blue-400">
                          grok-4-fast
                        </div>
                        <div className="text-lg font-bold">
                          {result.overallScore.toFixed(1)}
                        </div>
                      </div>
                      <div className="text-center p-2 bg-black/20 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">
                          Judge 2
                        </div>
                        <div className="text-sm font-mono text-purple-400">
                          gemini-3-flash
                        </div>
                        <div className="text-lg font-bold">
                          {result.judge2OverallScore?.toFixed(1) ?? "—"}
                        </div>
                      </div>
                      <div className="text-center p-2 bg-black/20 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">
                          Consensus
                        </div>
                        <div className="text-sm font-mono text-emerald-400">
                          Average
                        </div>
                        <div className="text-lg font-bold text-emerald-400">
                          {result.consensusScore?.toFixed(1) ?? "—"}
                        </div>
                      </div>
                      <div className="text-center p-2 bg-black/20 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">
                          Disagreement
                        </div>
                        <div className="text-sm font-mono text-muted-foreground">
                          Δ
                        </div>
                        <div
                          className={cn(
                            "text-lg font-bold",
                            (result.judgeDisagreement ?? 0) > 3
                              ? "text-amber-400"
                              : "text-emerald-400",
                          )}
                        >
                          ±{result.judgeDisagreement?.toFixed(1) ?? "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-6">
                  {testCase && (
                    <div>
                      <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <User className="h-4 w-4 text-emerald-400" />
                        User Prompt
                      </h3>
                      <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-sm whitespace-pre-wrap">
                        {testCase.userMessage}
                      </div>
                    </div>
                  )}

                  {testCase?.setup && (
                    <div className="grid grid-cols-2 gap-4">
                      {(testCase.setup as unknown as TestCaseSetup).memories
                        ?.length > 0 && (
                        <div>
                          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                            Memories (
                            {
                              (testCase.setup as unknown as TestCaseSetup)
                                .memories?.length
                            }
                            )
                          </h3>
                          <ScrollArea className="h-32 rounded-lg border border-white/10 bg-white/5 p-3">
                            <ul className="text-xs space-y-1">
                              {(
                                testCase.setup as unknown as TestCaseSetup
                              ).memories?.map(
                                (m: { key: string; value: string }) => (
                                  <li key={m.key} className="flex gap-2">
                                    <span className="font-mono text-primary">
                                      {m.key}:
                                    </span>
                                    <span className="text-muted-foreground">
                                      {m.value}
                                    </span>
                                  </li>
                                ),
                              )}
                            </ul>
                          </ScrollArea>
                        </div>
                      )}
                      {(testCase.setup as unknown as TestCaseSetup).session
                        ?.length > 0 && (
                        <div>
                          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                            💬 Context (
                            {
                              (testCase.setup as unknown as TestCaseSetup)
                                .session?.length
                            }{" "}
                            messages)
                          </h3>
                          <ScrollArea className="h-32 rounded-lg border border-white/10 bg-white/5 p-3">
                            <ul className="text-xs space-y-1">
                              {(
                                testCase.setup as unknown as TestCaseSetup
                              ).session?.map(
                                (
                                  msg: { role: string; content: string },
                                  i: number,
                                ) => (
                                  <li
                                    key={`${msg.role}-${i}`}
                                    className="line-clamp-1"
                                  >
                                    <span className="font-bold opacity-50 uppercase text-[9px] mr-2">
                                      {msg.role}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {msg.content}
                                    </span>
                                  </li>
                                ),
                              )}
                            </ul>
                          </ScrollArea>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-blue-400" />
                      AI Response
                    </h3>
                    <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                      <p className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
                        {result.responseText}
                      </p>
                    </div>
                  </div>

                  {/* Structured Critiques (Chain of Thought) */}
                  {(result.toolUsageCritique ||
                    result.writingQualityCritique ||
                    result.judge2ToolUsageCritique ||
                    result.judge2WritingQualityCritique) && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-purple-400" />
                        Judge Analysis (Chain of Thought)
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Judge 1 Analysis */}
                        <div className="p-3 bg-purple-500/5 rounded-lg border border-purple-500/10">
                          <div className="text-[10px] font-bold uppercase text-purple-400 mb-2">
                            Judge 1 (Primary)
                          </div>
                          <div className="space-y-2 text-xs">
                            {result.toolUsageCritique && (
                              <div>
                                <span className="font-semibold">
                                  Tool Usage:
                                </span>
                                <div className="mt-1 p-2 bg-black/20 rounded font-mono text-[9px] whitespace-pre-wrap overflow-x-auto">
                                  {JSON.stringify(
                                    result.toolUsageCritique,
                                    null,
                                    2,
                                  )}
                                </div>
                              </div>
                            )}
                            {result.writingQualityCritique && (
                              <div>
                                <span className="font-semibold">
                                  Writing Quality:
                                </span>
                                <div className="mt-1 p-2 bg-black/20 rounded font-mono text-[9px] whitespace-pre-wrap overflow-x-auto">
                                  {JSON.stringify(
                                    result.writingQualityCritique,
                                    null,
                                    2,
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Judge 2 Analysis */}
                        {(result.judge2ToolUsageCritique ||
                          result.judge2WritingQualityCritique) && (
                          <div className="p-3 bg-blue-500/5 rounded-lg border border-blue-500/10">
                            <div className="text-[10px] font-bold uppercase text-blue-400 mb-2">
                              Judge 2 (Consensus)
                            </div>
                            <div className="space-y-2 text-xs">
                              {result.judge2ToolUsageCritique && (
                                <div>
                                  <span className="font-semibold">
                                    Tool Usage:
                                  </span>
                                  <div className="mt-1 p-2 bg-black/20 rounded font-mono text-[9px] whitespace-pre-wrap overflow-x-auto">
                                    {JSON.stringify(
                                      result.judge2ToolUsageCritique,
                                      null,
                                      2,
                                    )}
                                  </div>
                                </div>
                              )}
                              {result.judge2WritingQualityCritique && (
                                <div>
                                  <span className="font-semibold">
                                    Writing Quality:
                                  </span>
                                  <div className="mt-1 p-2 bg-black/20 rounded font-mono text-[9px] whitespace-pre-wrap overflow-x-auto">
                                    {JSON.stringify(
                                      result.judge2WritingQualityCritique,
                                      null,
                                      2,
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tool Calls Log */}
                  {result.toolCalls && result.toolCalls.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Database className="h-4 w-4 text-amber-400" />
                        Tool Execution Log
                      </h3>
                      <div className="space-y-2">
                        {result.toolCalls.map((call, i) => (
                          <div
                            key={`tool-call-${call.name}-${i}`}
                            className="p-3 bg-amber-500/5 rounded-lg border border-amber-500/10 text-xs"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-mono font-bold text-amber-400">
                                {call.name}
                              </span>
                              <span className="text-[9px] opacity-50">
                                Call #{i + 1}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <div className="text-[9px] uppercase font-bold text-muted-foreground mb-1">
                                  Arguments
                                </div>
                                <pre className="p-2 bg-black/20 rounded font-mono text-[9px] overflow-x-auto">
                                  {JSON.stringify(call.args, null, 2)}
                                </pre>
                              </div>
                              {!!call.result && (
                                <div>
                                  <div className="text-[9px] uppercase font-bold text-muted-foreground mb-1">
                                    Result
                                  </div>
                                  <pre className="p-2 bg-black/20 rounded font-mono text-[9px] overflow-x-auto">
                                    {JSON.stringify(call.result, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(result.toolUsageReasoning ||
                    result.writingQualityReasoning) && (
                    <div>
                      <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Star className="h-4 w-4 text-amber-400" />
                        Judge Summary Reasoning
                      </h3>
                      <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                        <p className="text-sm italic">
                          {result.toolUsageReasoning ||
                            result.writingQualityReasoning}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="p-4 bg-white/5 rounded-lg border border-white/10 space-y-4">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <Star className="h-4 w-4 text-primary" />
                      Your Evaluation
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label
                            htmlFor="modal-score"
                            className="text-xs text-muted-foreground"
                          >
                            Score (0-10)
                          </label>
                          <span className="text-lg font-bold text-primary">
                            {score}
                          </span>
                        </div>
                        <Slider
                          value={[score]}
                          min={0}
                          max={10}
                          step={0.5}
                          onValueChange={(val) => setScore(val[0])}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="modal-reasoning"
                          className="text-xs text-muted-foreground block mb-2"
                        >
                          Reasoning
                        </label>
                        <Textarea
                          id="modal-reasoning"
                          value={reasoning}
                          onChange={(e) => setReasoning(e.target.value)}
                          placeholder="Provide justification for this score..."
                          className="w-full bg-black/20"
                          rows={3}
                        />
                      </div>
                      <div className="flex items-center justify-between pt-2">
                        <span className="text-[10px] text-muted-foreground italic">
                          Final score is calculated as: 60% Admin + 40% AI
                        </span>
                        <Button
                          type="button"
                          onClick={handleSubmit}
                          disabled={submitting}
                          className="flex items-center gap-2"
                        >
                          {submitting && (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          )}
                          Save Evaluation
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status, small }: { status: string; small?: boolean }) {
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

function ScoreBadge({ score, large }: { score: number; large?: boolean }) {
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
