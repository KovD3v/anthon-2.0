import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

type BenchmarkReport = {
  durationMs?: number;
  models?: BenchmarkModel[];
};

type BenchmarkModel = {
  modelId: string;
  scenarioCount?: number;
  turnCount?: number;
  avgScore?: number;
  avgJudgeScore?: number;
  avgBlendedScore?: number;
  avgLatencyMs?: number;
  totalCostUsd?: number;
  totalJudgeCostUsd?: number;
  totalRunCostUsd?: number;
  safetyFailures?: number;
  judgeFlags?: number;
};

type RunPoint = {
  file: string;
  suite: "full" | "reduced";
  modelId: string;
  scenarios: number;
  turns: number;
  blended: number;
  judge: number;
  heuristic: number;
  latencyMs: number;
  runCostUsd: number | null;
  candidateCostUsd: number | null;
  judgeCostUsd: number | null;
  safetyFailures: number;
  judgeFlags: number;
};

type Aggregate = {
  modelId: string;
  suite: "full" | "reduced";
  runs: number;
  avgBlended: number;
  sdBlended: number;
  avgJudge: number;
  avgHeuristic: number;
  avgLatencyMs: number;
  avgRunCostUsd: number | null;
  totalRunCostUsd: number | null;
  avgCandidateCostUsd: number | null;
  avgJudgeCostUsd: number | null;
  safetyFailures: number;
  judgeFlags: number;
  scorePerDollar: number | null;
  riskPenalty: number;
  decisionScore: number;
};

const runsDir = join(process.cwd(), "docs/benchmarks/runs");
const outputDir = join(process.cwd(), "docs/benchmarks/plots/2026-06-26");
const reportPath = join(
  process.cwd(),
  "docs/benchmarks/model-selection-2026-06-26.md",
);
const csvPath = join(
  process.cwd(),
  "docs/benchmarks/model-selection-2026-06-26.csv",
);

const palette = {
  blue: "#2563eb",
  green: "#059669",
  red: "#dc2626",
  amber: "#d97706",
  purple: "#7c3aed",
  slate: "#334155",
  zinc: "#71717a",
  grid: "#e5e7eb",
  text: "#111827",
  muted: "#6b7280",
  bg: "#ffffff",
};

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function nullableMean(values: Array<number | null>) {
  const numericValues = values.filter(
    (value): value is number => typeof value === "number",
  );
  return numericValues.length > 0 ? mean(numericValues) : null;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) {
    return 0;
  }
  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function labelModel(modelId: string) {
  return modelId
    .replace("openai/", "")
    .replace("moonshotai/", "")
    .replace("deepseek/", "")
    .replace("google/", "")
    .replace("tencent/", "")
    .replace("z-ai/", "");
}

function readRunPoints(): RunPoint[] {
  const points: RunPoint[] = [];
  for (const file of readdirSync(runsDir).filter((name) =>
    name.endsWith(".json"),
  )) {
    const fullPath = join(runsDir, file);
    const report = JSON.parse(
      readFileSync(fullPath, "utf8"),
    ) as BenchmarkReport;
    for (const model of report.models ?? []) {
      if (
        typeof model.avgBlendedScore !== "number" ||
        typeof model.avgJudgeScore !== "number"
      ) {
        continue;
      }

      const scenarios = model.scenarioCount ?? 0;
      const suite = scenarios >= 22 ? "full" : "reduced";
      const hasCandidateCost =
        typeof model.totalCostUsd === "number" && model.totalCostUsd > 0;
      const hasJudgeCost =
        typeof model.totalJudgeCostUsd === "number" &&
        model.totalJudgeCostUsd > 0;
      const candidateCostUsd = hasCandidateCost
        ? (model.totalCostUsd ?? null)
        : null;
      const judgeCostUsd = hasJudgeCost
        ? (model.totalJudgeCostUsd ?? null)
        : null;
      const runCostUsd =
        typeof model.totalRunCostUsd === "number" && model.totalRunCostUsd > 0
          ? model.totalRunCostUsd
          : hasCandidateCost || hasJudgeCost
            ? (candidateCostUsd ?? 0) + (judgeCostUsd ?? 0)
            : null;
      points.push({
        file: basename(file),
        suite,
        modelId: model.modelId,
        scenarios,
        turns: model.turnCount ?? 0,
        blended: model.avgBlendedScore,
        judge: model.avgJudgeScore,
        heuristic: model.avgScore ?? 0,
        latencyMs: model.avgLatencyMs ?? 0,
        runCostUsd,
        candidateCostUsd,
        judgeCostUsd,
        safetyFailures: model.safetyFailures ?? 0,
        judgeFlags: model.judgeFlags ?? 0,
      });
    }
  }
  return points;
}

