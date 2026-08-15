"use client";

import {
  Brain,
  Check,
  Loader2,
  Save,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { reportClientError } from "@/lib/client-error-reporting";

const ROUTING_TASKS = [
  "social",
  "rewrite",
  "translate",
  "format",
  "extract",
  "summarize_supplied",
] as const;

type RoutingTask = (typeof ROUTING_TASKS)[number];
type RoutingMode = "off" | "shadow" | "active";

interface ClassifierConfig {
  liveClassifierEnabled: boolean;
  executionRoutingMode: RoutingMode;
  executionRoutingAllocationPercent: number;
  executionRoutingTasks: RoutingTask[];
  source: "database" | "environment";
  updatedAt: string | null;
}

interface ClassifierResponse {
  config: ClassifierConfig;
  canEdit: boolean;
}

const TASK_LABELS: Record<RoutingTask, { title: string; description: string }> =
  {
    social: {
      title: "Social e saluti",
      description: "Messaggi brevi e conversazionali",
    },
    rewrite: {
      title: "Riscrittura",
      description: "Riformulare un testo esistente",
    },
    translate: {
      title: "Traduzione",
      description: "Tradurre senza aggiungere contenuto",
    },
    format: {
      title: "Formattazione",
      description: "Adattare struttura o formato",
    },
    extract: {
      title: "Estrazione",
      description: "Estrarre dati da testo fornito",
    },
    summarize_supplied: {
      title: "Riassunto",
      description: "Riassumere materiale già fornito",
    },
  };

function cloneConfig(config: ClassifierConfig): ClassifierConfig {
  return {
    ...config,
    executionRoutingTasks: [...config.executionRoutingTasks],
  };
}

function formatUpdatedAt(updatedAt: string | null) {
  if (!updatedAt) return "mai persistita";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(updatedAt));
}

