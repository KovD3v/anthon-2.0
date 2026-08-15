import {
  Activity,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Cpu,
  Database,
  Route,
} from "lucide-react";
import { deriveResponseProfilerSummary } from "@/lib/response-profiler/summary";
import type { Usage } from "@/types/chat";
import { BrowserTimeline } from "./technical-metrics/BrowserTimeline";
import { LegacyLatencyTimeline } from "./technical-metrics/LegacyLatencyTimeline";
import { ProfilerSummary } from "./technical-metrics/ProfilerSummary";
import { RagToolDiagnostics } from "./technical-metrics/RagToolDiagnostics";
import { ServerTimeline } from "./technical-metrics/ServerTimeline";

interface TechnicalMetricsDetailsProps {
  usage: Usage | undefined;
}

const PROFILE_LABELS = {
  light: "Light",
  standard: "Standard",
} as const;

const OUTCOME_LABELS = {
  completed: "completato",
  failed_before_stream: "fallito prima dello stream",
  failed_during_stream: "fallito durante lo stream",
  cancelled: "annullato",
} as const;

const ESCALATION_LABELS = {
  provider_error: "errore provider",
  empty_response: "risposta vuota",
  runtime_invariant: "controllo runtime",
} as const;

function formatDuration(milliseconds: number | undefined) {
  if (
    typeof milliseconds !== "number" ||
    !Number.isFinite(milliseconds) ||
    milliseconds < 0
  ) {
    return null;
  }

  if (milliseconds < 1000) {
    return `${new Intl.NumberFormat("it-IT").format(milliseconds)} ms`;
  }

  return `${new Intl.NumberFormat("it-IT", {
    maximumFractionDigits: 2,
  }).format(milliseconds / 1000)} s`;
}

function formatCost(cost: number) {
  if (!Number.isFinite(cost) || cost < 0) return null;
  if (cost > 0 && cost < 0.000001) return "< $0.000001";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cost < 0.01 ? 4 : 2,
    maximumFractionDigits: 6,
  }).format(cost);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("it-IT").format(value);
}

function formatBytesFromChars(value: number | undefined) {
  if (value === undefined) return null;
  if (value < 1000) return `${formatCount(value)} caratteri`;
  return `${new Intl.NumberFormat("it-IT", {
    maximumFractionDigits: 1,
  }).format(value / 1000)}k caratteri`;
}

function toggleDetailsFromKeyboard(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  const details = event.currentTarget.closest("details");
  if (details) details.open = !details.open;
}

function MetricValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
        {label}
      </dt>
      <dd
        className="mt-0.5 truncate font-medium tabular-nums text-foreground"
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: typeof Activity;
  children: string;
}) {
  return (
    <h4 className="mb-2 flex items-center gap-1.5 font-semibold text-foreground">
      <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      {children}
    </h4>
  );
}

