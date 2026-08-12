import { Monitor } from "lucide-react";
import type { ResponseProfilerSummary } from "@/lib/response-profiler/summary";

const LANE_LABELS = {
  network: "Rete e stream",
  rendering: "Rendering",
  persistence: "Persistenza",
} as const;

function formatDuration(value: number) {
  if (value < 1_000)
    return `${new Intl.NumberFormat("it-IT").format(value)} ms`;
  return `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(value / 1_000)} s`;
}

export function BrowserTimeline({
  summary,
}: {
  summary: ResponseProfilerSummary;
}) {
  return (
    <section className="border-border/60 border-t px-3 py-3">
      <div className="mb-1 flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        <h4 className="flex items-center gap-1.5 font-semibold text-foreground">
          <Monitor className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          Timeline browser
        </h4>
        {summary.browserTotalMs !== undefined ? (
          <span className="flex items-baseline gap-1.5 tabular-nums">
            <span className="text-[10px] font-medium uppercase tracking-[0.08em]">
              Fine traccia
            </span>
            <strong className="font-semibold text-foreground">
              {formatDuration(summary.browserTotalMs)}
            </strong>
          </span>
        ) : null}
      </div>
      <p className="mb-3 max-w-[70ch] text-[11px] leading-relaxed">
        Tutti gli offset partono dall’invio della richiesta nel browser.
      </p>
      <div className="space-y-3">
        {summary.browserLanes.map((lane) =>
          lane.milestones.length > 0 ? (
            <div key={lane.lane} className="min-w-0">
              <h5 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/70">
                {LANE_LABELS[lane.lane]}
              </h5>
              <div
                className="relative h-2 rounded-sm bg-border/60"
                aria-hidden="true"
              >
                {lane.milestones.map((milestone) => (
                  <span
                    key={milestone.key}
                    className="absolute -bottom-0.5 -top-0.5 w-0.5 rounded-sm bg-primary"
                    style={{ insetInlineStart: `${milestone.offsetPercent}%` }}
                  />
                ))}
              </div>
              <ul className="mt-1.5 grid min-w-0 grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
                {lane.milestones.map((milestone) => (
                  <li
                    key={milestone.key}
                    className="flex min-w-0 items-baseline justify-between gap-2"
                  >
                    <span className="min-w-0 truncate" title={milestone.key}>
                      {milestone.key}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-foreground">
                      {formatDuration(milestone.offsetMs)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
      </div>
      {summary.outsideMeasuredBackendMs !== undefined ? (
        <div className="mt-3 border-border/50 border-t pt-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <strong className="font-semibold text-foreground">
              Fuori dal backend misurato
            </strong>
            <span className="font-semibold tabular-nums text-foreground">
              {formatDuration(summary.outsideMeasuredBackendMs)}
            </span>
          </div>
          <p className="mt-1 max-w-[70ch] text-[11px] leading-relaxed">
            Può includere transito richiesta/risposta, scheduling SDK,
            throttling, lavoro React e opportunità di paint; non identifica da
            solo una causa.
          </p>
        </div>
      ) : null}
    </section>
  );
}
