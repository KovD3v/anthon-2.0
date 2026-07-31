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
  coachingProfilePatchSchema,
  projectCoachingMemory,
} from "@/lib/coaching-context";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const contextLogger = createLogger("ai");

export async function GET() {
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return unauthorized(error || "Non autorizzato");

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        profile: {
          select: { sport: true, goal: true, experience: true },
        },
        memories: {
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            value: true,
            category: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!dbUser) return notFound("Utente non trovato");

    const memories = dbUser.memories
      .map(projectCoachingMemory)
      .filter((memory) => memory !== null);
    const skipped = dbUser.memories.length - memories.length;
    if (skipped > 0) {
      contextLogger.warn(
        "context.memory_invalid",
        "Skipped malformed coaching memories",
        { count: skipped, userId: user.id },
      );
    }

    return jsonOk({
      profile: dbUser.profile ?? {
        sport: null,
        goal: null,
        experience: null,
      },
      memories,
    });
  } catch (error) {
    contextLogger.error(
      "context.get_error",
      "Failed to fetch coaching context",
      {
        error,
      },
    );
    return serverError("Errore interno del server");
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return unauthorized(error || "Non autorizzato");

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true },
    });
    if (!dbUser) return notFound("Utente non trovato");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("Corpo richiesta non valido");
    }
    const parsed = coachingProfilePatchSchema.safeParse(body);
    if (!parsed.success) return badRequest("Profilo di coaching non valido");

    const profile = await prisma.profile.upsert({
      where: { userId: user.id },
      update: parsed.data,
      create: { userId: user.id, ...parsed.data },
      select: { sport: true, goal: true, experience: true },
    });
    invalidateCoachingContextPromptCaches(user.id);
    return jsonOk(profile);
  } catch (error) {
    contextLogger.error(
      "context.patch_error",
      "Failed to update coaching context",
      { error },
    );
    return serverError("Errore interno del server");
  }
}