export function TechnicalMetricsDetails({
  usage,
}: TechnicalMetricsDetailsProps) {
  if (!usage) return null;

  const routeTrace = usage.executionRoute;
  const profilerSummary = deriveResponseProfilerSummary(usage);
  const totalTokens = usage.inputTokens + usage.outputTokens;
  const generationDuration = formatDuration(usage.generationTimeMs);
  const cost = formatCost(usage.cost);
  const profile = routeTrace?.executedProfile ?? usage.executedProfile;
  const hasRichDiagnostics = Boolean(
    usage.messageId ||
      usage.model ||
      usage.provider ||
      routeTrace ||
      usage.toolTiming ||
      usage.memoryRecall ||
      usage.ragAttempted !== undefined ||
      usage.reasoningTimeMs !== undefined ||
      usage.serverTrace ||
      usage.clientTrace ||
      usage.developerDiagnostics,
  );

  if (!hasRichDiagnostics) {
    return (
      <details className="mt-2 min-w-0 max-w-full border-border/50 border-t pt-2 text-xs text-muted-foreground">
        {/* biome-ignore lint/a11y/noStaticElementInteractions: Native summary control gets a JSDOM-compatible keyboard fallback. */}
        <summary
          tabIndex={0}
          onKeyDown={toggleDetailsFromKeyboard}
          className="cursor-pointer font-medium text-foreground/80 marker:text-muted-foreground"
        >
          Dettagli tecnici
        </summary>
        <div className="mt-2 flex min-w-0 max-w-full flex-wrap gap-x-3 gap-y-1 break-words">
          <span className="font-medium text-foreground">Dati legacy</span>
          <span>{formatCount(totalTokens)} token totali</span>
          <span>{formatCount(usage.inputTokens)} in ingresso</span>
          <span>{formatCount(usage.outputTokens)} in uscita</span>
          {generationDuration && <span>Durata: {generationDuration}</span>}
        </div>
      </details>
    );
  }

  const recordedDurationRows = [
    !routeTrace && usage.generationTimeMs !== undefined
      ? { label: "Generazione", value: usage.generationTimeMs }
      : null,
    usage.reasoningTimeMs !== undefined
      ? { label: "Reasoning", value: usage.reasoningTimeMs }
      : null,
    usage.toolTiming?.firstModelStepMs !== undefined
      ? {
          label: "Primo step modello",
          value: usage.toolTiming.firstModelStepMs,
        }
      : null,
    usage.toolTiming?.toolExecutionMs !== undefined
      ? { label: "Esecuzione tool", value: usage.toolTiming.toolExecutionMs }
      : null,
    usage.toolTiming?.finalModelStepMs !== undefined
      ? {
          label: "Step modello finale",
          value: usage.toolTiming.finalModelStepMs,
        }
      : null,
  ].filter((row): row is { label: string; value: number } => row !== null);
  const headerDuration =
    profilerSummary.perceivedCompletionMs !== undefined
      ? {
          label: "Risposta",
          value: formatDuration(profilerSummary.perceivedCompletionMs),
        }
      : generationDuration
        ? { label: "Generazione", value: generationDuration }
        : null;

  return (
    <details
      open={hasRichDiagnostics || undefined}
      className="group/metrics mt-3 min-w-0 max-w-full overflow-hidden rounded-xl border border-border/70 bg-muted/25 text-xs text-muted-foreground open:bg-muted/40"
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Native summary control gets a JSDOM-compatible keyboard fallback. */}
      <summary
        tabIndex={0}
        onKeyDown={toggleDetailsFromKeyboard}
        className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-inset [&::-webkit-details-marker]:hidden"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Activity className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="font-semibold text-foreground">Dettagli tecnici</span>
        {profile && (
          <span className="rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-background">
            {PROFILE_LABELS[profile]}
          </span>
        )}
        {headerDuration && (
          <span className="ml-auto flex items-baseline gap-1 font-medium tabular-nums text-foreground/80">
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              {headerDuration.label}
            </span>
            {headerDuration.value}
          </span>
        )}
        <ChevronDown
          className={`${headerDuration ? "" : "ml-auto"} h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-open/metrics:rotate-180`}
          aria-hidden="true"
        />
      </summary>

      <div className="border-border/60 border-t">
        <ProfilerSummary usage={usage} summary={profilerSummary} />

        {(usage.model || profile || usage.provider || routeTrace) && (
          <section className="border-border/60 border-t px-3 py-3">
            <SectionTitle icon={Cpu}>Esecuzione</SectionTitle>
            <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
              {usage.messageId && (
                <div className="col-span-2 min-w-0 sm:col-span-4">
                  <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                    ID messaggio
                  </dt>
                  <dd className="mt-1 min-w-0">
                    <code className="block break-all rounded-md bg-background/75 px-2 py-1.5 font-mono text-[11px] text-foreground ring-1 ring-border/60">
                      {usage.messageId}
                    </code>
                  </dd>
                </div>
              )}
              {usage.model && (
                <div className="col-span-2 min-w-0 sm:col-span-4">
                  <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                    Modello
                  </dt>
                  <dd className="mt-1 min-w-0">
                    <code
                      className="block truncate rounded-md bg-background/75 px-2 py-1.5 font-mono text-[11px] text-foreground ring-1 ring-border/60"
                      title={usage.model}
                    >
                      {usage.model}
                    </code>
                  </dd>
                </div>
              )}
              {routeTrace?.classifierModel && (
                <div className="col-span-2 min-w-0 sm:col-span-4">
                  <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                    Modello classificatore
                  </dt>
                  <dd className="mt-1 min-w-0">
                    <code
                      className="block truncate rounded-md bg-background/75 px-2 py-1.5 font-mono text-[11px] text-foreground ring-1 ring-border/60"
                      title={routeTrace.classifierModel}
                    >
                      {routeTrace.classifierModel}
                    </code>
                  </dd>
                </div>
              )}
              {profile && (
                <MetricValue
                  label="Profilo eseguito"
                  value={PROFILE_LABELS[profile]}
                />
              )}
              {routeTrace && (
                <>
                  <MetricValue
                    label="Profilo pianificato"
                    value={PROFILE_LABELS[routeTrace.plannedProfile]}
                  />
                  <MetricValue label="Task" value={routeTrace.taskKind} />
                  <MetricValue
                    label="Routing"
                    value={`${routeTrace.routingMode} · ${routeTrace.decisionSource}`}
                  />
                </>
              )}
              {usage.provider && (
                <MetricValue label="Provider" value={usage.provider} />
              )}
              {routeTrace?.classifierProvider && (
                <MetricValue
                  label="Provider classificatore"
                  value={routeTrace.classifierProvider}
                />
              )}
              {routeTrace && (
                <MetricValue
                  label="Confidenza"
                  value={routeTrace.confidenceBucket}
                />
              )}
            </dl>
            {routeTrace && routeTrace.reasonCodes.length > 0 && (
              <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5 border-border/50 border-t pt-2.5">
                <span className="mr-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                  Motivi
                </span>
                {routeTrace.reasonCodes.map((reason) => (
                  <code
                    key={reason}
                    className="max-w-full break-all rounded bg-background/70 px-1.5 py-0.5 font-mono text-[10px] text-foreground/85"
                  >
                    {reason}
                  </code>
                ))}
              </div>
            )}
          </section>
        )}

        {usage.serverTrace ? (
          <ServerTimeline trace={usage.serverTrace} summary={profilerSummary} />
        ) : null}

        {usage.clientTrace ? (
          <BrowserTimeline summary={profilerSummary} />
        ) : null}

        {!usage.serverTrace && routeTrace ? (
          <LegacyLatencyTimeline usage={usage} />
        ) : null}

        {usage.developerDiagnostics && (
          <RagToolDiagnostics diagnostics={usage.developerDiagnostics} />
        )}

        {recordedDurationRows.length > 0 && (
          <section className="border-border/60 border-t px-3 py-3">
            <SectionTitle icon={Clock3}>Durate registrate</SectionTitle>
            <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
              {recordedDurationRows.map((row) => (
                <div key={row.label} className="min-w-0">
                  <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                    {row.label}
                  </dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-foreground">
                    {formatDuration(row.value)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {routeTrace && (
          <section className="border-border/60 border-t px-3 py-3">
            <SectionTitle icon={Route}>Tentativi</SectionTitle>
            <ol className="space-y-2">
              {routeTrace.attempts.map((attempt) => (
                <li
                  key={attempt.sequence}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-background/80 font-semibold tabular-nums text-foreground ring-1 ring-border/60">
                    {attempt.sequence}
                  </span>
                  <span className="min-w-0 truncate">
                    <strong className="font-semibold text-foreground">
                      {PROFILE_LABELS[attempt.profile]}
                    </strong>{" "}
                    · {OUTCOME_LABELS[attempt.outcome]}
                  </span>
                  <span className="text-right font-medium tabular-nums text-foreground">
                    {formatDuration(attempt.generationTimeMs)}
                    {attempt.timeToFirstTokenMs !== undefined && (
                      <span className="ml-1 text-muted-foreground">
                        · TTFT {formatDuration(attempt.timeToFirstTokenMs)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
            {routeTrace.escalation && (
              <p className="mt-2.5 rounded-md bg-background/70 px-2 py-1.5 text-foreground ring-1 ring-border/60">
                Escalation {PROFILE_LABELS[routeTrace.escalation.from]} →{" "}
                {PROFILE_LABELS[routeTrace.escalation.to]}:{" "}
                {ESCALATION_LABELS[routeTrace.escalation.reason]}
              </p>
            )}
          </section>
        )}

        <section className="border-border/60 border-t px-3 py-3">
          <SectionTitle icon={CircleDollarSign}>Consumo</SectionTitle>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
            <MetricValue
              label="Token totali"
              value={formatCount(totalTokens)}
            />
            <MetricValue label="Input" value={formatCount(usage.inputTokens)} />
            <MetricValue
              label="Output"
              value={formatCount(usage.outputTokens)}
            />
            {usage.reasoningTokens !== undefined && (
              <MetricValue
                label="Reasoning"
                value={formatCount(usage.reasoningTokens)}
              />
            )}
            {cost && <MetricValue label="Costo" value={cost} />}
          </dl>
        </section>

        {(usage.toolCallCount !== undefined ||
          usage.ragAttempted !== undefined ||
          usage.memoryRecall) && (
          <section className="border-border/60 border-t px-3 py-3">
            <SectionTitle icon={Database}>Contesto e strumenti</SectionTitle>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-3">
              {usage.toolCallCount !== undefined && (
                <MetricValue
                  label="Tool"
                  value={`${formatCount(usage.toolCallCount)} chiamate${formatBytesFromChars(usage.toolResultChars) ? ` · ${formatBytesFromChars(usage.toolResultChars)}` : ""}`}
                />
              )}
              {usage.ragAttempted !== undefined && (
                <MetricValue
                  label="RAG"
                  value={
                    usage.ragUsed
                      ? `usato · ${formatCount(usage.ragChunksCount ?? 0)} chunk`
                      : usage.ragAttempted
                        ? "tentato · nessun chunk"
                        : "non tentato"
                  }
                />
              )}
              {usage.memoryRecall && (
                <MetricValue
                  label="Recall memoria"
                  value={`${usage.memoryRecall.mode} · ${formatCount(usage.memoryRecall.factCount)} fatti · ${formatCount(usage.memoryRecall.evidenceCount)} evidenze`}
                />
              )}
            </dl>
            {usage.memoryRecall && (
              <p className="mt-2 flex items-center gap-1.5 border-border/50 border-t pt-2 text-[11px]">
                <Clock3 className="h-3 w-3" aria-hidden="true" />
                Recall fatti {formatDuration(usage.memoryRecall.factRecallMs)} ·
                conversazioni{" "}
                {formatDuration(usage.memoryRecall.conversationRecallMs)}
                {usage.memoryRecall.degraded ? " · degradato" : ""}
              </p>
            )}
          </section>
        )}
      </div>
    </details>
  );
}
