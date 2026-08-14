import type { Usage } from "@/types/chat";

export interface LegacyTimelineRow {
  id: string;
  label: string;
  startOffsetMs: number;
  endOffsetMs: number;
  durationMs: number;
  startPercent: number;
  widthPercent: number;
  outcome?: NonNullable<Usage["executionRoute"]>["attempts"][number]["outcome"];
  firstTokenOffsetMs?: number;
}

export interface LegacyLatencyTimeline {
  estimatedGenerationCompleteMs: number;
  firstTokenMs?: number;
  rows: LegacyTimelineRow[];
}

function percentage(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (value / total) * 100));
}

export function deriveLegacyLatencyTimeline(
  usage: Usage,
): LegacyLatencyTimeline | null {
  const route = usage.executionRoute;
  if (!route) return null;

  let cursorMs = 0;
  const rawRows: Array<
    Omit<LegacyTimelineRow, "startPercent" | "widthPercent">
  > = [];
  const appendRow = (
    row: Omit<
      LegacyTimelineRow,
      "startOffsetMs" | "endOffsetMs" | "startPercent" | "widthPercent"
    >,
  ) => {
    const startOffsetMs = cursorMs;
    cursorMs += row.durationMs;
    rawRows.push({
      ...row,
      startOffsetMs,
      endOffsetMs: cursorMs,
    });
  };

  if (
    route.classificationLatencyMs > 0 ||
    route.decisionSource === "classifier" ||
    route.decisionSource === "mixed"
  ) {
    appendRow({
      id: "classification",
      label: "Classificazione",
      durationMs: route.classificationLatencyMs,
    });
  }
  appendRow({
    id: "routing",
    label: "Routing",
    durationMs: route.routingOverheadMs,
  });

  for (const attempt of route.attempts) {
    appendRow({
      id: `attempt-${attempt.sequence}`,
      label:
        route.attempts.length > 1
          ? `Generazione ${attempt.profile === "light" ? "Light" : "Standard"} · tentativo ${attempt.sequence}`
          : `Generazione ${attempt.profile === "light" ? "Light" : "Standard"}`,
      durationMs: attempt.generationTimeMs,
      outcome: attempt.outcome,
      ...(attempt.outcome === "completed" &&
      route.totalRequestTimeToFirstTokenMs !== undefined
        ? { firstTokenOffsetMs: route.totalRequestTimeToFirstTokenMs }
        : {}),
    });
  }

  const estimatedGenerationCompleteMs = cursorMs;
  const scaleMs = Math.max(
    estimatedGenerationCompleteMs,
    route.totalRequestTimeToFirstTokenMs ?? 0,
  );

  return {
    estimatedGenerationCompleteMs,
    ...(route.totalRequestTimeToFirstTokenMs !== undefined
      ? { firstTokenMs: route.totalRequestTimeToFirstTokenMs }
      : {}),
    rows: rawRows.map((row) => ({
      ...row,
      startPercent: percentage(row.startOffsetMs, scaleMs),
      widthPercent: percentage(row.durationMs, scaleMs),
    })),
  };
}
