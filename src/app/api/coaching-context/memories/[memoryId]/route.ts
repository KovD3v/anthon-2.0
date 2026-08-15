import { createHash } from "node:crypto";
import { invalidateCoachingContextPromptCaches } from "@/lib/ai/coaching-context-cache";
import {
  forgetFact,
  getActiveFactById,
  reviseFact,
} from "@/lib/ai/memory-facts";
import {
  badRequest,
  jsonOk,
  notFound,
  serverError,
  unauthorized,
} from "@/lib/api/responses";
import { getAuthUser } from "@/lib/auth";
import {
  coachingMemoryPatchSchema,
  projectCoachingFact,
} from "@/lib/coaching-context";
import { createLogger } from "@/lib/logger";
import {
  isOnboardingRequired,
  onboardingRequiredResponse,
} from "@/lib/onboarding/gate";

const memoryLogger = createLogger("ai");
type RouteContext = { params: Promise<{ memoryId: string }> };

function revisionDedupeKey(input: {
  userId: string;
  memoryId: string;
  content: string;
  category: string;
}) {
  const digest = createHash("sha256")
    .update(`${input.category}\0${input.content}`)
    .digest("hex")
    .slice(0, 24);
  return `coaching-context:revise:${input.userId}:${input.memoryId}:${digest}`;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return unauthorized(error || "Non autorizzato");
    if (isOnboardingRequired(user))
      return onboardingRequiredResponse("/profile");
    const { memoryId } = await params;

    const memory = await getActiveFactById({
      userId: user.id,
      factId: memoryId,
    });
    if (!memory) return notFound("Memoria non trovata");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("Corpo richiesta non valido");
    }
    const parsed = coachingMemoryPatchSchema.safeParse(body);
    if (!parsed.success) return badRequest("Memoria non valida");

    const result = await reviseFact({
      userId: user.id,
      factId: memory.id,
      key: memory.key,
      value: parsed.data.content,
      category: parsed.data.category,
      confidence: 1,
      sensitivity: parsed.data.category === "health" ? "HIGH" : "LOW",
      origin: "EXPLICIT",
      dedupeKey: revisionDedupeKey({
        userId: user.id,
        memoryId: memory.id,
        ...parsed.data,
      }),
    });
    if (result.status === "not_found") return notFound("Memoria non trovata");
    if (result.status !== "saved" && result.status !== "duplicate") {
      return serverError("Errore interno del server");
    }
    const updated = await getActiveFactById({
      userId: user.id,
      factId: memory.id,
    });
    if (!updated) return notFound("Memoria non trovata");
    invalidateCoachingContextPromptCaches(user.id);
    return jsonOk(projectCoachingFact(updated));
  } catch (error) {
    memoryLogger.error("memory.patch_error", "Failed to update memory", {
      error,
    });
    return serverError("Errore interno del server");
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return unauthorized(error || "Non autorizzato");
    if (isOnboardingRequired(user))
      return onboardingRequiredResponse("/profile");
    const { memoryId } = await params;

    const result = await forgetFact({
      userId: user.id,
      factId: memoryId,
      dedupeKey: `coaching-context:forget:${user.id}:${memoryId}`,
    });
    if (result.status === "not_found") return notFound("Memoria non trovata");
    if (result.status !== "forgotten" && result.status !== "duplicate") {
      return serverError("Errore interno del server");
    }
    invalidateCoachingContextPromptCaches(user.id);
    return jsonOk({ deleted: true });
  } catch (error) {
    memoryLogger.error("memory.delete_error", "Failed to delete memory", {
      error,
    });
    return serverError("Errore interno del server");
  }
}
