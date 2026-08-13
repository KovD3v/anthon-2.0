import type { Usage } from "@/types/chat";
import type { ServerSpanName } from "./contracts";

export interface ResponseProfilerSummary {
  quality: "complete" | "partial" | "legacy";
  serverTotalMs?: number;
  browserTotalMs?: number;
  serverTtftMs?: number;
  firstDeltaMs?: number;
  firstVisibleMs?: number;
  perceivedCompletionMs?: number;
  persistedResolutionMs?: number;
  outsideMeasuredBackendMs?: number;
  outputTokensPerSecond?: number;
  dominantServerSpanId?: number;
  serverRows: Array<{
    id: number;
    label: string;
    startOffsetMs: number;
    endOffsetMs: number;
    startPercent: number;
    widthPercent: number;
    durationPercent: number;
    durationMs: number;
    status: "completed" | "failed" | "cancelled";
  }>;
  browserLanes: Array<{
    lane: "network" | "rendering" | "persistence";
    milestones: Array<{ key: string; offsetMs: number; offsetPercent: number }>;
  }>;
}

const SERVER_LABELS: Record<ServerSpanName, string> = {
  auth: "Autenticazione",
  database_connect: "Connessione database",
  user_lookup: "Lettura utente",
  chat_lookup: "Lettura chat",
  billing_sync: "Sincronizzazione piano",
  rate_limit_check: "Controllo limiti",
  usage_reservation: "Prenotazione utilizzo",
  rate_limit: "Controllo limiti",
  inbound_claim: "Registrazione richiesta",
  attachment_resolution: "Preparazione allegati",
  transcription: "Trascrizione audio",
  classification: "Classificazione",
  routing: "Selezione profilo",
  history: "Cronologia conversazione",
  user_context: "Profilo utente",
  memory_facts: "Memorie persistenti",
  conversation_recall: "Richiamo conversazioni",
  rag_decision: "Decisione RAG",
  rag_embedding: "Embedding RAG",
  rag_search: "Ricerca RAG",
  prompt_build: "Costruzione prompt",
  provider_wait: "Attesa provider",
  model_stream: "Generazione modello",
  tool: "Esecuzione strumento",
  assistant_persistence: "Salvataggio risposta",
};

const BROWSER_MILESTONES = {
  network: [
    ["requestStartedMs", "Richiesta avviata"],
    ["streamOpenedMs", "Stream aperto"],
    ["firstChunkReceivedMs", "Primo chunk ricevuto"],
    ["firstTextDeltaReceivedMs", "Primo delta di testo"],
    ["streamCompletedMs", "Stream completato"],
  ],
  rendering: [
    ["firstDomTextMs", "Primo testo nel DOM"],
    ["firstVisibleFrameMs", "Primo frame visibile"],
  ],
  persistence: [["persistedMessageResolvedMs", "Risposta persistita risolta"]],
} as const;

function presentationPercent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (value / total) * 100));
}

function deriveQuality(usage: Usage): ResponseProfilerSummary["quality"] {
  if (!usage.serverTrace && !usage.clientTrace) return "legacy";
  return usage.serverTrace?.status === "completed" &&
    usage.clientTrace?.status === "completed"
    ? "complete"
    : "partial";
}

export function deriveResponseProfilerSummary(
  usage: Usage,
): ResponseProfilerSummary {
  const serverTrace = usage.serverTrace;
  const clientTrace = usage.clientTrace;
  const milestones = clientTrace?.milestones;
  const clientOffsets = milestones
    ? Object.values(milestones).filter(
        (value): value is number => typeof value === "number",
      )
    : [];
  const browserTotalMs = Math.max(0, ...clientOffsets);
  const serverRows =
    serverTrace?.spans.map((span) => ({
      id: span.id,
      label: SERVER_LABELS[span.name],
      startOffsetMs: span.startOffsetMs,
      endOffsetMs: span.startOffsetMs + span.durationMs,
      startPercent: presentationPercent(
        span.startOffsetMs,
        serverTrace.totalMs,
      ),
      widthPercent: presentationPercent(span.durationMs, serverTrace.totalMs),
      durationPercent: presentationPercent(
        span.durationMs,
        serverTrace.totalMs,
      ),
      durationMs: span.durationMs,
      status: span.status,
    })) ?? [];
  const dominantServerSpan = serverTrace?.spans.reduce<
    (typeof serverTrace.spans)[number] | undefined
  >(
    (dominant, span) =>
      !dominant || span.durationMs > dominant.durationMs ? span : dominant,
    undefined,
  );
  const deliveredModelSpan = serverTrace?.spans
    .filter(
      (span) =>
        span.name === "model_stream" &&
        span.status === "completed" &&
        span.attributes?.outcome === "completed",
    )
    .sort(
      (left, right) =>
        (right.attributes?.attemptSequence ?? 0) -
          (left.attributes?.attemptSequence ?? 0) || right.id - left.id,
    )[0];
  const outputTokensPerSecond =
    deliveredModelSpan && deliveredModelSpan.durationMs > 0
      ? (usage.outputTokens * 1_000) / deliveredModelSpan.durationMs
      : undefined;
  const browserLanes = (
    Object.entries(BROWSER_MILESTONES) as Array<
      [
        keyof typeof BROWSER_MILESTONES,
        (typeof BROWSER_MILESTONES)[keyof typeof BROWSER_MILESTONES],
      ]
    >
  ).map(([lane, definitions]) => ({
    lane,
    milestones: definitions.flatMap(([field, label]) => {
      const offsetMs = milestones?.[field];
      return offsetMs === undefined
        ? []
        : [
            {
              key: label,
              offsetMs,
              offsetPercent: presentationPercent(offsetMs, browserTotalMs),
            },
          ];
    }),
  }));
  const serverTtftMs = serverTrace?.timeToFirstTokenMs;
  const firstVisibleMs = milestones?.firstVisibleFrameMs;

  return {
    quality: deriveQuality(usage),
    ...(serverTrace ? { serverTotalMs: serverTrace.totalMs } : {}),
    ...(clientTrace ? { browserTotalMs } : {}),
    ...(serverTtftMs !== undefined ? { serverTtftMs } : {}),
    ...(milestones?.firstTextDeltaReceivedMs !== undefined
      ? { firstDeltaMs: milestones.firstTextDeltaReceivedMs }
      : {}),
    ...(firstVisibleMs !== undefined ? { firstVisibleMs } : {}),
    ...(milestones?.streamCompletedMs !== undefined
      ? { perceivedCompletionMs: milestones.streamCompletedMs }
      : {}),
    ...(milestones?.persistedMessageResolvedMs !== undefined
      ? { persistedResolutionMs: milestones.persistedMessageResolvedMs }
      : {}),
    ...(serverTtftMs !== undefined && firstVisibleMs !== undefined
      ? {
          outsideMeasuredBackendMs: Math.max(0, firstVisibleMs - serverTtftMs),
        }
      : {}),
    ...(outputTokensPerSecond !== undefined ? { outputTokensPerSecond } : {}),
    ...(dominantServerSpan
      ? { dominantServerSpanId: dominantServerSpan.id }
      : {}),
    serverRows,
    browserLanes,
  };
}
