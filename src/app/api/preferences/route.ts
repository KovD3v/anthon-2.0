import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/preferences
 * Fetch the current user's preferences
 */
export async function GET() {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    // Find the user by clerkId
    const user = await prisma.user.findUnique({
      where: { clerkId },
      include: { preferences: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Utente non trovato" },
        { status: 404 },
      );
    }

    // Return preferences or defaults
    const preferences = user.preferences || {
      voiceEnabled: true,
      tone: null,
      mode: null,
      language: "IT",
      push: true,
    };

    return NextResponse.json(preferences);
  } catch (error) {
    console.error("[GET /api/preferences] Error:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/preferences
 * Update the current user's preferences
 */
export async function PATCH(request: Request) {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const body = await request.json();
    const { voiceEnabled, tone, mode, language, push } = body;

    // Find the user by clerkId
    const user = await prisma.user.findUnique({
      where: { clerkId },
      include: { preferences: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Utente non trovato" },
        { status: 404 },
      );
    }

    // Upsert preferences
    const preferences = await prisma.preferences.upsert({
      where: { userId: user.id },
      update: {
        ...(voiceEnabled !== undefined && { voiceEnabled }),
        ...(tone !== undefined && { tone }),
        ...(mode !== undefined && { mode }),
        ...(language !== undefined && { language }),
        ...(push !== undefined && { push }),
      },
      create: {
        userId: user.id,
        voiceEnabled: voiceEnabled ?? true,
        tone: tone ?? null,
        mode: mode ?? null,
        language: language ?? "IT",
        push: push ?? true,
      },
    });

    return NextResponse.json(preferences);
  } catch (error) {
    console.error("[PATCH /api/preferences] Error:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 },
    );
  }
}
