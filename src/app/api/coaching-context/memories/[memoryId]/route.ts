import { invalidateCoachingContextPromptCaches } from "@/lib/ai/coaching-context-cache";
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
  projectCoachingMemory,
} from "@/lib/coaching-context";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const memoryLogger = createLogger("ai");
type RouteContext = { params: Promise<{ memoryId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return unauthorized(error || "Non autorizzato");
    const { memoryId } = await params;

    const memory = await prisma.memory.findFirst({
      where: { id: memoryId, userId: user.id },
      select: { id: true },
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

    const now = new Date();
    const updated = await prisma.memory.update({
      where: { id: memory.id },
      data: {
        category: parsed.data.category,
        value: {
          content: parsed.data.content,
          category: parsed.data.category,
          confidence: 1,
          updatedAt: now.toISOString(),
        },
      },
      select: {
        id: true,
        value: true,
        category: true,
        updatedAt: true,
      },
    });
    invalidateCoachingContextPromptCaches(user.id);
    return jsonOk(projectCoachingMemory(updated));
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
    const { memoryId } = await params;

    const memory = await prisma.memory.findFirst({
      where: { id: memoryId, userId: user.id },
      select: { id: true },
    });
    if (!memory) return notFound("Memoria non trovata");

    await prisma.memory.delete({ where: { id: memory.id } });
    invalidateCoachingContextPromptCaches(user.id);
    return jsonOk({ deleted: true });
  } catch (error) {
    memoryLogger.error("memory.delete_error", "Failed to delete memory", {
      error,
    });
    return serverError("Errore interno del server");
  }
}
