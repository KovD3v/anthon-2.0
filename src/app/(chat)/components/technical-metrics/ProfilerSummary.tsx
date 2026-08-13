import { AlertTriangle, Archive, CheckCircle2, Gauge } from "lucide-react";
import type { ResponseProfilerSummary } from "@/lib/response-profiler/summary";
import type { Usage } from "@/types/chat";

const QUALITY = {
  complete: {
    label: "Traccia completa",
    Icon: CheckCircle2,
    className: "bg-primary/12 text-foreground ring-primary/25",
  },
  partial: {
    label: "Traccia parziale",
    Icon: AlertTriangle,
    className: "bg-muted text-foreground ring-border",
  },
  legacy: {
    label: "Dati legacy",
    Icon: Archive,
    className: "bg-muted text-muted-foreground ring-border",
  },
} as const;

function formatDuration(value: number) {
  if (value < 1_000)
    return `${new Intl.NumberFormat("it-IT").format(value)} ms`;
  return `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(value / 1_000)} s`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("it-IT", {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatCost(value: number) {
  if (value > 0 && value < 0.000001) return "< $0.000001";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    maximumFractionDigits: 6,
  }).format(value);
}

export function ProfilerSummary({
  usage,
  summary,
}: {
  usage: Usage;
  summary: ResponseProfilerSummary;
}) {
  const quality = QUALITY[summary.quality];
  const rows = [
    summary.serverTtftMs !== undefined
      ? { label: "TTFT server", value: formatDuration(summary.serverTtftMs) }
      : null,
    summary.firstDeltaMs !== undefined
      ? { label: "Primo delta", value: formatDuration(summary.firstDeltaMs) }
      : null,
    summary.firstVisibleMs !== undefined
      ? {
          label: "Primo testo visibile",
          value: formatDuration(summary.firstVisibleMs),
        }
      : null,
    summary.perceivedCompletionMs !== undefined
      ? {
          label: "Risposta completa",
          value: formatDuration(summary.perceivedCompletionMs),
        }
      : null,
    summary.persistedResolutionMs !== undefined
      ? {
          label: "Fine persistenza",
          value: formatDuration(summary.persistedResolutionMs),
        }
      : null,
    summary.outputTokensPerSecond !== undefined
      ? {
          label: "Throughput modello",
          value: `${formatCount(summary.outputTokensPerSecond)} token/s`,
        }
      : null,
    {
      label: "Token",
      value: `${formatCount(usage.inputTokens)} in · ${formatCount(usage.outputTokens)} out`,
    },
    { label: "Costo", value: formatCost(usage.cost) },
  ].filter((row): row is { label: string; value: string } => row !== null);

  return (
    <section className="px-3 py-3">
      <div className="mb-2.5 flex min-w-0 flex-wrap items-center gap-2">
        <h4 className="flex items-center gap-1.5 font-semibold text-foreground">
          <Gauge className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          Profilo risposta
        </h4>
        <span
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${quality.className}`}
        >
          <quality.Icon className="h-3 w-3" aria-hidden="true" />
          {quality.label}
        </span>
      </div>
      <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
              {row.label}
            </dt>
            <dd
              className="mt-0.5 truncate font-medium tabular-nums text-foreground"
              title={row.value}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