function aggregate(points: RunPoint[], suite: "full" | "reduced"): Aggregate[] {
  const grouped = new Map<string, RunPoint[]>();
  for (const point of points.filter((item) => item.suite === suite)) {
    grouped.set(point.modelId, [...(grouped.get(point.modelId) ?? []), point]);
  }

  return [...grouped.entries()]
    .map(([modelId, modelPoints]) => {
      const avgBlended = mean(modelPoints.map((point) => point.blended));
      const avgRunCostUsd = nullableMean(
        modelPoints.map((point) => point.runCostUsd),
      );
      const safetyFailures = modelPoints.reduce(
        (sum, point) => sum + point.safetyFailures,
        0,
      );
      const judgeFlags = modelPoints.reduce(
        (sum, point) => sum + point.judgeFlags,
        0,
      );
      const riskPenalty =
        safetyFailures * 0.12 +
        judgeFlags * 0.015 +
        standardDeviation(modelPoints.map((point) => point.blended)) * 0.35;
      const normalizedCostPenalty =
        avgRunCostUsd === null
          ? 0.05
          : Math.log10(1 + avgRunCostUsd * 10) * 0.1;
      const knownRunCosts = modelPoints
        .map((point) => point.runCostUsd)
        .filter((value): value is number => typeof value === "number");

      return {
        modelId,
        suite,
        runs: modelPoints.length,
        avgBlended,
        sdBlended: standardDeviation(modelPoints.map((point) => point.blended)),
        avgJudge: mean(modelPoints.map((point) => point.judge)),
        avgHeuristic: mean(modelPoints.map((point) => point.heuristic)),
        avgLatencyMs: mean(modelPoints.map((point) => point.latencyMs)),
        avgRunCostUsd,
        totalRunCostUsd:
          knownRunCosts.length > 0
            ? knownRunCosts.reduce((sum, value) => sum + value, 0)
            : null,
        avgCandidateCostUsd: nullableMean(
          modelPoints.map((point) => point.candidateCostUsd),
        ),
        avgJudgeCostUsd: nullableMean(
          modelPoints.map((point) => point.judgeCostUsd),
        ),
        safetyFailures,
        judgeFlags,
        scorePerDollar:
          avgRunCostUsd !== null && avgRunCostUsd > 0
            ? avgBlended / avgRunCostUsd
            : null,
        riskPenalty,
        decisionScore: avgBlended - riskPenalty - normalizedCostPenalty,
      };
    })
    .sort((a, b) => b.avgBlended - a.avgBlended);
}

function chartFrame(
  width: number,
  height: number,
  title: string,
  body: string,
) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">
  <rect width="100%" height="100%" fill="${palette.bg}"/>
  <text x="24" y="32" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="700" fill="${palette.text}">${escapeXml(title)}</text>
  ${body}