export default function ClassifierPage() {
  const [config, setConfig] = useState<ClassifierConfig | null>(null);
  const [draft, setDraft] = useState<ClassifierConfig | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/classifier", {
        cache: "no-store",
      });
      const body = (await response.json()) as
        | ClassifierResponse
        | { error?: string };

      if (!response.ok || !("config" in body)) {
        throw new Error(
          "error" in body && body.error
            ? body.error
            : "Impossibile caricare la configurazione",
        );
      }

      setConfig(body.config);
      setDraft(cloneConfig(body.config));
      setCanEdit(body.canEdit);
    } catch (loadError) {
      reportClientError(loadError, { source: "admin.classifier.load" });
      setError("Impossibile caricare la configurazione del classificatore.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const isDirty = useMemo(
    () =>
      Boolean(
        config && draft && JSON.stringify(config) !== JSON.stringify(draft),
      ),
    [config, draft],
  );

  function updateDraft(
    update: (current: ClassifierConfig) => ClassifierConfig,
  ) {
    setDraft((current) => (current ? update(current) : current));
  }

  function toggleTask(task: RoutingTask, checked: boolean) {
    updateDraft((current) => ({
      ...current,
      executionRoutingTasks: checked
        ? [...current.executionRoutingTasks, task]
        : current.executionRoutingTasks.filter((item) => item !== task),
    }));
  }

  async function saveConfig() {
    if (!draft || !canEdit) return;

    setSaving(true);
    try {
      const response = await fetch("/api/admin/classifier", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          liveClassifierEnabled: draft.liveClassifierEnabled,
          executionRoutingMode: draft.executionRoutingMode,
          executionRoutingAllocationPercent:
            draft.executionRoutingAllocationPercent,
          executionRoutingTasks: draft.executionRoutingTasks,
        }),
      });
      const body = (await response.json()) as
        | { config: ClassifierConfig }
        | { error?: string };

      if (!response.ok || !("config" in body)) {
        throw new Error(
          "error" in body && body.error
            ? body.error
            : "Impossibile salvare la configurazione",
        );
      }

      setConfig(body.config);
      setDraft(cloneConfig(body.config));
      toast.success("Configurazione del classificatore salvata");
    } catch (saveError) {
      reportClientError(saveError, { source: "admin.classifier.save" });
      toast.error("Impossibile salvare la configurazione");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="sr-only">Caricamento configurazione</span>
      </div>
    );
  }

  if (!draft || !config) {
    return (
      <div className="space-y-6">
        <AnimatedPageHeader
          title="Classificatore"
          description="Controlla il routing dei turni e l'allowlist del profilo light."
        />
        <Card variant="glass">
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            <p className="text-sm text-muted-foreground">
              {error ?? "Configurazione non disponibile."}
            </p>
            <Button type="button" variant="outline" onClick={loadConfig}>
              Riprova
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasAllowlist = draft.executionRoutingTasks.length > 0;

  return (
    <div className="space-y-6">
      <AnimatedPageHeader
        title="Classificatore"
        description="Controlla il routing dei turni e l'allowlist del profilo light."
      />

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant={config.source === "database" ? "success" : "warning"}>
          {config.source === "database"
            ? "Configurazione persistita"
            : "Fallback ambiente"}
        </Badge>
        <span>Ultimo salvataggio: {formatUpdatedAt(config.updatedAt)}</span>
        {!canEdit && (
          <Badge variant="outline">
            <ShieldCheck className="mr-1 h-3 w-3" aria-hidden="true" />
            Solo lettura
          </Badge>
        )}
      </div>

      {error && (
        <Card variant="glass" className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-6 text-sm text-amber-600 dark:text-amber-400">
            {error}
          </CardContent>
        </Card>
      )}

      <Card variant="glass">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" aria-hidden="true" />
                Classificatore live
              </CardTitle>
              <CardDescription>
                Abilita il classificatore remoto solo per i turni in cui vuoi
                accettare il round-trip aggiuntivo. Il modello standard continua
                a scegliere gli strumenti in modalità agentica.
              </CardDescription>
            </div>
            <Switch
              aria-label="Abilita classificatore live"
              checked={draft.liveClassifierEnabled}
              disabled={!canEdit || saving}
              onCheckedChange={(checked) =>
                updateDraft((current) => ({
                  ...current,
                  liveClassifierEnabled: checked,
                }))
              }
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`h-2 w-2 rounded-full ${draft.liveClassifierEnabled ? "bg-amber-500" : "bg-emerald-500"}`}
              aria-hidden="true"
            />
            <span className="font-medium">
              {draft.liveClassifierEnabled ? "Attivo" : "Spento"}
            </span>
            <span className="text-muted-foreground">
              {draft.liveClassifierEnabled
                ? "può aggiungere latenza prima della risposta"
                : "nessuna chiamata live del classificatore"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card variant="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontal
              className="h-5 w-5 text-primary"
              aria-hidden="true"
            />
            Routing del profilo light
          </CardTitle>
          <CardDescription>
            L'allowlist abilita solo task semplici e autosufficienti. Tutto il
            resto resta sul profilo standard; in shadow si misura senza cambiare
            il profilo effettivamente usato.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <label
              className="space-y-2 text-sm font-medium"
              htmlFor="routing-mode"
            >
              Modalità rollout
              <select
                id="routing-mode"
                value={draft.executionRoutingMode}
                disabled={!canEdit || saving}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    executionRoutingMode: event.target.value as RoutingMode,
                  }))
                }
                className="border-input bg-background/60 flex h-9 w-full rounded-md border px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="off">Disattivato</option>
                <option value="shadow">Shadow: misura soltanto</option>
                <option value="active">
                  Attivo: usa light quando eleggibile
                </option>
              </select>
            </label>

            <label
              className="space-y-2 text-sm font-medium"
              htmlFor="routing-allocation"
            >
              Allocazione: {draft.executionRoutingAllocationPercent}%
              <input
                id="routing-allocation"
                type="range"
                min="0"
                max="100"
                step="5"
                value={draft.executionRoutingAllocationPercent}
                disabled={!canEdit || saving}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    executionRoutingAllocationPercent: Number(
                      event.target.value,
                    ),
                  }))
                }
                className="h-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed"
              />
              <span className="block text-xs font-normal text-muted-foreground">
                Percentuale stabile dei turni eleggibili che può usare light.
              </span>
            </label>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium">Allowlist task</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Seleziona solo task senza web, RAG, memory o contesto profondo.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {ROUTING_TASKS.map((task) => {
                const taskInfo = TASK_LABELS[task];
                const checked = draft.executionRoutingTasks.includes(task);
                return (
                  <label
                    key={task}
                    htmlFor={`classifier-task-${task}`}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 p-3 transition-colors hover:bg-muted/40 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
                  >
                    <Checkbox
                      id={`classifier-task-${task}`}
                      aria-label={taskInfo.title}
                      checked={checked}
                      disabled={!canEdit || saving}
                      onCheckedChange={(nextChecked) =>
                        toggleTask(task, nextChecked)
                      }
                    />
                    <span className="space-y-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {checked && (
                          <Check
                            className="h-3.5 w-3.5 text-primary"
                            aria-hidden="true"
                          />
                        )}
                        {taskInfo.title}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {taskInfo.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {!hasAllowlist && draft.executionRoutingMode !== "off" && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
              Seleziona almeno un task oppure disattiva il rollout prima di
              salvare.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={!isDirty || saving}
          onClick={() => setDraft(cloneConfig(config))}
        >
          Annulla modifiche
        </Button>
        <Button
          type="button"
          disabled={
            !canEdit ||
            !isDirty ||
            saving ||
            (!hasAllowlist && draft.executionRoutingMode !== "off")
          }
          onClick={saveConfig}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          Salva configurazione
        </Button>
      </div>
    </div>
  );
}
