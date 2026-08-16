"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  KeyRound,
  Mail,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  AuthErrorSummary,
  AuthSubmitButton,
  PasswordField,
} from "@/app/(auth)/_components/auth-controls";
import { AnimatedPageHeader } from "@/components/ui/animated-page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type BetaConfig =
  | { active: false }
  | {
      active: true;
      accessVersion: number;
      activatedAt: string;
      rotatedAt: string;
    };

type Subscriber = {
  id: string;
  email: string;
  releaseOptInAt: string;
  updatesOptInAt: string | null;
  updatesOptOutAt: string | null;
  consentVersion: string;
  createdAt: string;
  updatedAt: string;
};

type SubscriberResponse = {
  subscribers: Subscriber[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  metrics: { total: number; updates: number };
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Richiesta non riuscita");
  }
  return payload;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 font-display text-3xl font-bold tracking-tight">
            {value}
          </p>
        </div>
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

export function BetaAdminClient() {
  const [config, setConfig] = useState<BetaConfig | null>(null);
  const [subscriberData, setSubscriberData] =
    useState<SubscriberResponse | null>(null);
  const [page, setPage] = useState(1);
  const [updatesOnly, setUpdatesOnly] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isRotating, setIsRotating] = useState(false);
  const [rotationError, setRotationError] = useState<string | null>(null);
  const [rotationSuccess, setRotationSuccess] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadSubscribers = useCallback(async () => {
    const query = new URLSearchParams({
      page: String(page),
      limit: "25",
      updatesOnly: String(updatesOnly),
    });
    const response = await fetch(
      `/api/admin/beta-access/subscribers?${query.toString()}`,
    );
    setSubscriberData(await readJson<SubscriberResponse>(response));
  }, [page, updatesOnly]);

  useEffect(() => {
    let active = true;
    setLoadError(null);
    Promise.all([
      fetch("/api/admin/beta-access").then((response) =>
        readJson<BetaConfig>(response),
      ),
      loadSubscribers().then(() => null),
    ])
      .then(([nextConfig]) => {
        if (active) setConfig(nextConfig);
      })
      .catch((error) => {
        if (active) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Impossibile caricare la beta privata.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [loadSubscribers]);

  async function rotatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isRotating) return;
    setRotationError(null);
    setRotationSuccess(false);
    if (password.length < 12) {
      setRotationError("La password deve contenere almeno 12 caratteri.");
      return;
    }
    if (password !== confirmation) {
      setRotationError("Le due password non coincidono.");
      return;
    }

    setIsRotating(true);
    try {
      const response = await fetch("/api/admin/beta-access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmation }),
      });
      const nextConfig = await readJson<BetaConfig>(response);
      setConfig(nextConfig);
      setPassword("");
      setConfirmation("");
      setRotationSuccess(true);
    } catch (error) {
      setRotationError(
        error instanceof Error
          ? error.message
          : "Impossibile aggiornare la password beta.",
      );
    } finally {
      setIsRotating(false);
    }
  }

  const activeUpdates = (subscriber: Subscriber) =>
    Boolean(subscriber.updatesOptInAt && !subscriber.updatesOptOutAt);

  return (
    <div className="space-y-8">
      <AnimatedPageHeader
        title="Beta privata"
        description="Accesso condiviso, rotazione globale e consensi della lista di rilascio"
      />

      <AuthErrorSummary message={loadError} />

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Stato accesso"
          value={config?.active ? "Attiva" : "Non configurata"}
          icon={<KeyRound className="size-5" aria-hidden="true" />}
        />
        <MetricCard
          label="Iscritti al rilascio"
          value={subscriberData?.metrics.total ?? "—"}
          icon={<Users className="size-5" aria-hidden="true" />}
        />
        <MetricCard
          label="Aggiornamenti attivi"
          value={subscriberData?.metrics.updates ?? "—"}
          icon={<Mail className="size-5" aria-hidden="true" />}
        />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Accesso condiviso</CardTitle>
                <CardDescription>
                  La password non è collegata agli account e non può essere
                  riletta dopo il salvataggio.
                </CardDescription>
              </div>
              <Badge variant={config?.active ? "default" : "secondary"}>
                {config?.active ? "Attiva" : "Da configurare"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={rotatePassword} className="space-y-5">
              {config?.active ? (
                <div className="rounded-lg border border-border bg-muted/35 px-3.5 py-3 text-sm leading-relaxed text-muted-foreground">
                  <p>Versione accesso: {config.accessVersion}</p>
                  <p>Ultima rotazione: {formatDate(config.rotatedAt)}</p>
                </div>
              ) : null}
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3.5 py-3 text-sm leading-relaxed text-foreground">
                <p className="flex items-start gap-2">
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0 text-amber-500"
                    aria-hidden="true"
                  />
                  Il salvataggio revoca immediatamente tutti gli accessi beta
                  già concessi.
                </p>
              </div>
              <PasswordField
                id="admin-beta-password"
                label="Nuova password beta"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                hint="Almeno 12 caratteri. Usa una frase condivisibile solo con i tester autorizzati."
              />
              <PasswordField
                id="admin-beta-confirmation"
                label="Conferma password beta"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
              <AuthErrorSummary message={rotationError} />
              {rotationSuccess ? (
                <output className="flex items-start gap-2 rounded-lg bg-primary/10 px-3.5 py-3 text-sm leading-relaxed">
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  Password aggiornata: gli accessi precedenti sono stati
                  revocati.
                </output>
              ) : null}
              <AuthSubmitButton
                loading={isRotating}
                disabled={!password || !confirmation}
              >
                {config?.active
                  ? "Ruota password e revoca"
                  : "Attiva la beta privata"}
              </AuthSubmitButton>
            </form>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>Lista di rilascio</CardTitle>
              <CardDescription>
                Indirizzi non verificati e consensi indipendenti dagli account.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="beta-subscriber-filter">Filtra iscritti</Label>
                <select
                  id="beta-subscriber-filter"
                  value={updatesOnly ? "updates" : "all"}
                  onChange={(event) => {
                    setPage(1);
                    setUpdatesOnly(event.target.value === "updates");
                  }}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="all">Tutti</option>
                  <option value="updates">Solo aggiornamenti</option>
                </select>
              </div>
              <a
                href="/api/admin/beta-access/export"
                className={cn(buttonVariants({ variant: "outline" }), "h-9")}
              >
                <Download className="size-4" aria-hidden="true" />
                Esporta CSV
              </a>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Email</TableHead>
                  <TableHead>Rilascio</TableHead>
                  <TableHead>Aggiornamenti</TableHead>
                  <TableHead>Iscrizione</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(subscriberData?.subscribers ?? []).map((subscriber) => (
                  <TableRow key={subscriber.id}>
                    <TableCell className="pl-6 font-medium">
                      {subscriber.email}
                    </TableCell>
                    <TableCell>
                      {formatDate(subscriber.releaseOptInAt)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          activeUpdates(subscriber) ? "default" : "secondary"
                        }
                      >
                        {activeUpdates(subscriber) ? "Attivi" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(subscriber.createdAt)}</TableCell>
                  </TableRow>
                ))}
                {subscriberData?.subscribers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-28 text-center text-muted-foreground"
                    >
                      Nessun iscritto per questo filtro.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t border-border px-5 py-4 text-sm text-muted-foreground">
              <span>
                {subscriberData?.pagination.total ?? 0} risultati · pagina{" "}
                {page}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Indietro
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    !subscriberData ||
                    page >= subscriberData.pagination.totalPages
                  }
                  onClick={() => setPage((current) => current + 1)}
                >
                  Avanti
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
