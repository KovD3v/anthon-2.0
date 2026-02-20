"use client";

import { AnimatePresence, m } from "framer-motion";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Database,
  Loader2,
  RefreshCw,
  Shuffle,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TestCaseSetup } from "@/lib/benchmark/types";
import { cn } from "@/lib/utils";
import type {
  BenchmarkResult,
  BenchmarkRun,
  BenchmarkTestCase,
} from "../types";

// [REMOVED] Static dataset import

interface BlindPair {
  resultA: BenchmarkResult;
  resultB: BenchmarkResult;
  testCaseId: string;
}

function BlindComparisonPage() {
  const searchParams = useSearchParams();
  const runIdParam = searchParams.get("runId");
  const queryClient = useQueryClient();

  const [selectedRunId, setSelectedRunId] = useState<string | null>(runIdParam);
  const [blindPair, setBlindPair] = useState<BlindPair | null>(null);
  const [modelsRevealed, setModelsRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [preference, setPreference] = useState<
    "A" | "B" | "both_good" | "both_bad" | null
  >(null);
  const [starA, setStarA] = useState(false);
  const [starB, setStarB] = useState(false);
  const [tomatoA, setTomatoA] = useState(false);
  const [tomatoB, setTomatoB] = useState(false);
  const [expandedContextA, setExpandedContextA] = useState(false);
  const [expandedContextB, setExpandedContextB] = useState(false);

  const { data: runsData } = useQuery({
    queryKey: ["compare-benchmark-runs"],
    queryFn: async (): Promise<BenchmarkRun[]> => {
      const res = await fetch("/api/admin/benchmark");
      if (!res.ok) throw new Error("Failed to fetch runs");
      const data = await res.json();
      return data.runs?.filter((r: BenchmarkRun) => r.status === "COMPLETED") ?? [];
    },
  });

  const { data: dbTestCasesData } = useQuery({
    queryKey: ["compare-test-cases"],
    queryFn: async (): Promise<BenchmarkTestCase[]> => {
      const res = await fetch("/api/admin/benchmark/test-cases");
      if (!res.ok) throw new Error("Failed to fetch test cases");
      const data = await res.json();
      return data.testCases ?? [];
    },
  });

  const { data: resultsData, isLoading: loading } = useQuery({
    queryKey: ["compare-results", selectedRunId],
    queryFn: async (): Promise<BenchmarkResult[]> => {
      const res = await fetch(`/api/admin/benchmark?runId=${selectedRunId}`);
      if (!res.ok) throw new Error("Failed to fetch results");
      const data = await res.json();
      return data.run?.results ?? [];
    },
    enabled: !!selectedRunId,
  });

  const runs = runsData ?? [];
  const results = resultsData ?? [];
  const dbTestCases = dbTestCasesData ?? [];

  // Get test case from database
  const testCase = (() => {
    if (!blindPair?.testCaseId) return null;
    return (
      dbTestCases.find(
        (tc) =>
          tc.externalId === blindPair.testCaseId ||
          tc.id === blindPair.testCaseId,
      ) || null
    );
  })();

  function pickRandomPair() {
    if (results.length < 2) return;

    // Group results by testCaseId
    const byTestCase: Record<string, BenchmarkResult[]> = {};
    results.forEach((r) => {
      if (!byTestCase[r.testCaseId]) byTestCase[r.testCaseId] = [];
      byTestCase[r.testCaseId].push(r);
    });

    // Find test cases with at least 2 results from different models
    const validTestCases = Object.entries(byTestCase).filter(
      ([, rs]) => new Set(rs.map((r) => r.modelId)).size >= 2,
    );

    if (validTestCases.length === 0) return;

    // Pick a random test case
    const [testCaseId, testResults] =
      validTestCases[Math.floor(Math.random() * validTestCases.length)];

    // Pick 2 random results from different models
    const shuffled = [...testResults].sort(() => Math.random() - 0.5);
    const [resultA, resultB] = shuffled.slice(0, 2);

    // Randomize which is shown as A or B
    const shouldSwap = Math.random() > 0.5;

    setBlindPair({
      resultA: shouldSwap ? resultB : resultA,
      resultB: shouldSwap ? resultA : resultB,
      testCaseId,
    });
    setPreference(null);
    setStarA(false);
    setStarB(false);
    setTomatoA(false);
    setTomatoB(false);
    setModelsRevealed(false);
    setExpandedContextA(false);
    setExpandedContextB(false);
  }

  const submitScores = async () => {
    if (!blindPair || !preference) return;
    setSubmitting(true);

    const preferenceLabel = {
      A: "A preferred",
      B: "B preferred",
      both_good: "Both good",
      both_bad: "Both bad",
    }[preference];

    let scoreA = 5;
    let scoreB = 5;
    switch (preference) {
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

    // Apply modifiers
    if (starA) scoreA = Math.min(10, scoreA + 2);
    if (tomatoA) scoreA = Math.max(1, scoreA - 2);
    if (starB) scoreB = Math.min(10, scoreB + 2);
    if (tomatoB) scoreB = Math.max(1, scoreB - 2);

    const modifiersA = [starA && "⭐+2", tomatoA && "🍅-2"]
      .filter(Boolean)
      .join(" ");
    const modifiersB = [starB && "⭐+2", tomatoB && "🍅-2"]
      .filter(Boolean)
      .join(" ");

    const ok = await Promise.all([
      fetch("/api/admin/benchmark", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resultId: blindPair.resultA.id,
          adminScore: scoreA,
          adminReasoning: `Blind A/B comparison: ${preferenceLabel}${
            modifiersA ? ` (${modifiersA})` : ""
          }`,
        }),
      }),
      fetch("/api/admin/benchmark", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resultId: blindPair.resultB.id,
          adminScore: scoreB,
          adminReasoning: `Blind A/B comparison: ${preferenceLabel}${
            modifiersB ? ` (${modifiersB})` : ""
          }`,
        }),
      }),
    ]).catch((err: unknown) => {
      setSubmitting(false);
      console.error("Failed to submit:", err);
      alert("Failed to submit scores");
      return null;
    });
    if (!ok) return;

    setModelsRevealed(true);
    // Refresh results to get updated scores
    if (selectedRunId) {
      queryClient.invalidateQueries({ queryKey: ["compare-results", selectedRunId] });
    }
    setSubmitting(false);
  };

  // Auto-pick a blind pair when results first load
  useEffect(() => {
    if (results.length >= 2 && !blindPair) {
      // Use queueMicrotask to avoid synchronous setState inside effect body
      queueMicrotask(() => pickRandomPair());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/admin/benchmark">
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                  👁️ Blind A/B Comparison
                  <Badge className="text-xs bg-purple-500/20 text-purple-400 border-0">
                    Model names hidden
                  </Badge>
                </h1>
                <p className="text-xs text-muted-foreground">
                  Compare responses without knowing which model generated them
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={selectedRunId || ""}
                onChange={(e) => {
                  setSelectedRunId(e.target.value);
                  setBlindPair(null);
                }}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm"
              >
                <option value="">Select a run...</option>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.name} ({run._count?.results || 0} results)
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="sm"
                onClick={pickRandomPair}
                disabled={results.length < 2}
                className="bg-white/5 hover:bg-white/10 gap-2"
              >
                <Shuffle className="h-4 w-4" />
                New Pair
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex h-[50vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !selectedRunId ? (
          <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-muted-foreground">
            <Shuffle className="h-12 w-12 opacity-20" />
            <p>Select a benchmark run to start comparing</p>
          </div>
        ) : !blindPair ? (
          <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-muted-foreground">
            <RefreshCw className="h-12 w-12 opacity-20" />
            <p>Not enough results to compare in this run</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Test Case Info + User Prompt */}
            <div className="p-4 bg-white/5 rounded-lg border border-white/10 space-y-3">
              <p className="text-sm text-muted-foreground">
                Test:{" "}
                <span className="text-foreground font-medium">
                  {blindPair.testCaseId}
                </span>
              </p>
              {testCase && (
                <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                  <div className="text-[10px] uppercase font-bold text-emerald-400 mb-2">
                    👤 User Prompt
                  </div>
                  <p className="text-sm whitespace-pre-wrap">
                    {testCase.userMessage}
                  </p>
                </div>
              )}
            </div>

            {/* Test Context (Profile, Preferences, Memories, Session) */}
            {testCase?.setup && (
              <div className="p-4 bg-white/5 rounded-lg border border-white/10 space-y-4">
                <h3 className="text-sm font-medium flex items-center gap-2 flex-wrap">
                  📋 Test Context
                  {(testCase.setup as unknown as TestCaseSetup).userContext
                    ?.profile && (
                    <Badge className="text-[10px] bg-cyan-500/20 text-cyan-400 border-0">
                      profile
                    </Badge>
                  )}
                  {(testCase.setup as unknown as TestCaseSetup).memories
                    ?.length && (
                    <Badge className="text-[10px] bg-purple-500/20 text-purple-400 border-0">
                      {
                        (testCase.setup as unknown as TestCaseSetup).memories
                          ?.length
                      }{" "}
                      memories
                    </Badge>
                  )}
                  {(testCase.setup as unknown as TestCaseSetup).session
                    ?.length && (
                    <Badge className="text-[10px] bg-blue-500/20 text-blue-400 border-0">
                      {
                        (testCase.setup as unknown as TestCaseSetup).session
                          ?.length
                      }{" "}
                      messages
                    </Badge>
                  )}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {/* User Profile */}
                  {(testCase.setup as unknown as TestCaseSetup).userContext
                    ?.profile &&
                    Object.keys(
                      (testCase.setup as unknown as TestCaseSetup).userContext
                        ?.profile || {},
                    ).length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase font-bold text-muted-foreground mb-2">
                          👤 User Profile
                        </div>
                        <div className="max-h-32 overflow-y-auto rounded border border-white/10 bg-black/20 p-3">
                          <ul className="text-[11px] space-y-1.5">
                            {Object.entries(
                              (testCase.setup as unknown as TestCaseSetup)
                                .userContext?.profile || {},
                            ).map(([key, value]) => (
                              <li key={key} className="flex gap-2">
                                <span className="font-mono text-cyan-400 font-medium shrink-0">
                                  {key}:
                                </span>
                                <span className="text-muted-foreground truncate">
                                  {value || "—"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  {/* Preferences */}
                  {(testCase.setup as unknown as TestCaseSetup).userContext
                    ?.preferences &&
                    Object.keys(
                      (testCase.setup as unknown as TestCaseSetup).userContext
                        ?.preferences || {},
                    ).length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase font-bold text-muted-foreground mb-2">
                          ⚙️ Preferences
                        </div>
                        <div className="max-h-32 overflow-y-auto rounded border border-white/10 bg-black/20 p-3">
                          <ul className="text-[11px] space-y-1.5">
                            {Object.entries(
                              (testCase.setup as unknown as TestCaseSetup)
                                .userContext?.preferences || {},
                            ).map(([key, value]) => (
                              <li key={key} className="flex gap-2">
                                <span className="font-mono text-amber-400 font-medium shrink-0">
                                  {key}:
                                </span>
                                <span className="text-muted-foreground truncate">
                                  {value || "—"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  {/* Memories */}
                  {(testCase.setup as unknown as TestCaseSetup).memories
                    ?.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase font-bold text-muted-foreground mb-2">
                        💾 Memories
                      </div>
                      <div className="max-h-32 overflow-y-auto rounded border border-white/10 bg-black/20 p-3">
                        <ul className="text-[11px] space-y-1.5">
                          {(
                            testCase.setup as unknown as TestCaseSetup
                          ).memories?.map(
                            (m: { key: string; value: string }) => (
                              <li key={m.key} className="flex gap-2">
                                <span className="font-mono text-primary font-medium shrink-0">
                                  {m.key}:
                                </span>
                                <span className="text-muted-foreground truncate">
                                  {m.value}
                                </span>
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    </div>
                  )}
                  {/* Session */}
                  {(testCase.setup as unknown as TestCaseSetup).session
                    ?.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase font-bold text-muted-foreground mb-2">
                        💬 Session History
                      </div>
                      <div className="max-h-32 overflow-y-auto rounded border border-white/10 bg-black/20 p-3">
                        <ul className="text-[11px] space-y-1.5">
                          {(
                            testCase.setup as unknown as TestCaseSetup
                          ).session?.map(
                            (
                              msg: {
                                role: string;
                                content: string;
                              },
                              i: number,
                            ) => (
                              <li
                                key={`${msg.role}-${msg.content.slice(0, 24)}-${msg.content.length}`}
                                className="line-clamp-1"
                              >
                                <span className="font-bold opacity-50 uppercase text-[9px] mr-1.5">
                                  {msg.role}
                                </span>
                                <span className="text-muted-foreground">
                                  {msg.content}
                                </span>
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Side-by-side Responses */}
            <div className="grid grid-cols-2 gap-6">
              {/* Response A */}
              <m.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-xl">
                    {modelsRevealed ? (
                      <span className="text-emerald-400">
                        {blindPair.resultA.modelId.split("/")[1]}
                      </span>
                    ) : (
                      "Response A"
                    )}
                  </h3>
                  {!modelsRevealed && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setStarA(!starA)}
                        className={cn(
                          "h-8 px-3",
                          starA
                            ? "bg-yellow-500/30 text-yellow-400 hover:bg-yellow-500/40"
                            : "bg-white/5 hover:bg-white/10",
                        )}
                        title="+2 bonus"
                      >
                        ⭐
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTomatoA(!tomatoA)}
                        className={cn(
                          "h-8 px-3",
                          tomatoA
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
                <div className="bg-white/5 rounded-xl p-6 border border-white/10 h-100">
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {blindPair.resultA.responseText}
                  </p>
                </div>
                {modelsRevealed && (
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      Score: {blindPair.resultA.overallScore.toFixed(1)}
                    </span>
                    <span>
                      {blindPair.resultA.inferenceTimeMs}
                      ms
                    </span>
                    <span>${blindPair.resultA.costUsd?.toFixed(5)}</span>
                  </div>
                )}
              </m.div>

              {/* Response B */}
              <m.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-xl">
                    {modelsRevealed ? (
                      <span className="text-emerald-400">
                        {blindPair.resultB.modelId.split("/")[1]}
                      </span>
                    ) : (
                      "Response B"
                    )}
                  </h3>
                  {!modelsRevealed && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setStarB(!starB)}
                        className={cn(
                          "h-8 px-3",
                          starB
                            ? "bg-yellow-500/30 text-yellow-400 hover:bg-yellow-500/40"
                            : "bg-white/5 hover:bg-white/10",
                        )}
                        title="+2 bonus"
                      >
                        ⭐
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTomatoB(!tomatoB)}
                        className={cn(
                          "h-8 px-3",
                          tomatoB
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
                <div className="bg-white/5 rounded-xl p-6 border border-white/10 h-100">
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {blindPair.resultB.responseText}
                  </p>
                </div>
                {modelsRevealed && (
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      Score: {blindPair.resultB.overallScore.toFixed(1)}
                    </span>
                    <span>
                      {blindPair.resultB.inferenceTimeMs}
                      ms
                    </span>
                    <span>${blindPair.resultB.costUsd?.toFixed(5)}</span>
                  </div>
                )}
              </m.div>
            </div>

            {/* Tool Usage Comparison */}
            {((blindPair.resultA.toolCalls?.length ?? 0) > 0 ||
              (blindPair.resultB.toolCalls?.length ?? 0) > 0) && (
              <div className="grid grid-cols-2 gap-6">
                {/* Tool Calls A */}
                <div>
                  <button
                    type="button"
                    onClick={() => setExpandedContextA(!expandedContextA)}
                    className="w-full flex items-center justify-between p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 hover:bg-amber-500/15 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Database className="h-4 w-4 text-amber-400" />
                      Tool Usage A
                      {blindPair.resultA.toolCalls?.length ? (
                        <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-0">
                          {blindPair.resultA.toolCalls.length} calls
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          No tools used
                        </span>
                      )}
                    </div>
                    {expandedContextA ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  <AnimatePresence>
                    {expandedContextA &&
                      (blindPair.resultA.toolCalls?.length ?? 0) > 0 && (
                        <m.div
                          initial={{
                            height: 0,
                            opacity: 0,
                          }}
                          animate={{
                            height: "auto",
                            opacity: 1,
                          }}
                          exit={{
                            height: 0,
                            opacity: 0,
                          }}
                          className="overflow-hidden"
                        >
                          <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                            {blindPair.resultA.toolCalls?.map((call, i) => (
                              <div
                                key={`a-${call.name}-${JSON.stringify(call.args).slice(0, 20)}`}
                                className="p-3 bg-black/20 rounded border border-white/10"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-mono text-xs font-bold text-amber-400">
                                    {call.name}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    #{i + 1}
                                  </span>
                                </div>
                                <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto">
                                  {JSON.stringify(call.args, null, 2)}
                                </pre>
                              </div>
                            ))}
                          </div>
                        </m.div>
                      )}
                  </AnimatePresence>
                </div>

                {/* Tool Calls B */}
                <div>
                  <button
                    type="button"
                    onClick={() => setExpandedContextB(!expandedContextB)}
                    className="w-full flex items-center justify-between p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 hover:bg-amber-500/15 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Database className="h-4 w-4 text-amber-400" />
                      Tool Usage B
                      {blindPair.resultB.toolCalls?.length ? (
                        <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-0">
                          {blindPair.resultB.toolCalls.length} calls
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          No tools used
                        </span>
                      )}
                    </div>
                    {expandedContextB ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  <AnimatePresence>
                    {expandedContextB &&
                      (blindPair.resultB.toolCalls?.length ?? 0) > 0 && (
                        <m.div
                          initial={{
                            height: 0,
                            opacity: 0,
                          }}
                          animate={{
                            height: "auto",
                            opacity: 1,
                          }}
                          exit={{
                            height: 0,
                            opacity: 0,
                          }}
                          className="overflow-hidden"
                        >
                          <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                            {blindPair.resultB.toolCalls?.map((call, i) => (
                              <div
                                key={`b-${call.name}-${JSON.stringify(call.args).slice(0, 20)}`}
                                className="p-3 bg-black/20 rounded border border-white/10"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-mono text-xs font-bold text-amber-400">
                                    {call.name}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    #{i + 1}
                                  </span>
                                </div>
                                <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto">
                                  {JSON.stringify(call.args, null, 2)}
                                </pre>
                              </div>
                            ))}
                          </div>
                        </m.div>
                      )}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* Preference Selection */}
            <div className="pt-6 border-t border-white/10">
              {modelsRevealed ? (
                <m.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center justify-center gap-6"
                >
                  <div className="text-center space-y-2">
                    <p className="text-lg font-medium text-emerald-400">
                      ✅ Models Revealed!
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Your preference:{" "}
                      <span className="font-medium text-purple-400">
                        {preference === "A"
                          ? "A is Better"
                          : preference === "B"
                            ? "B is Better"
                            : preference === "both_good"
                              ? "Both Good"
                              : "Both Bad"}
                      </span>
                    </p>
                  </div>
                  <Button
                    onClick={pickRandomPair}
                    className="bg-purple-500 hover:bg-purple-600 text-white gap-2"
                  >
                    <Shuffle className="h-4 w-4" />
                    Next Comparison
                  </Button>
                </m.div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-center gap-4 flex-wrap">
                    <span className="text-sm text-muted-foreground">
                      Preference:
                    </span>
                    <div className="flex gap-3 flex-wrap">
                      {[
                        {
                          value: "both_good" as const,
                          label: "👍 Both Good",
                        },
                        {
                          value: "A" as const,
                          label: "✨ A is Better",
                        },
                        {
                          value: "B" as const,
                          label: "✨ B is Better",
                        },
                        {
                          value: "both_bad" as const,
                          label: "👎 Both Bad",
                        },
                      ].map(({ value, label }) => (
                        <Button
                          key={value}
                          variant={preference === value ? "default" : "outline"}
                          onClick={() => setPreference(value)}
                          className={cn(
                            "transition-all text-base px-6 py-5",
                            preference === value
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
                      onClick={submitScores}
                      disabled={!preference || submitting}
                      className="bg-purple-500 hover:bg-purple-600 text-white gap-2 px-6"
                    >
                      {submitting && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      Submit & Reveal Models
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BlindComparisonPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
      <BlindComparisonPage />
    </Suspense>
  );
}
