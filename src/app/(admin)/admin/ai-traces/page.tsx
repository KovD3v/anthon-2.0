"use client";

import { useEffect, useState } from "react";
import { AnimatedPageHeader } from "@/components/ui/animated-page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type TraceAccessPurpose =
  | "DEBUGGING"
  | "USER_SUPPORT"
  | "SAFETY_ABUSE_INVESTIGATION";

type Trace = {
  id: string;
  conversationThreadId: string;
  userMessageId: string | null;
  assistantMessageId: string | null;
  status: string;
  contentCaptureStatus: string;
  expiresAt: string;
  createdAt: string;
};

type TraceDetail = Trace & {
  metadata?: unknown;
  payload?: unknown;
};

const accessPurposes: Array<{
  value: TraceAccessPurpose;
  label: string;
}> = [
  { value: "DEBUGGING", label: "Debug tecnico" },
  { value: "USER_SUPPORT", label: "Supporto richiesto dall'utente" },
  {
    value: "SAFETY_ABUSE_INVESTIGATION",
    label: "Indagine di sicurezza o abuso",
  },
];

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Richiesta non riuscita");
  }
  return payload;
}

function localizeTraceAccessError(reason: unknown): string {
  if (reason instanceof Error && reason.message === "Trace expired") {
    return "Il trace è scaduto.";
  }
  return reason instanceof Error
    ? reason.message
    : "Impossibile leggere il trace";
}

export default function AiTracesPage() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<TraceAccessPurpose>("DEBUGGING");
  const [reason, setReason] = useState("");
  const [caseId, setCaseId] = useState("");
  const [detail, setDetail] = useState<TraceDetail | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/ai-traces", { cache: "no-store" })
      .then((response) => readJson<{ traces: Trace[] }>(response))
      .then((data) => {
        if (active) setTraces(data.traces);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Impossibile caricare i trace",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  function selectTrace(traceId: string) {
    setSelectedTraceId(traceId);
    setReason("");
    setCaseId("");
    setDetail(null);
    setAccessError(null);
  }

  async function readTrace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTraceId) return;

    setReading(true);
    setAccessError(null);
    setDetail(null);
    try {
      const response = await fetch(`/api/admin/ai-traces/${selectedTraceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ purpose, reason, caseId }),
      });
      const data = await readJson<{ trace: TraceDetail }>(response);
      setDetail(data.trace);
    } catch (reason) {
      setAccessError(localizeTraceAccessError(reason));
    } finally {
      setReading(false);
    }
  }

  return (
    <div className="space-y-6">
      <AnimatedPageHeader
        title="Trace AI"
        description="I trace sono cifrati e leggibili solo con uno scopo documentato."
      />
      <Card>
        <CardHeader>
          <CardTitle>Turni recenti</CardTitle>
          <CardDescription>
            Seleziona un trace per registrare il motivo e il caso collegato
            prima di richiederne il contenuto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : traces.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nessun trace disponibile.
            </p>
          ) : (
            <ul className="space-y-3 text-sm">
              {traces.map((trace) => (
                <li key={trace.id}>
                  <button
                    type="button"
                    aria-pressed={selectedTraceId === trace.id}
                    disabled={reading}
                    onClick={() => selectTrace(trace.id)}
                    className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="font-mono text-primary">{trace.id}</span>
                    <span className="mt-1 block text-muted-foreground">
                      {trace.status} · {trace.contentCaptureStatus} ·{" "}
                      {new Date(trace.createdAt).toLocaleString("it-IT")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {selectedTraceId ? (
        <Card>
          <CardHeader>
            <CardTitle>Accesso controllato</CardTitle>
            <CardDescription>
              Ogni lettura registra scopo, motivazione e riferimento del caso.
              Accesso per revisione qualità non disponibile.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={readTrace}>
              <div className="space-y-2">
                <Label htmlFor="trace-purpose">Scopo dell'accesso</Label>
                <select
                  id="trace-purpose"
                  value={purpose}
                  onChange={(event) =>
                    setPurpose(event.target.value as TraceAccessPurpose)
                  }
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  required
                >
                  {accessPurposes.map((accessPurpose) => (
                    <option
                      key={accessPurpose.value}
                      value={accessPurpose.value}
                    >
                      {accessPurpose.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="trace-case-id">ID caso o ticket</Label>
                <Input
                  id="trace-case-id"
                  value={caseId}
                  onChange={(event) => setCaseId(event.target.value)}
                  placeholder="INC-123"
                  maxLength={256}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trace-reason">Motivazione scritta</Label>
                <Textarea
                  id="trace-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Descrivi perché serve leggere questo trace."
                  maxLength={2_000}
                  required
                  rows={4}
                />
              </div>
              {accessError ? (
                <p className="text-sm text-destructive" role="alert">
                  {accessError}
                </p>
              ) : null}
              <Button
                type="submit"
                disabled={reading || !reason.trim() || !caseId.trim()}
              >
                {reading ? "Lettura in corso…" : "Leggi contenuto"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {detail ? (
        <Card>
          <CardHeader>
            <CardTitle>Contenuto del trace</CardTitle>
            <CardDescription>
              Contenuto restituito per questa lettura autorizzata.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-160 overflow-auto rounded-lg border bg-muted/30 p-4 text-xs whitespace-pre-wrap">
              {JSON.stringify(detail.payload ?? null, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
