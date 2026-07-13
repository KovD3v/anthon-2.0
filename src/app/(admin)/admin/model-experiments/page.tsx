"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, FlaskConical, Pause, Play, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AnimatedPageHeader } from "@/components/ui/animated-page-header";
import { Badge } from "@/components/ui/badge";
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
import type { ModelExperimentSummary } from "@/lib/model-experiments/types";

type Experiment = {
  id: string;
  key: string;
  name: string;
  status: "DRAFT" | "READY" | "ACTIVE" | "PAUSED" | "COMPLETED";
  posthogFlagKey: string;
  variants: Array<{
    role: "CONTROL" | "CANDIDATE";
    modelId: string;
    generationConfig: Record<string, unknown>;
  }>;
  _count: { participants: number; pairs: number };
  readiness: {
    posthogConfigured: boolean;
    variantsConfigured: boolean;
    controlMatchesCurrentRouting: boolean;
    databaseConstraints: boolean;
  };
};

const number = (value: number | null, suffix = "") =>
  value === null ? "—" : `${value.toFixed(1)}${suffix}`;

export default function ModelExperimentsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    key: "",
    name: "",
    posthogFlagKey: "model-comparison-italy",
    controlModel: "z-ai/glm-5.2",
    candidateModel: "",
  });
  const experiments = useQuery<{ experiments: Experiment[] }>({
    queryKey: ["model-experiments"],
    queryFn: async () => {
      const response = await fetch("/api/admin/model-experiments");
      if (!response.ok) throw new Error("Impossibile caricare gli esperimenti");
      return response.json();
    },
  });
  const results = useQuery<{ summary: ModelExperimentSummary }>({
    queryKey: ["model-experiment-results", selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      const response = await fetch(
        `/api/admin/model-experiments/${selectedId}/results`,
      );
      if (!response.ok) throw new Error("Risultati non disponibili");
      return response.json();
    },
  });
  const detail = useQuery<{
    experiment: Experiment & {
      audits: Array<{ id: string; action: string; createdAt: string }>;
    };
  }>({
    queryKey: ["model-experiment-detail", selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      const response = await fetch(
        `/api/admin/model-experiments/${selectedId}`,
      );
      if (!response.ok) throw new Error("Dettagli non disponibili");
      return response.json();
    },
  });

  async function createExperiment() {
    setCreating(true);
    try {
      const response = await fetch("/api/admin/model-experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: form.key,
          name: form.name,
          posthogFlagKey: form.posthogFlagKey,
          targetCountry: "IT",
          cooldownHours: 24,
          perUserCap: 5,
          control: {
            modelId: form.controlModel,
            generationConfig: { fallbacks: false },
          },
          candidate: {
            modelId: form.candidateModel,
            generationConfig: { fallbacks: false },
          },
        }),
      });
      if (!response.ok) throw new Error("Creazione non riuscita");
      setForm((current) => ({
        ...current,
        key: "",
        name: "",
        candidateModel: "",
      }));
      await experiments.refetch();
      toast.success("Bozza creata");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore");
    } finally {
      setCreating(false);
    }
  }

  async function lifecycle(experiment: Experiment, action: string) {
    const response = await fetch(
      `/api/admin/model-experiments/${experiment.id}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      },
    );
    if (!response.ok) {
      toast.error("Transizione non consentita o controlli non superati");
      return;
    }
    await experiments.refetch();
    toast.success("Stato aggiornato");
  }

  const summary = results.data?.summary;
  return (
    <div className="space-y-8">
      <AnimatedPageHeader
        title="Confronti modelli"
        description="Esperimenti paired, anonimi e controllati da database + PostHog"
      />

      <Card className="border-amber-500/25 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            Doppio kill switch
          </CardTitle>
          <CardDescription>
            Metti in pausa qui e disattiva il feature flag PostHog. Completare
            un esperimento non cambia mai il routing di produzione.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Nuova bozza</CardTitle>
          <CardDescription>
            Le configurazioni diventano immutabili dopo READY. Nessuna bozza
            viene attivata automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {[
            ["key", "Chiave", "luna-italy-pilot"],
            ["name", "Nome", "Luna Italy pilot"],
            [
              "posthogFlagKey",
              "Feature flag PostHog",
              "model-comparison-italy",
            ],
            ["controlModel", "Modello control esatto", "z-ai/glm-5.2"],
            ["candidateModel", "Modello candidate esatto", "provider/model"],
          ].map(([field, label, placeholder]) => (
            <div key={field} className="space-y-2">
              <Label htmlFor={field}>{label}</Label>
              <Input
                id={field}
                value={form[field as keyof typeof form]}
                placeholder={placeholder}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    [field]: event.target.value,
                  }))
                }
              />
            </div>
          ))}
          <div className="flex items-end">
            <Button
              className="w-full md:w-auto"
              disabled={
                creating || !form.key || !form.name || !form.candidateModel
              }
              onClick={createExperiment}
            >
              <FlaskConical className="mr-2 h-4 w-4" />
              Crea bozza inattiva
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {(experiments.data?.experiments ?? []).map((experiment) => {
          const readiness = experiment.readiness;
          const ready = Object.values(readiness).every(Boolean);
          return (
            <Card key={experiment.id} className="overflow-hidden">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg">{experiment.name}</CardTitle>
                    <CardDescription>{experiment.key}</CardDescription>
                  </div>
                  <Badge
                    variant={
                      experiment.status === "ACTIVE" ? "default" : "secondary"
                    }
                  >
                    {experiment.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1 rounded-xl border border-border/70 px-3 py-2 font-mono text-xs">
                  {experiment.variants.map((variant) => (
                    <div key={variant.role} className="flex gap-2">
                      <span className="w-20 text-muted-foreground">
                        {variant.role}
                      </span>
                      <span className="truncate">{variant.modelId}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 text-sm">
                  <span>Partecipanti: {experiment._count.participants}</span>
                  <span>Pair: {experiment._count.pairs}</span>
                  <span
                    className={
                      readiness.posthogConfigured
                        ? "text-emerald-600"
                        : "text-destructive"
                    }
                  >
                    PostHog{" "}
                    {readiness.posthogConfigured ? "configurato" : "mancante"}
                  </span>
                  <span
                    className={
                      readiness.controlMatchesCurrentRouting
                        ? "text-emerald-600"
                        : "text-amber-600"
                    }
                  >
                    Routing{" "}
                    {readiness.controlMatchesCurrentRouting
                      ? "allineato"
                      : "drift"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {experiment.status === "DRAFT" && (
                    <Button
                      size="sm"
                      disabled={!ready}
                      onClick={() => lifecycle(experiment, "READY")}
                    >
                      READY
                    </Button>
                  )}
                  {experiment.status === "READY" && (
                    <Button
                      size="sm"
                      onClick={() => lifecycle(experiment, "ACTIVATE")}
                    >
                      <Play className="mr-1 h-3 w-3" />
                      Attiva
                    </Button>
                  )}
                  {experiment.status === "ACTIVE" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => lifecycle(experiment, "PAUSE")}
                    >
                      <Pause className="mr-1 h-3 w-3" />
                      Pausa
                    </Button>
                  )}
                  {experiment.status === "PAUSED" && (
                    <Button
                      size="sm"
                      onClick={() => lifecycle(experiment, "RESUME")}
                    >
                      <Play className="mr-1 h-3 w-3" />
                      Riprendi
                    </Button>
                  )}
                  {experiment.status !== "DRAFT" &&
                    experiment.status !== "COMPLETED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => lifecycle(experiment, "COMPLETE")}
                      >
                        Completa
                      </Button>
                    )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedId(experiment.id)}
                  >
                    <Activity className="mr-1 h-3 w-3" />
                    Risultati
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {summary && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Risultati — {summary.name}</CardTitle>
                <CardDescription>
                  Priorità: latenza Italia → costo → preferenza → throughput
                </CardDescription>
              </div>
              {summary.readyForManualReview && (
                <Badge>Pronto per revisione manuale</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Control TTFT p50 / p95"
                value={`${number(summary.latency.control.firstTokenP50, "ms")} / ${number(summary.latency.control.firstTokenP95, "ms")}`}
              />
              <Metric
                label="Candidate TTFT p50 / p95"
                value={`${number(summary.latency.candidate.firstTokenP50, "ms")} / ${number(summary.latency.candidate.firstTokenP95, "ms")}`}
              />
              <Metric
                label="Costo control / candidate"
                value={`$${summary.cost.control.toFixed(4)} / $${summary.cost.candidate.toFixed(4)}`}
              />
              <Metric
                label="Overhead esperimento"
                value={`$${summary.cost.overhead.toFixed(4)}`}
              />
              <Metric
                label="Voti control / candidate / pari"
                value={`${summary.votes.control} / ${summary.votes.candidate} / ${summary.votes.tie}`}
              />
              <Metric
                label="Preferenza candidate decisiva"
                value={
                  summary.decisiveCandidateShare === null
                    ? "—"
                    : `${(summary.decisiveCandidateShare * 100).toFixed(1)}%`
                }
              />
              <Metric
                label="Fallimenti parziali"
                value={`${(summary.partialFailureRate * 100).toFixed(1)}%`}
              />
              <Metric
                label="Coppie / partecipanti / giorni"
                value={`${summary.sampleSize} / ${summary.participants} / ${summary.daysRunning}`}
              />
            </div>
            {detail.data?.experiment.audits.length ? (
              <div className="border-border/70 border-t pt-5">
                <h3 className="mb-3 text-sm font-semibold">Audit lifecycle</h3>
                <ol className="space-y-2 text-sm">
                  {detail.data.experiment.audits.slice(0, 10).map((audit) => (
                    <li
                      key={audit.id}
                      className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"
                    >
                      <span className="font-medium">{audit.action}</span>
                      <time className="text-xs text-muted-foreground">
                        {new Date(audit.createdAt).toLocaleString("it-IT")}
                      </time>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}
