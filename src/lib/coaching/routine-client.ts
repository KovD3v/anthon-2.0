import { z } from "zod";
import {
  type RoutineCardData,
  routineCardDataSchema,
} from "@/lib/coaching/routine";

const routineResponseSchema = z
  .object({ routine: routineCardDataSchema })
  .strict();
const activeRoutineResponseSchema = z
  .object({ routine: routineCardDataSchema.nullable() })
  .strict();

export type RoutineAttemptOutcome =
  | "HELPFUL"
  | "PARTIALLY_HELPFUL"
  | "NOT_HELPFUL";

export class RoutineClientError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "RoutineClientError";
  }
}

export async function fetchActiveRoutineForReturn(): Promise<RoutineCardData | null> {
  let response: Response;
  try {
    response = await fetch("/api/coaching/routines", {
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    throw new RoutineClientError(
      "Connessione non disponibile. Controlla la rete e riprova.",
      null,
    );
  }

  if (!response.ok) {
    throw new RoutineClientError(
      messageForStatus(response.status),
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new RoutineClientError(
      "Risposta del server non valida. Riprova.",
      response.status,
    );
  }

  const parsed = activeRoutineResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new RoutineClientError(
      "Risposta del server non valida. Riprova.",
      response.status,
    );
  }
  return parsed.data.routine;
}

function messageForStatus(status: number): string {
  if (status === 409) {
    return "La routine non è più attiva. Aggiorna la chat e riprova.";
  }
  if (status === 422) {
    return "La proposta non è più valida. Aggiorna la chat e riprova.";
  }
  return "Operazione non riuscita. Riprova.";
}

async function requestRoutine(
  url: string,
  init: RequestInit,
): Promise<RoutineCardData> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new RoutineClientError(
      "Connessione non disponibile. Controlla la rete e riprova.",
      null,
    );
  }

  if (!response.ok) {
    throw new RoutineClientError(
      messageForStatus(response.status),
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new RoutineClientError(
      "Risposta del server non valida. Riprova.",
      response.status,
    );
  }

  const parsed = routineResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new RoutineClientError(
      "Risposta del server non valida. Riprova.",
      response.status,
    );
  }
  return parsed.data.routine;
}

export function saveRoutineProposal(
  sourceAssistantMessageId: string,
): Promise<RoutineCardData> {
  return requestRoutine("/api/coaching/routines", {
    method: "POST",
    body: JSON.stringify({ sourceAssistantMessageId }),
  });
}

export function createRoutineAttempt(
  routineId: string,
  clientActionId: string,
  outcome?: RoutineAttemptOutcome,
  outcomeNote?: string | null,
): Promise<RoutineCardData> {
  return requestRoutine(`/api/coaching/routines/${routineId}/attempts`, {
    method: "POST",
    body: JSON.stringify({
      clientActionId,
      ...(outcome ? { outcome } : {}),
      ...(outcomeNote !== undefined ? { outcomeNote } : {}),
    }),
  });
}

export function saveRoutineOutcome(
  attemptId: string,
  outcome: RoutineAttemptOutcome,
  outcomeNote?: string | null,
): Promise<RoutineCardData> {
  return requestRoutine(`/api/coaching/attempts/${attemptId}`, {
    method: "PATCH",
    body: JSON.stringify({
      outcome,
      ...(outcomeNote !== undefined ? { outcomeNote } : {}),
    }),
  });
}

export function archiveRoutine(routineId: string): Promise<RoutineCardData> {
  return requestRoutine(`/api/coaching/routines/${routineId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "ARCHIVED" }),
  });
}
