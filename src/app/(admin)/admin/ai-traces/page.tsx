"use client";

import { useEffect, useState } from "react";
import { AnimatedPageHeader } from "@/components/ui/animated-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Trace = {
  id: string;
  conversationThreadId: string;
  userMessageId: string | null;
  assistantMessageId: string | null;
  status: string;
  contentCaptureStatus: string;
  createdAt: string;
};

export default function AiTracesPage() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/ai-traces")
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error);
        return response.json() as Promise<{ traces: Trace[] }>;
      })
      .then((data) => setTraces(data.traces))
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Impossibile caricare i trace",
        ),
      );
  }, []);

  return (
    <div className="space-y-6">
      <AnimatedPageHeader
        title="Trace AI"
        description="Debug cifrato dei turni AI. Il contenuto completo richiede SUPER_ADMIN."
      />
      <Card>
        <CardHeader>
          <CardTitle>Turni recenti</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : traces.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nessun trace disponibile.
            </p>
          ) : (
            <ul className="space-y-3 text-sm">
              {traces.map((trace) => (
                <li key={trace.id} className="rounded-lg border p-3">
                  <a
                    className="font-mono text-primary underline"
                    href={`/api/admin/ai-traces/${trace.id}`}
                  >
                    {trace.id}
                  </a>
                  <p className="mt-1 text-muted-foreground">
                    {trace.status} · {trace.contentCaptureStatus} ·{" "}
                    {new Date(trace.createdAt).toLocaleString("it-IT")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
