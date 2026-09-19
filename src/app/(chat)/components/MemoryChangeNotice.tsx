"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { MemoryChange } from "@/types/chat";

export function MemoryChangeNotice({ change }: { change: MemoryChange }) {
  const [state, setState] = useState<"idle" | "saving" | "undone">("idle");
  const [error, setError] = useState<string>();
  async function undo() {
    if (state !== "idle") return;
    setState("saving");
    setError(undefined);
    try {
      const response = await fetch(
        `/api/coaching-context/memories/${encodeURIComponent(change.memoryId)}/undo`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revisionId: change.revisionId }),
        },
      );
      if (!response.ok) {
        setError(
          response.status === 409
            ? "Questa memoria è già cambiata. Puoi modificarla nel profilo."
            : "Impossibile annullare. Riprova.",
        );
        setState("idle");
        return;
      }
      setState("undone");
    } catch {
      setError("Impossibile annullare. Riprova.");
      setState("idle");
    }
  }
  return (
    <div
      className="max-w-full px-1 text-xs leading-relaxed text-muted-foreground"
      aria-live="polite"
    >
      {state === "undone" ? (
        <p>Modifica alla memoria annullata.</p>
      ) : (
        <>
          <p>
            <span className="font-medium">
              {change.kind === "saved"
                ? "Salvato in memoria"
                : "Memoria aggiornata"}
              :
            </span>{" "}
            {change.content}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {change.canUndo && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-8 px-0 text-xs"
                disabled={state === "saving"}
                onClick={undo}
              >
                {state === "saving" ? "Annullamento…" : "Annulla"}
              </Button>
            )}
            <Link
              href="/profile#memoria"
              className="inline-flex min-h-8 items-center underline underline-offset-2"
            >
              Gestisci memoria
            </Link>
          </div>
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </div>
  );
}
