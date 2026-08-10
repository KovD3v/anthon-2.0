import type { Usage } from "@/types/chat";

interface TechnicalMetricsDetailsProps {
  usage: Usage | undefined;
}

function formatDuration(generationTimeMs: number | undefined) {
  if (
    typeof generationTimeMs !== "number" ||
    !Number.isFinite(generationTimeMs) ||
    generationTimeMs <= 0
  ) {
    return null;
  }

  return new Intl.NumberFormat("it-IT", {
    maximumFractionDigits: 2,
  }).format(generationTimeMs / 1000);
}

export function TechnicalMetricsDetails({
  usage,
}: TechnicalMetricsDetailsProps) {
  if (!usage) return null;

  const duration = formatDuration(usage.generationTimeMs);
  const totalTokens = usage.inputTokens + usage.outputTokens;

  return (
    <details className="mt-2 min-w-0 max-w-full border-t border-border/50 pt-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground/80 marker:text-muted-foreground">
        Dettagli tecnici
      </summary>
      <div className="mt-2 flex min-w-0 max-w-full flex-wrap gap-x-3 gap-y-1 break-words">
        <span>{totalTokens} token totali</span>
        <span>{usage.inputTokens} in ingresso</span>
        <span>{usage.outputTokens} in uscita</span>
        {duration && <span>Durata: {duration} s</span>}
      </div>
    </details>
  );
}
