import { z } from "zod";
import { undoMemoryRevision } from "@/lib/ai/memory-changes";
import {
  badRequest,
  jsonOk,
  notFound,
  serverError,
  unauthorized,
} from "@/lib/api/responses";
import { getAuthUser } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import {
  isOnboardingRequired,
  onboardingRequiredResponse,
} from "@/lib/onboarding/gate";

const logger = createLogger("ai");
const undoSchema = z
  .object({ revisionId: z.string().min(1).max(100) })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ memoryId: string }> },
) {
  const { user, error } = await getAuthUser();
  if (error || !user || user.isGuest) return unauthorized();
  if (isOnboardingRequired(user)) return onboardingRequiredResponse("/profile");
  const body = undoSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return badRequest("Richiesta non valida");
  try {
    const { memoryId } = await params;
    const result = await undoMemoryRevision(
      user.id,
      memoryId,
      body.data.revisionId,
    );
    if (result === "not_found") return notFound("Modifica non trovata");
    if (result === "pending")
      return Response.json(
        { error: "Il salvataggio della memoria è ancora in corso" },
        { status: 409 },
      );
    if (result === "stale")
      return Response.json(
        {
          error: "Questa memoria è già cambiata. Puoi modificarla nel profilo.",
        },
        { status: 409 },
      );
    return jsonOk({ undone: true });
  } catch (error) {
    logger.error("memory.undo_failed", "Failed undoing memory change", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return serverError("Impossibile annullare la modifica");
  }
}
