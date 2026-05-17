"use client";

import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Database,
  FileJson,
  Loader2,
  MessageSquare,
  Star,
  User,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import type { TestCaseSetup } from "@/lib/benchmark/types";
import { cn } from "@/lib/utils";
import type { BenchmarkResult, BenchmarkTestCase } from "../../../types";

// [REMOVED] Static dataset import

export default function ResultDetailPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.runId as string;
  const resultId = params.resultId as string;

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [allResults, setAllResults] = useState<BenchmarkResult[]>([]);
  const [testCases, setTestCases] = useState<BenchmarkTestCase[]>([]);
  const [showRawJson, setShowRawJson] = useState(false);

  // Admin scoring state
  const [score, setScore] = useState(5);
  const [reasoning, setReasoning] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchResult = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/benchmark?runId=${runId}`);
      if (!res.ok) throw new Error("Failed to fetch run");
      const data = await res.json();

      const results = data.run?.results || [];
      setAllResults(results);

      const currentResult = results.find(
        (r: BenchmarkResult) => r.id === resultId,
      );
      if (currentResult) {
        setResult(currentResult);
        setScore(currentResult.adminScore ?? 5);
        setReasoning(currentResult.adminReasoning ?? "");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [runId, resultId]);

  const fetchTestCases = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/benchmark/test-cases");
      if (!res.ok) throw new Error("Failed to fetch test cases");
      const data = await res.json();
      setTestCases(data.testCases || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchResult();
    fetchTestCases();
  }, [fetchResult, fetchTestCases]);

  const submitScore = async () => {
    if (!result) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/benchmark", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resultId: result.id,
          adminScore: score,
          adminReasoning: reasoning,
        }),
      });
      if (!res.ok) throw new Error("Failed to submit");
      fetchResult();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  // Navigation between results
  const currentIndex = allResults.findIndex((r) => r.id === resultId);
  const prevResult = currentIndex > 0 ? allResults[currentIndex - 1] : null;
  const nextResult =
    currentIndex < allResults.length - 1 ? allResults[currentIndex + 1] : null;

  const testCase = result?.testCaseId
    ? testCases.find(
        (tc) =>
          tc.id === result.testCaseId || tc.externalId === result.testCaseId,
      )
    : null;

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Result not found</p>
        <Link href={`/admin/benchmark`}>
          <Button variant="outline">Back to Benchmark</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-12">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/admin/benchmark">
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-lg font-semibold flex items-center gap-2">
                  {testCase?.name || result.testCaseId}
                  <span className="text-muted-foreground">—</span>
                  <span className="text-primary">
                    {result.modelId.split("/")[1]}
                  </span>
                </h1>
                <p className="text-xs text-muted-foreground">
                  {result.category === "TOOL_USAGE"
                    ? "🔧 Tool Usage"
                    : "✍️ Writing Quality"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={showRawJson ? "default" : "ghost"}
                size="icon"
                onClick={() => setShowRawJson(!showRawJson)}
                className="h-9 w-9"
                title="View Raw JSON"
              >
                <FileJson className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1 ml-4">
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={!prevResult}
                  onClick={() =>
                    prevResult &&
                    router.push(
                      `/admin/benchmark/${runId}/result/${prevResult.id}`,
                    )
                  }
                  className="h-9 w-9"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground px-2">
                  {currentIndex + 1} / {allResults.length}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={!nextResult}
                  onClick={() =>
                    nextResult &&
                    router.push(
                      `/admin/benchmark/${runId}/result/${nextResult.id}`,
                    )
                  }
                  className="h-9 w-9"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {showRawJson ? (
          <div className="bg-black/50 p-6 rounded-lg overflow-auto">
            <pre className="text-xs font-mono whitespace-pre-wrap">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Score Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <div className="p-4 bg-white/5 rounded-lg text-center border border-white/10">
                <div className="text-3xl font-bold">
                  {result.overallScore.toFixed(1)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  AI Score
                </div>
              </div>
              <div className="p-4 bg-white/5 rounded-lg text-center border border-white/10">
                <div className="text-3xl font-bold">
                  {result.adminScore?.toFixed(1) ?? "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Admin Score
                </div>
              </div>
              <div className="p-4 bg-primary/10 rounded-lg text-center border border-primary/20">
                <div className="text-3xl font-bold text-primary">
                  {(result.finalScore ?? result.overallScore).toFixed(1)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Final Score
                </div>
              </div>
              <div className="p-4 bg-white/5 rounded-lg text-center border border-white/10">
                <div className="text-xl font-mono">
                  {result.inferenceTimeMs}ms
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Latency
                </div>
              </div>
              <div className="p-4 bg-white/5 rounded-lg text-center border border-white/10">
                <div className="text-xl font-mono">
                  ${result.costUsd?.toFixed(5) ?? "0.00"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Cost</div>
              </div>
              <div className="p-4 bg-white/5 rounded-lg text-center border border-white/10">
                <div className="text-xl font-mono">
                  {result.inputTokens + result.outputTokens}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Total Tokens
                </div>
              </div>
            </div>

            {/* Multi-Judge Consensus */}
            {(result.judge2OverallScore !== undefined ||
              result.consensusScore !== undefined) && (
              <div className="p-6 bg-linear-to-r from-purple-500/10 to-blue-500/10 rounded-xl border border-purple-500/20">
                <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                  ⚖️ Multi-Judge Consensus
                  {result.flaggedForReview && (
                    <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-0">
                      ⚠️ Flagged for Review
                    </Badge>
                  )}
                </h3>
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-black/20 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">
                      Judge 1
                    </div>
                    <div className="text-sm font-mono text-blue-400">
                      grok-4-fast
                    </div>
                    <div className="text-2xl font-bold mt-1">
                      {result.overallScore.toFixed(1)}
                    </div>
                  </div>
                  <div className="text-center p-3 bg-black/20 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">
                      Judge 2
                    </div>
                    <div className="text-sm font-mono text-purple-400">
                      gemini-3-flash
                    </div>
                    <div className="text-2xl font-bold mt-1">
                      {result.judge2OverallScore?.toFixed(1) ?? "—"}
                    </div>
                  </div>
                  <div className="text-center p-3 bg-black/20 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">
                      Consensus
                    </div>
                    <div className="text-sm font-mono text-emerald-400">
                      Average
                    </div>
                    <div className="text-2xl font-bold text-emerald-400 mt-1">
                      {result.consensusScore?.toFixed(1) ?? "—"}
                    </div>
                  </div>
                  <div className="text-center p-3 bg-black/20 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">
                      Disagreement
                    </div>
                    <div className="text-sm font-mono text-muted-foreground">
                      Δ
                    </div>
                    <div
                      className={cn(
                        "text-2xl font-bold mt-1",
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

            {/* User Prompt */}
            {testCase && (
              <div>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <User className="h-4 w-4 text-emerald-400" />
                  User Prompt
                </h3>
                <div className="p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                  <p className="text-sm whitespace-pre-wrap">
                    {testCase.userMessage}
                  </p>
                </div>
              </div>
            )}

            {/* Context (Memories & Session) */}
            {testCase?.setup && (
              <div className="grid grid-cols-2 gap-6">
                {(testCase.setup as unknown as TestCaseSetup).memories?.length >
                  0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-3">
                      💾 Memories (
                      {
                        (testCase.setup as unknown as TestCaseSetup).memories
                          ?.length
                      }
                      )
                    </h3>
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-4">
                      <ul className="text-xs space-y-2">
                        {(
                          testCase.setup as unknown as TestCaseSetup
                        ).memories?.map((m: { key: string; value: string }) => (
                          <li key={m.key} className="flex gap-2">
                            <span className="font-mono text-primary font-medium">
                              {m.key}:
                            </span>
                            <span className="text-muted-foreground">
                              {m.value}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                {(testCase.setup as unknown as TestCaseSetup).session?.length >
                  0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-3">
                      💬 Session (
                      {
                        (testCase.setup as unknown as TestCaseSetup).session
                          ?.length
                      }{" "}
                      messages)
                    </h3>
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-4">
                      <ul className="text-xs space-y-2">
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
                              key={`${msg.role}-${i}`}
                              className="line-clamp-2"
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
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AI Response */}
            <div>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-400" />
                AI Response
              </h3>
              <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {result.responseText}
                </p>
              </div>
            </div>

            {/* Tool Calls */}
            {result.toolCalls && result.toolCalls.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Database className="h-4 w-4 text-amber-400" />
                  Tool Execution Log ({result.toolCalls.length} calls)
                </h3>
                <div className="space-y-3">
                  {result.toolCalls.map((call, i) => (
                    <div
                      key={`${call.name}-${i}`}
                      className="p-4 bg-amber-500/5 rounded-lg border border-amber-500/10"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-mono font-bold text-amber-400">
                          {call.name}
                        </span>
                        <span className="text-[10px] opacity-50">
                          Call #{i + 1}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-[10px] uppercase font-bold text-muted-foreground mb-2">
                            Arguments
                          </div>
                          <pre className="p-3 bg-black/20 rounded-lg font-mono text-xs overflow-x-auto">
                            {JSON.stringify(call.args, null, 2)}
                          </pre>
                        </div>
                        {call.result !== undefined && (
                          <div>
                            <div className="text-[10px] uppercase font-bold text-muted-foreground mb-2">
                              Result
                            </div>
                            <pre className="p-3 bg-black/20 rounded-lg font-mono text-xs overflow-x-auto">
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

            {/* Judge Analysis */}
            {(result.toolUsageCritique || result.writingQualityCritique) && (
              <div>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-purple-400" />
                  Judge Analysis (Chain of Thought)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-purple-500/5 rounded-lg border border-purple-500/10">
                    <div className="text-[10px] font-bold uppercase text-purple-400 mb-3">
                      Judge 1 (Primary)
                    </div>
                    <div className="space-y-3 text-xs">
                      {result.toolUsageCritique && (
                        <div>
                          <span className="font-semibold">Tool Usage:</span>
                          <pre className="mt-1 p-2 bg-black/20 rounded font-mono text-[10px] whitespace-pre-wrap overflow-x-auto">
                            {JSON.stringify(result.toolUsageCritique, null, 2)}
                          </pre>
                        </div>
                      )}
                      {result.writingQualityCritique && (
                        <div>
                          <span className="font-semibold">
                            Writing Quality:
                          </span>
                          <pre className="mt-1 p-2 bg-black/20 rounded font-mono text-[10px] whitespace-pre-wrap overflow-x-auto">
                            {JSON.stringify(
                              result.writingQualityCritique,
                              null,
                              2,
                            )}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                  {(result.judge2ToolUsageCritique ||
                    result.judge2WritingQualityCritique) && (
                    <div className="p-4 bg-blue-500/5 rounded-lg border border-blue-500/10">
                      <div className="text-[10px] font-bold uppercase text-blue-400 mb-3">
                        Judge 2 (Consensus)
                      </div>
                      <div className="space-y-3 text-xs">
                        {result.judge2ToolUsageCritique && (
                          <div>
                            <span className="font-semibold">Tool Usage:</span>
                            <pre className="mt-1 p-2 bg-black/20 rounded font-mono text-[10px] whitespace-pre-wrap overflow-x-auto">
                              {JSON.stringify(
                                result.judge2ToolUsageCritique,
                                null,
                                2,
                              )}
                            </pre>
                          </div>
                        )}
                        {result.judge2WritingQualityCritique && (
                          <div>
                            <span className="font-semibold">
                              Writing Quality:
                            </span>
                            <pre className="mt-1 p-2 bg-black/20 rounded font-mono text-[10px] whitespace-pre-wrap overflow-x-auto">
                              {JSON.stringify(
                                result.judge2WritingQualityCritique,
                                null,
                                2,
                              )}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Judge Summary */}
            {(result.toolUsageReasoning || result.writingQualityReasoning) && (
              <div>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-400" />
                  Judge Summary Reasoning
                </h3>
                <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
                  <p className="text-sm italic">
                    {result.toolUsageReasoning ||
                      result.writingQualityReasoning}
                  </p>
                </div>
              </div>
            )}

            {/* Admin Scoring */}
            <div className="p-6 bg-white/5 rounded-xl border border-white/10">
              <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                <Star className="h-4 w-4 text-primary" />
                Your Evaluation
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label
                      className="text-xs text-muted-foreground"
                      htmlFor="score-slider"
                    >
                      Score (0-10)
                    </label>
                    <span className="text-xl font-bold text-primary">
                      {score}
                    </span>
                  </div>
                  <Slider
                    id="score-slider"
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
                    className="text-xs text-muted-foreground block mb-2"
                    htmlFor="reasoning-textarea"
                  >
                    Reasoning
                  </label>
                  <Textarea
                    id="reasoning-textarea"
                    value={reasoning}
                    onChange={(e) => setReasoning(e.target.value)}
                    placeholder="Provide justification for this score..."
                    className="w-full bg-black/20 min-h-[100px]"
                  />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-[10px] text-muted-foreground italic">
                    Final score is calculated as: 60% Admin + 40% AI
                  </span>
                  <Button
                    onClick={submitScore}
                    disabled={submitting}
                    className="gap-2"
                  >
                    {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
                    Save Evaluation
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
