import { invalidateCoachingContextPromptCaches } from "@/lib/ai/coaching-context-cache";
import { listActiveFacts } from "@/lib/ai/memory-facts";
import { updateCanonicalProfile } from "@/lib/ai/user-knowledge";
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
  projectCoachingFact,
} from "@/lib/coaching-context";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import {
  isOnboardingRequired,
  onboardingRequiredResponse,
} from "@/lib/onboarding/gate";

const contextLogger = createLogger("ai");

export async function GET() {
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return unauthorized(error || "Non autorizzato");
    if (isOnboardingRequired(user))
      return onboardingRequiredResponse("/profile");

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        profile: {
          select: {
            age: true,
            occupation: true,
            sport: true,
            goal: true,
            experience: true,
          },
        },
      },
    });
    if (!dbUser) return notFound("Utente non trovato");

    const factResult = await listActiveFacts({ userId: user.id, limit: 64 });
    if (factResult.degraded) {
      return serverError("Errore interno del server");
    }
    const memories = factResult.facts.map(projectCoachingFact);

    return jsonOk({
      profile: dbUser.profile ?? {
        age: null,
        occupation: null,
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
    if (isOnboardingRequired(user))
      return onboardingRequiredResponse("/profile");

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

    const profile = await updateCanonicalProfile(user.id, parsed.data);
    invalidateCoachingContextPromptCaches(user.id);
    return jsonOk({
      age: profile.age,
      occupation: profile.occupation,
      sport: profile.sport,
      goal: profile.goal,
      experience: profile.experience,
    });
  } catch (error) {
    contextLogger.error(
      "context.patch_error",
      "Failed to update coaching context",
      { error },
    );
    return serverError("Errore interno del server");
  }
}
