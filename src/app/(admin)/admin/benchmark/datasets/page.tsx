"use client";

import { m } from "framer-motion";
import {
  ArrowLeft,
  FlaskConical,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BenchmarkTestCase } from "../types";

export default function DatasetsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"ALL" | "ADVERSARIAL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: testCasesData, isLoading: loadingCases, refetch } = useQuery({
    queryKey: ["benchmark-test-cases-all"],
    queryFn: async () => {
      const res = await fetch("/api/admin/benchmark/test-cases?activeOnly=false");
      if (!res.ok) throw new Error("Failed to fetch test cases");
      return res.json() as Promise<{ testCases: BenchmarkTestCase[] }>;
    },
  });

  const { data: adversarialData } = useQuery({
    queryKey: ["benchmark-adversarial"],
    queryFn: async () => {
      const res = await fetch("/api/admin/benchmark/adversarial");
      if (!res.ok) return { cases: [] as BenchmarkTestCase[] };
      return res.json() as Promise<{ cases: BenchmarkTestCase[] }>;
    },
  });

  const testCases = testCasesData?.testCases ?? [];
  const pendingAdversarial = adversarialData?.cases ?? [];

  const generateMutation = useMutation({
    mutationFn: () =>
      fetch("/api/admin/benchmark/adversarial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 3, autoSave: true }),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to generate adversarial cases");
        return res.json();
      }),
    onSuccess: () => {
      alert("Generated 3 new adversarial cases for review.");
      queryClient.invalidateQueries({ queryKey: ["benchmark-adversarial"] });
      queryClient.invalidateQueries({ queryKey: ["benchmark-test-cases-all"] });
    },
    onError: (err: unknown) => {
      alert(err instanceof Error ? err.message : "Generation failed");
    },
  });

  const adversarialActionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      fetch("/api/admin/benchmark/adversarial", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseId: id, action }),
      }).then((res) => {
        if (!res.ok) throw new Error(`Failed to ${action}`);
        return res.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["benchmark-adversarial"] });
      queryClient.invalidateQueries({ queryKey: ["benchmark-test-cases-all"] });
    },
    onError: (err: unknown, variables) => {
      alert(err instanceof Error ? err.message : `Failed to ${variables.action}`);
    },
  });

  const displayedCases = activeTab === "ALL" ? testCases : pendingAdversarial;
  const filteredCases = displayedCases.filter(
    (tc) =>
      tc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tc.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tc.category.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (loadingCases) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
                  <FlaskConical className="h-5 w-5 text-primary" />
                  Benchmark Datasets
                </h1>
                <p className="text-xs text-muted-foreground">
                  Manage test cases for AI benchmarking
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetch()}
                className="bg-white/5 hover:bg-white/10"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Link href="/admin/benchmark/datasets/new">
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  New Test Case
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-2">
            <Button
              variant={activeTab === "ALL" ? "default" : "ghost"}
              onClick={() => setActiveTab("ALL")}
              className={cn(
                "transition-all",
                activeTab === "ALL"
                  ? "bg-primary text-primary-foreground"
                  : "bg-white/5 hover:bg-white/10",
              )}
            >
              All Test Cases ({testCases.length})
            </Button>
            <Button
              variant={activeTab === "ADVERSARIAL" ? "default" : "ghost"}
              onClick={() => setActiveTab("ADVERSARIAL")}
              className={cn(
                "transition-all flex items-center gap-2",
                activeTab === "ADVERSARIAL"
                  ? "bg-purple-500 text-white"
                  : "bg-white/5 hover:bg-white/10",
              )}
            >
              Pending Adversarial ({pendingAdversarial.length})
              {pendingAdversarial.length > 0 && (
                <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              )}
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search test cases..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-64"
            />
          </div>
        </div>

        {/* Adversarial Generator */}
        {activeTab === "ADVERSARIAL" && (
          <m.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-linear-to-r from-purple-500/10 to-blue-500/10 rounded-xl border border-purple-500/20"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-purple-400">
                  Adversarial Generator
                </h3>
                <p className="text-xs text-muted-foreground">
                  Uses LLM to find weaknesses in current models by generating
                  tricky edge cases.
                </p>
              </div>
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="bg-purple-500 hover:bg-purple-600 text-white gap-2"
              >
                {generateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Star className="h-4 w-4" />
                )}
                Generate 3 New Cases
              </Button>
            </div>
          </m.div>
        )}

        {/* Test Cases Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-12">
          {filteredCases.length === 0 ? (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-white/5 rounded-xl">
              <Search className="h-10 w-10 mb-4 opacity-10" />
              <p className="text-sm">
                No{" "}
                {activeTab === "ADVERSARIAL" ? "pending adversarial" : "test"}{" "}
                cases found.
              </p>
            </div>
          ) : (
            filteredCases.map((tc, index) => (
              <m.div
                key={tc.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
              >
                <Card
                  className={cn(
                    "border-white/5 bg-white/5 hover:border-primary/30 transition-all group overflow-hidden h-full",
                    activeTab === "ADVERSARIAL" &&
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
                        {activeTab === "ADVERSARIAL" ? (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() =>
                                adversarialActionMutation.mutate({ id: tc.id, action: "approve" })
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
                                adversarialActionMutation.mutate({ id: tc.id, action: "reject" })
                              }
                              className="h-6 w-6 hover:bg-red-500/20 text-red-400"
                              title="Reject & Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <Link href={`/admin/benchmark/datasets/${tc.id}`}>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-white/10 text-muted-foreground transition-all"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                    <Link
                      href={
                        activeTab === "ALL"
                          ? `/admin/benchmark/datasets/${tc.id}`
                          : "#"
                      }
                      className="flex-1"
                    >
                      <h3 className="text-sm font-semibold mb-1 line-clamp-1 hover:text-primary transition-colors">
                        {tc.name}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-3 mb-3 h-12 overflow-hidden">
                        {tc.description}
                      </p>
                    </Link>
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
              </m.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
