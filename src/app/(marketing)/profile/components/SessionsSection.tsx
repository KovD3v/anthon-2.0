"use client";

import { useSession, useUser } from "@clerk/nextjs";
import type { SessionWithActivitiesResource } from "@clerk/shared/types";
import { Loader2, LogOut, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

function sessionLabel(session: SessionWithActivitiesResource) {
  const activity = session.latestActivity;
  return (
    [activity.browserName, activity.browserVersion].filter(Boolean).join(" ") ||
    "Dispositivo sconosciuto"
  );
}

function sessionLocation(session: SessionWithActivitiesResource) {
  const activity = session.latestActivity;
  return (
    [activity.city, activity.country].filter(Boolean).join(", ") ||
    "Posizione non disponibile"
  );
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export function SessionsSection() {
  const { isLoaded: userLoaded, user } = useUser();
  const { session: currentSession } = useSession();
  const [sessions, setSessions] = useState<SessionWithActivitiesResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [revokingSession, setRevokingSession] =
    useState<SessionWithActivitiesResource | null>(null);
  const getSessions = user?.getSessions;

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey intentionally retriggers session loading.
  useEffect(() => {
    let active = true;

    async function loadSessions() {
      if (!userLoaded || !getSessions) {
        if (active) setLoading(false);
        return;
      }

      setLoading(true);
      setFailed(false);
      try {
        const loadedSessions = await getSessions();
        if (!active) return;
        setSessions(loadedSessions.filter((item) => item.status === "active"));
      } catch {
        if (active) {
          setFailed(true);
          toast.error("Impossibile caricare le sessioni attive");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadSessions();
    return () => {
      active = false;
    };
  }, [getSessions, reloadKey, userLoaded]);

  if (!userLoaded || loading) {
    return (
      <Card
        aria-label="Caricamento sessioni"
        className="flex min-h-48 items-center justify-center border-border/70 bg-card/70 shadow-none"
      >
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="sr-only">Caricamento sessioni</span>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card
        className="border-border/70 bg-card/70 p-6 shadow-none"
        role="alert"
      >
        Impossibile caricare le sessioni dell&apos;account.
      </Card>
    );
  }

  const handleRevoke = async () => {
    if (!revokingSession) return;
    const sessionToRevoke = revokingSession;

    try {
      await sessionToRevoke.revoke();
      setSessions((current) =>
        current.filter((item) => item.id !== sessionToRevoke.id),
      );
      setRevokingSession(null);
      toast.success("Sessione revocata");
    } catch {
      toast.error("Impossibile revocare la sessione");
    }
  };

  return (
    <Card className="overflow-hidden border-border/70 bg-card/70 shadow-none">
      <div className="border-b border-border/70 bg-muted/25 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <LogOut className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <h2 className="font-display text-2xl font-bold uppercase tracking-tight">
                Sessioni attive
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Controlla dove è aperto il tuo account e revoca gli accessi che
                non riconosci.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 gap-2"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            <RefreshCw className="h-4 w-4" />
            Aggiorna
          </Button>
        </div>
      </div>

      {failed ? (
        <div className="px-6 py-6" role="alert">
          <p className="text-sm font-medium">
            Le sessioni non sono disponibili.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 min-h-11 gap-2"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            <RefreshCw className="h-4 w-4" />
            Riprova
          </Button>
        </div>
      ) : sessions.length === 0 ? (
        <p className="px-6 py-6 text-sm text-muted-foreground">
          Non risultano sessioni attive oltre a quella corrente.
        </p>
      ) : (
        <div className="divide-y divide-border/70">
          {sessions.map((session) => {
            const label = sessionLabel(session);
            const isCurrent = session.id === currentSession?.id;

            return (
              <div
                key={session.id}
                className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{label}</p>
                    {isCurrent ? (
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                        Questa sessione
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {sessionLocation(session)} · Ultima attività{" "}
                    {formatDate(session.lastActiveAt)}
                  </p>
                </div>
                {!isCurrent ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 shrink-0 gap-2 self-start text-muted-foreground hover:text-destructive sm:self-auto"
                    aria-label={`Revoca sessione ${label}`}
                    onClick={() => setRevokingSession(session)}
                  >
                    <LogOut className="h-4 w-4" />
                    Revoca
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(revokingSession)}
        onOpenChange={(open) => {
          if (!open) setRevokingSession(null);
        }}
        onConfirm={handleRevoke}
        title="Revocare la sessione?"
        description="Il dispositivo dovrà autenticarsi di nuovo per accedere al tuo account."
        confirmText="Sì, revoca"
        cancelText="Annulla"
        variant="destructive"
      />
    </Card>
  );
}
