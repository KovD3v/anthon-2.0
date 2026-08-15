import {
  Activity,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Cpu,
  Database,
} from "lucide-react";
import { deriveResponseProfilerSummary } from "@/lib/response-profiler/summary";
import type { Usage } from "@/types/chat";
import { BrowserTimeline } from "./technical-metrics/BrowserTimeline";
import { ProfilerSummary } from "./technical-metrics/ProfilerSummary";
import { RagToolDiagnostics } from "./technical-metrics/RagToolDiagnostics";
import { ServerTimeline } from "./technical-metrics/ServerTimeline";

interface TechnicalMetricsDetailsProps {
  usage: Usage | undefined;
}

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

  const profilerSummary = deriveResponseProfilerSummary(usage);
  const totalTokens = usage.inputTokens + usage.outputTokens;
  const generationDuration = formatDuration(usage.generationTimeMs);
  const cost = formatCost(usage.cost);
  const hasRichDiagnostics = Boolean(
    usage.messageId ||
      usage.model ||
      usage.provider ||
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
        {/* biome-ignore lint/a11y/noStaticElementInteractions: Native summary control gets a keyboard fallback. */}
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
    usage.generationTimeMs !== undefined
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
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Native summary control gets a keyboard fallback. */}
      <summary
        tabIndex={0}
        onKeyDown={toggleDetailsFromKeyboard}
        className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-inset [&::-webkit-details-marker]:hidden"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Activity className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="font-semibold text-foreground">Dettagli tecnici</span>
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

        {(usage.model || usage.provider || usage.messageId) && (
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
              {usage.provider && (
                <MetricValue label="Provider" value={usage.provider} />
              )}
            </dl>
          </section>
        )}

        {usage.serverTrace ? (
          <ServerTimeline trace={usage.serverTrace} summary={profilerSummary} />
        ) : null}
        {usage.clientTrace ? (
          <BrowserTimeline summary={profilerSummary} />
        ) : null}

        {usage.developerDiagnostics && (
          <RagToolDiagnostics diagnostics={usage.developerDiagnostics} />
        )}

        {recordedDurationRows.length > 0 && (
          <section className="border-border/60 border-t px-3 py-3">
            <SectionTitle icon={Clock3}>Durate registrate</SectionTitle>
            <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
              {recordedDurationRows.map((row) => (
                <MetricValue
                  key={row.label}
                  label={row.label}
                  value={formatDuration(row.value) ?? "-"}
                />
              ))}
            </dl>
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
