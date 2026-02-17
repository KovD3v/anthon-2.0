"use client";

import { useMemo, useState } from "react";
import type { BenchmarkRun } from "../types";

export function filterBenchmarkRuns(runs: BenchmarkRun[], query: string) {
  const normalizedQuery = query.toLowerCase();
  return runs.filter(
    (run) =>
      run.name.toLowerCase().includes(normalizedQuery) ||
      run.models.some((model) => model.toLowerCase().includes(normalizedQuery)),
  );
}

export function groupBenchmarkRunsByDate(filteredRuns: BenchmarkRun[]) {
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

  return Object.entries(groups).filter(([, groupRuns]) => groupRuns.length > 0);
}

export function useBenchmarkPageState(runs: BenchmarkRun[]) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const filteredRuns = useMemo(
    () => filterBenchmarkRuns(runs, searchQuery),
    [runs, searchQuery],
  );

  const groupedRuns = useMemo(
    () => groupBenchmarkRunsByDate(filteredRuns),
    [filteredRuns],
  );

  return {
    searchQuery,
    setSearchQuery,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    filteredRuns,
    groupedRuns,
  };
}
