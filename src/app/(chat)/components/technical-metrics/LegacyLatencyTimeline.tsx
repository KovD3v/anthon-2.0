import { History } from "lucide-react";
import { deriveLegacyLatencyTimeline } from "@/lib/response-profiler/legacy-timeline";
import type { Usage } from "@/types/chat";

const OUTCOME_LABELS = {
  completed: "Completato",
  failed_before_stream: "Fallito prima dello stream",
  failed_during_stream: "Fallito durante lo stream",
  cancelled: "Annullato",
} as const;

function formatDuration(value: number) {
  if (value < 1_000)
    return `${new Intl.NumberFormat("it-IT").format(value)} ms`;
  return `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(value / 1_000)} s`;
}

export function LegacyLatencyTimeline({ usage }: { usage: Usage }) {
  const timeline = deriveLegacyLatencyTimeline(usage);
  if (!timeline) return null;

  return (
    <section className="border-border/60 border-t px-3 py-3">
      <div className="mb-2.5 flex min-w-0 flex-wrap items-center gap-2">
        <h4 className="flex items-center gap-1.5 font-semibold text-foreground">
          <History className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          Timeline ricostruita
        </h4>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground ring-1 ring-border">
          Dati legacy
        </span>
      </div>

      <dl className="mb-3 grid min-w-0 grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
            Tempo totale risposta
          </dt>
          <dd className="mt-0.5 font-medium text-foreground">Non registrato</dd>
        </div>
        {timeline.firstTokenMs !== undefined ? (
          <div className="min-w-0">
            <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
              Primo token
            </dt>
            <dd className="mt-0.5 font-medium tabular-nums text-foreground">
              {formatDuration(timeline.firstTokenMs)}
            </dd>
          </div>
        ) : null}
        <div className="min-w-0">
          <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
            Fine generazione stimata
          </dt>
          <dd className="mt-0.5 font-medium tabular-nums text-foreground">
            {formatDuration(timeline.estimatedGenerationCompleteMs)}
          </dd>
        </div>
      </dl>

      <p className="mb-3 max-w-[70ch] text-[11px] leading-relaxed">
        Gli intervalli partono dall’inizio del backend e sono ricostruiti dai
        dati legacy. Browser, persistenza e intervalli non registrati non sono
        inclusi.
      </p>

      <ol className="space-y-2.5" aria-label="Timeline legacy ricostruita">
        {timeline.rows.map((row) => (
          <li key={row.id} className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              <span className="min-w-0 truncate font-medium text-foreground">
                {row.label}
              </span>
              <span className="shrink-0 font-medium tabular-nums text-foreground">
                {formatDuration(row.durationMs)}
              </span>
            </div>
            <div
              className="relative mt-1 h-2 overflow-hidden rounded-sm bg-border/60"
              aria-hidden="true"
            >
              <span
                className="absolute inset-y-0 rounded-sm bg-primary/75"
                style={{
                  marginInlineStart: `${row.startPercent}%`,
                  width: `${row.widthPercent}%`,
                }}
              />
            </div>
            <p className="mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5 text-[10px] tabular-nums text-muted-foreground">
              <span>
                {formatDuration(row.startOffsetMs)} →{" "}
                {formatDuration(row.endOffsetMs)}
              </span>
              {row.firstTokenOffsetMs !== undefined ? (
                <span className="font-medium text-foreground">
                  Primo token a {formatDuration(row.firstTokenOffsetMs)}
                </span>
              ) : null}
              {row.outcome ? <span>{OUTCOME_LABELS[row.outcome]}</span> : null}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
