import { Server } from "lucide-react";
import type { ServerSpanName } from "@/lib/response-profiler/contracts";
import type { ResponseProfilerSummary } from "@/lib/response-profiler/summary";
import type { Usage } from "@/types/chat";

const GROUPS = {
  setup: "Preparazione",
  context: "Contesto",
  model: "Modello",
  tool: "Strumenti",
  persistence: "Persistenza",
} as const;
type Group = keyof typeof GROUPS;

const SPAN_GROUP: Record<ServerSpanName, Group> = {
  auth: "setup",
  database_connect: "setup",
  user_lookup: "setup",
  chat_lookup: "setup",
  billing_sync: "setup",
  rate_limit_check: "setup",
  usage_reservation: "setup",
  rate_limit: "setup",
  inbound_claim: "setup",
  attachment_resolution: "setup",
  transcription: "setup",
  classification: "setup",
  routing: "setup",
  history: "context",
  user_context: "context",
  memory_facts: "context",
  memory_query: "context",
  memory_format: "context",
  conversation_recall: "context",
  rag_decision: "context",
  rag_embedding: "context",
  rag_search: "context",
  prompt_build: "context",
  provider_wait: "model",
  reasoning: "model",
  model_stream: "model",
  tool: "tool",
  assistant_persistence: "persistence",
};

const STATUS = {
  completed: "Completato",
  failed: "Fallito",
  cancelled: "Annullato",
} as const;

function formatDuration(value: number) {
  if (value < 1_000)
    return `${new Intl.NumberFormat("it-IT").format(value)} ms`;
  return `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(value / 1_000)} s`;
}

export function ServerTimeline({
  trace,
  summary,
}: {
  trace: NonNullable<Usage["serverTrace"]>;
  summary: ResponseProfilerSummary;
}) {
  const namesById = new Map(trace.spans.map((span) => [span.id, span.name]));
  const groupedRows = (Object.keys(GROUPS) as Group[]).map((group) => ({
    group,
    rows: summary.serverRows.filter(
      (row) => SPAN_GROUP[namesById.get(row.id) ?? "auth"] === group,
    ),
  }));

  return (
    <section className="border-border/60 border-t px-3 py-3">
      <div className="mb-1 flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        <h4 className="flex items-center gap-1.5 font-semibold text-foreground">
          <Server className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          Timeline backend
        </h4>
        {summary.serverTotalMs !== undefined ? (
          <span className="flex items-baseline gap-1.5 tabular-nums">
            <span className="text-[10px] font-medium uppercase tracking-[0.08em]">
              Totale backend
            </span>
            <strong className="font-semibold text-foreground">
              {formatDuration(summary.serverTotalMs)}
            </strong>
          </span>
        ) : null}
      </div>
      <p className="mb-3 max-w-[70ch] text-[11px] leading-relaxed">
        Gli span paralleli condividono il tempo reale: le percentuali non sono
        additive.
      </p>
      <div className="space-y-3">
        {groupedRows.map(({ group, rows }) =>
          rows.length > 0 ? (
            <div key={group} className="min-w-0">
              <h5 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/70">
                {GROUPS[group]}
              </h5>
              <ol className="space-y-2">
                {rows.map((row) => (
                  <li key={row.id} className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                      <span
                        className="min-w-0 truncate font-medium text-foreground"
                        title={row.label}
                      >
                        {row.label}
                      </span>
                      {summary.dominantServerSpanId === row.id ? (
                        <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-foreground ring-1 ring-primary/20">
                          Più lungo misurato
                        </span>
                      ) : null}
                    </div>
                    <div
                      className="relative mt-1 h-2 overflow-hidden rounded-sm bg-border/60"
                      aria-hidden="true"
                    >
                      <span
                        className={`absolute inset-y-0 rounded-sm ${
                          row.status === "completed"
                            ? "bg-primary/75"
                            : row.status === "failed"
                              ? "bg-destructive/75"
                              : "bg-muted-foreground/55"
                        }`}
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
                      <span>Durata {formatDuration(row.durationMs)}</span>
                      <span className="font-medium text-foreground">
                        {STATUS[row.status]}
                      </span>
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null,
        )}
      </div>
    </section>
  );
}
