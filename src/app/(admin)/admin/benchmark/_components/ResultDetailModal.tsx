"use client";

import {
  Database,
  FileJson,
  Loader2,
  MessageSquare,
  Star,
  User,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import type { TestCaseSetup } from "@/lib/benchmark/types";
import { cn } from "@/lib/utils";
import type { BenchmarkResult, BenchmarkTestCase } from "../types";

export function ResultDetailModal({
  result,
  onClose,
  onSubmitScore,
  testCases,
}: {
  result: BenchmarkResult;
  onClose: () => void;
  onSubmitScore: (id: string, score: number, reasoning: string) => void;
  testCases: BenchmarkTestCase[];
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

  const testCase = testCases.find(
    (tc) => tc.externalId === result.testCaseId || tc.id === result.testCaseId,
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
                                  msg: {
                                    role: string;
                                    content: string;
                                  },
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