</svg>
`;
}

function barChart(
  items: Aggregate[],
  title: string,
  metric: keyof Aggregate,
  fileName: string,
  color = palette.blue,
) {
  const rows = items.slice(0, 12);
  const width = 1180;
  const rowHeight = 44;
  const top = 58;
  const left = 300;
  const right = 36;
  const chartWidth = width - left - right;
  const height = top + rows.length * rowHeight + 42;
  const values = rows.map((item) => Number(item[metric]));
  const min = Math.min(
    ...values,
    metric === "avgBlended" || metric === "decisionScore" ? 6 : 0,
  );
  const max = Math.max(...values);
  const span = Math.max(0.1, max - min);

  const body = rows
    .map((item, index) => {
      const value = Number(item[metric]);
      const y = top + index * rowHeight;
      const barWidth = ((value - min) / span) * chartWidth;
      const cost =
        item.avgRunCostUsd === null
          ? "cost n/a"
          : `cost $${round(item.avgRunCostUsd, 3)}`;
      const meta = `${item.runs} run${item.runs === 1 ? "" : "s"} | ${cost} | ${round(item.avgLatencyMs / 1000, 1)}s`;
      return `
  <text x="24" y="${y + 24}" font-family="Inter, Arial, sans-serif" font-size="13" fill="${palette.text}">${escapeXml(labelModel(item.modelId))}</text>
  <rect x="${left}" y="${y + 6}" width="${Math.max(2, barWidth)}" height="22" rx="3" fill="${color}"/>
  <text x="${left + barWidth + 8}" y="${y + 22}" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700" fill="${palette.text}">${round(value, 2)}</text>
  <text x="${left}" y="${y + 42}" font-family="Inter, Arial, sans-serif" font-size="11" fill="${palette.muted}">${escapeXml(meta)}</text>`;
    })
    .join("");

  writeFileSync(
    join(outputDir, fileName),
    chartFrame(width, height, title, body),
  );
}

function scatterPlot(
  items: Aggregate[],
  title: string,
  xMetric: keyof Aggregate,
  yMetric: keyof Aggregate,
  fileName: string,
  xLabel: string,
  yLabel: string,
) {
  const plottedItems = items.filter(
    (item) =>
      typeof item[xMetric] === "number" && typeof item[yMetric] === "number",
  );
  const width = 1040;
  const height = 680;
  const left = 86;
  const right = 32;
  const top = 58;
  const bottom = 72;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xs = plottedItems.map((item) => Number(item[xMetric]));
  const ys = plottedItems.map((item) => Number(item[yMetric]));
  const xMin = Math.min(...xs) * 0.9;
  const xMax = Math.max(...xs) * 1.08;
  const yMin = Math.min(6, Math.min(...ys) * 0.98);
  const yMax = Math.max(...ys) * 1.02;
  const xScale = (value: number) =>
    left + ((value - xMin) / Math.max(0.0001, xMax - xMin)) * plotWidth;
  const yScale = (value: number) =>
    top +
    plotHeight -
    ((value - yMin) / Math.max(0.0001, yMax - yMin)) * plotHeight;

  const grid = [0, 1, 2, 3, 4]
    .map((tick) => {
      const y = top + (plotHeight / 4) * tick;
      return `<line x1="${left}" x2="${width - right}" y1="${y}" y2="${y}" stroke="${palette.grid}"/>`;
    })
    .join("");

  const points = plottedItems
    .map((item, index) => {
      const x = xScale(Number(item[xMetric]));
      const y = yScale(Number(item[yMetric]));
      const radius = 6 + Math.min(item.runs, 4) * 2;
      const color =
        item.safetyFailures > 0
          ? palette.amber
          : index < 3
            ? palette.green
            : palette.blue;
      return `
  <circle cx="${x}" cy="${y}" r="${radius}" fill="${color}" opacity="0.9"/>
  <text x="${x + 10}" y="${y - 8}" font-family="Inter, Arial, sans-serif" font-size="12" fill="${palette.text}">${escapeXml(labelModel(item.modelId))}</text>
  <text x="${x + 10}" y="${y + 8}" font-family="Inter, Arial, sans-serif" font-size="10" fill="${palette.muted}">${item.runs}r, ${item.safetyFailures}s</text>`;
    })
    .join("");

  const body = `
  ${grid}
  <line x1="${left}" x2="${width - right}" y1="${top + plotHeight}" y2="${top + plotHeight}" stroke="${palette.slate}"/>
  <line x1="${left}" x2="${left}" y1="${top}" y2="${top + plotHeight}" stroke="${palette.slate}"/>
  <text x="${left + plotWidth / 2}" y="${height - 24}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="13" fill="${palette.text}">${escapeXml(xLabel)}</text>
  <text x="22" y="${top + plotHeight / 2}" transform="rotate(-90 22 ${top + plotHeight / 2})" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="13" fill="${palette.text}">${escapeXml(yLabel)}</text>
  <text x="${left}" y="${height - 48}" font-family="Inter, Arial, sans-serif" font-size="11" fill="${palette.muted}">Bubble size = number of full-suite runs; amber = safety failures observed.</text>
  ${points}`;

  writeFileSync(
    join(outputDir, fileName),
    chartFrame(width, height, title, body),
  );
}

function csvEscape(value: string | number) {
  const stringValue = String(value);
  return stringValue.includes(",") || stringValue.includes('"')
    ? `"${stringValue.replaceAll('"', '""')}"`
    : stringValue;
}

function formatNullable(value: number | null, digits: number) {
  return value === null ? "n/a" : round(value, digits);
}

