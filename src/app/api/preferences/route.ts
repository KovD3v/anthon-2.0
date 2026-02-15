import {
  jsonOk,
  notFound,
  serverError,
  unauthorized,
} from "@/lib/api/responses";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/preferences
 * Fetch the current user's preferences
 */
export async function GET() {
  try {
    const { user, error } = await getAuthUser();

    if (error || !user) {
      return unauthorized(error || "Non autorizzato");
    }

    // Find the user by id
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { preferences: true },
    });

    if (!dbUser) {
      return notFound("Utente non trovato");
    }

    // Return preferences or defaults
    const preferences = dbUser.preferences || {
      voiceEnabled: true,
      tone: null,
      mode: null,
      language: "IT",
      push: true,
    };

    return jsonOk(preferences);
  } catch (error) {
    console.error("[GET /api/preferences] Error:", error);
    return serverError("Errore interno del server");
  }
}

/**
 * PATCH /api/preferences
 * Update the current user's preferences
 */
export async function PATCH(request: Request) {
  try {
    const { user, error } = await getAuthUser();

    if (error || !user) {
      return unauthorized(error || "Non autorizzato");
    }

    const body = await request.json();
    const { voiceEnabled, tone, mode, language, push } = body;

    // Find the user by id
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { preferences: true },
    });

    if (!dbUser) {
      return notFound("Utente non trovato");
    }

    // Upsert preferences
    const preferences = await prisma.preferences.upsert({
      where: { userId: dbUser.id },
      update: {
        ...(voiceEnabled !== undefined && { voiceEnabled }),
        ...(tone !== undefined && { tone }),
        ...(mode !== undefined && { mode }),
        ...(language !== undefined && { language }),
        ...(push !== undefined && { push }),
      },
      create: {
        userId: dbUser.id,
        voiceEnabled: voiceEnabled ?? true,
        tone: tone ?? null,
        mode: mode ?? null,
        language: language ?? "IT",
        push: push ?? true,
      },
    });

    return jsonOk(preferences);
  } catch (error) {
    console.error("[PATCH /api/preferences] Error:", error);
    return serverError("Errore interno del server");
  }
}
