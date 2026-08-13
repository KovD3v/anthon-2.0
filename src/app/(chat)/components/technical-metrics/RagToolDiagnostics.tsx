"use client";

import { Copy, Database, Wrench } from "lucide-react";
import type {
  DeveloperDiagnosticsV1,
  DeveloperSerializedValue,
} from "@/lib/response-profiler/developer-diagnostics";

interface RagToolDiagnosticsProps {
  diagnostics: DeveloperDiagnosticsV1;
}

const RAG_LABELS = {
  not_attempted: "non tentato",
  attempted_empty: "tentato, nessun risultato",
  used: "usato",
  failed: "fallito",
} as const;

const TOOL_LABELS = {
  completed: "completato",
  failed: "fallito",
  cancelled: "annullato",
  not_allowed: "non consentito",
} as const;

function json(value: DeveloperSerializedValue) {
  return JSON.stringify(value, null, 2);
}

function CopyButton({ label, value }: { label: string; value: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => navigator.clipboard?.writeText(value)}
      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      <Copy className="h-3 w-3" aria-hidden="true" />
    </button>
  );
}

function Payload({
  label,
  copyLabel,
  value,
}: {
  label: string;
  copyLabel: string;
  value: DeveloperSerializedValue;
}) {
  const serialized = json(value);
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </span>
        <CopyButton label={copyLabel} value={serialized} />
      </div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md bg-background/80 p-2 font-mono text-[11px] leading-relaxed text-foreground ring-1 ring-border/60">
        {serialized}
      </pre>
    </div>
  );
}

export function RagToolDiagnostics({ diagnostics }: RagToolDiagnosticsProps) {
  return (
    <section className="border-border/60 border-t px-3 py-3">
      <h4 className="mb-3 flex items-center gap-1.5 font-semibold text-foreground">
        <Database className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        Diagnostica RAG e tool
        {diagnostics.truncated && (
          <span className="ml-auto rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
            dati troncati
          </span>
        )}
      </h4>

      {diagnostics.rag && (
        <div className="rounded-lg bg-background/50 p-2.5 ring-1 ring-border/60">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-foreground">
              RAG · {RAG_LABELS[diagnostics.rag.decision]}
            </strong>
            <span className="tabular-nums">
              {diagnostics.rag.chunks.length} chunk
            </span>
          </div>
          {diagnostics.rag.query && (
            <div className="mt-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">
                  Query effettiva
                </span>
                <CopyButton
                  label="Copia query RAG"
                  value={diagnostics.rag.query}
                />
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words rounded bg-muted/60 p-2 font-mono text-[11px] text-foreground">
                {diagnostics.rag.query}
              </p>
            </div>
          )}
          {diagnostics.rag.error !== undefined && (
            <div className="mt-2">
              <Payload
                label="Errore RAG"
                copyLabel="Copia errore RAG"
                value={diagnostics.rag.error}
              />
            </div>
          )}
          <div className="mt-2 space-y-2">
            {diagnostics.rag.chunks.map((chunk) => (
              <details
                key={chunk.sequence}
                className="rounded-md bg-muted/45 p-2 open:bg-muted/65"
              >
                <summary className="cursor-pointer font-medium text-foreground">
                  Chunk {chunk.sequence}
                  {chunk.documentTitle ? ` · ${chunk.documentTitle}` : ""}
                  {chunk.score !== undefined
                    ? ` · score ${chunk.score.toFixed(4)}`
                    : ""}
                </summary>
                <dl className="mt-2 grid gap-1 text-[11px] sm:grid-cols-2">
                  {chunk.documentId && (
                    <div>
                      <dt className="inline font-semibold">Documento: </dt>
                      <dd className="inline font-mono">{chunk.documentId}</dd>
                    </div>
                  )}
                  {chunk.chunkId && (
                    <div>
                      <dt className="inline font-semibold">Chunk ID: </dt>
                      <dd className="inline font-mono">{chunk.chunkId}</dd>
                    </div>
                  )}
                </dl>
                <div className="mt-2 flex justify-end">
                  <CopyButton
                    label={`Copia chunk ${chunk.sequence}`}
                    value={chunk.text}
                  />
                </div>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-background/80 p-2 font-mono text-[11px] leading-relaxed text-foreground ring-1 ring-border/60">
                  {chunk.text}
                </pre>
              </details>
            ))}
          </div>
        </div>
      )}

      {diagnostics.tools.length > 0 && (
        <div className="mt-3 space-y-2">
          {diagnostics.tools.map((tool) => (
            <details
              key={tool.sequence}
              className="rounded-lg bg-background/50 p-2.5 ring-1 ring-border/60"
              open
            >
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <Wrench
                    className="h-3.5 w-3.5 text-primary"
                    aria-hidden="true"
                  />
                  <strong className="font-mono text-foreground">
                    {tool.name}
                  </strong>
                  <span>{TOOL_LABELS[tool.status]}</span>
                  <span className="ml-auto tabular-nums">
                    {tool.startOffsetMs !== undefined
                      ? `+${tool.startOffsetMs} ms`
                      : ""}
                    {tool.durationMs !== undefined
                      ? ` · ${tool.durationMs} ms`
                      : ""}
                  </span>
                </span>
              </summary>
              <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-2">
                <Payload
                  label="Input"
                  copyLabel={`Copia input ${tool.name}`}
                  value={tool.input}
                />
                {tool.output !== undefined && (
                  <Payload
                    label="Output"
                    copyLabel={`Copia output ${tool.name}`}
                    value={tool.output}
                  />
                )}
                {tool.error !== undefined && (
                  <Payload
                    label="Errore"
                    copyLabel={`Copia errore ${tool.name}`}
                    value={tool.error}
                  />
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