function writeCsv(aggregates: Aggregate[]) {
  const header = [
    "suite",
    "rank_by_blended",
    "model",
    "runs",
    "avg_blended",
    "sd_blended",
    "avg_judge",
    "avg_heuristic",
    "avg_latency_s",
    "avg_run_cost_usd",
    "total_run_cost_usd",
    "safety_failures",
    "judge_flags",
    "score_per_dollar",
    "decision_score",
  ];

  const rows = aggregates.map((item, index) => [
    item.suite,
    index + 1,
    item.modelId,
    item.runs,
    round(item.avgBlended, 3),
    round(item.sdBlended, 3),
    round(item.avgJudge, 3),
    round(item.avgHeuristic, 3),
    round(item.avgLatencyMs / 1000, 2),
    formatNullable(item.avgRunCostUsd, 6),
    formatNullable(item.totalRunCostUsd, 6),
    item.safetyFailures,
    item.judgeFlags,
    formatNullable(item.scorePerDollar, 2),
    round(item.decisionScore, 3),
  ]);

  writeFileSync(
    csvPath,
    [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n"),
  );
}

function table(items: Aggregate[], limit = items.length) {
  const rows = items
    .slice(0, limit)
    .map(
      (item, index) =>
        `| ${index + 1} | \`${item.modelId}\` | ${item.runs} | ${round(item.avgBlended, 2)} | ${round(item.sdBlended, 2)} | ${round(item.avgJudge, 2)} | ${round(item.avgHeuristic, 2)} | ${round(item.avgLatencyMs / 1000, 1)}s | ${item.avgRunCostUsd === null ? "n/a" : `$${round(item.avgRunCostUsd, 3)}`} | ${item.safetyFailures} | ${item.judgeFlags} | ${round(item.decisionScore, 2)} |`,
    );

  return [
    "| Rank | Model | Runs | Blended | SD | Judge | Heuristic | Latency | Avg cost/run | Safety failures | Judge flags | Decision score |",
    "|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...rows,
  ].join("\n");
}

function writeMarkdown(full: Aggregate[], reduced: Aggregate[]) {
  const bestQuality = full[0];
  const bestDecision = [...full].sort(
    (a, b) => b.decisionScore - a.decisionScore,
  )[0];
  const bestValue = [...full]
    .filter((item) => item.scorePerDollar !== null)
    .sort((a, b) => (b.scorePerDollar ?? 0) - (a.scorePerDollar ?? 0))[0];

  const markdown = `# Reality Benchmark Model Selection Plots

Generated on 2026-06-26 from judged JSON reports in \`docs/benchmarks/runs\`.

Primary selection uses full-suite runs only: \`22\` scenarios and \`44\` turns. Reduced-suite runs are listed separately as screening evidence.

## Recommendation

- Best raw quality: \`${bestQuality.modelId}\` with blended ${round(bestQuality.avgBlended, 2)} across ${bestQuality.runs} full-suite run(s).
- Best risk/cost-adjusted pick: \`${bestDecision.modelId}\` with decision score ${round(bestDecision.decisionScore, 2)}.
- Best value pick among models with recorded costs: \`${bestValue.modelId}\` with ${round(bestValue.scorePerDollar ?? 0, 2)} blended points per dollar/run.

The decision score is a lightweight operational score: blended score minus penalties for safety failures, judge disagreements, score volatility, and run cost. It is for model selection only; the source benchmark score remains the blended score.

## Plots

![Full-suite blended ranking](plots/2026-06-26/full-suite-blended-ranking.svg)

![Full-suite decision score](plots/2026-06-26/full-suite-decision-score.svg)

![Quality versus cost](plots/2026-06-26/full-suite-score-vs-cost.svg)

![Quality versus latency](plots/2026-06-26/full-suite-score-vs-latency.svg)

## Full-Suite Ranking

${table(full)}

## Reduced-Suite Screening

These are not directly comparable with the full-suite table, but they indicate which models are worth promoting to full-suite runs.

${table(reduced)}

## Generated Artifacts

- \`docs/benchmarks/model-selection-2026-06-26.csv\`
- \`docs/benchmarks/plots/2026-06-26/full-suite-blended-ranking.svg\`
- \`docs/benchmarks/plots/2026-06-26/full-suite-decision-score.svg\`
- \`docs/benchmarks/plots/2026-06-26/full-suite-score-vs-cost.svg\`
- \`docs/benchmarks/plots/2026-06-26/full-suite-score-vs-latency.svg\`
`;

  writeFileSync(reportPath, markdown);
}

mkdirSync(outputDir, { recursive: true });

const points = readRunPoints();
const full = aggregate(points, "full");
const reduced = aggregate(points, "reduced");

barChart(
  full,
  "Full-suite blended score",
  "avgBlended",
  "full-suite-blended-ranking.svg",
  palette.blue,
);
barChart(
  [...full].sort((a, b) => b.decisionScore - a.decisionScore),
  "Full-suite risk/cost-adjusted decision score",
  "decisionScore",
  "full-suite-decision-score.svg",
  palette.green,
);
scatterPlot(
  full,
  "Full-suite quality versus cost",
  "avgRunCostUsd",
  "avgBlended",
  "full-suite-score-vs-cost.svg",
  "Average total cost per run, USD",
  "Average blended score",
);
scatterPlot(
  full,
  "Full-suite quality versus latency",
  "avgLatencyMs",
  "avgBlended",
  "full-suite-score-vs-latency.svg",
  "Average latency, ms",
  "Average blended score",
);
writeCsv([...full, ...reduced]);
writeMarkdown(full, reduced);

console.log(`Wrote ${reportPath}`);
console.log(`Wrote ${csvPath}`);
console.log(`Wrote ${outputDir}`);
