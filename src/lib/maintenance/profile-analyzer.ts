import { generateText, Output } from "ai";
import { z } from "zod";
import { maintenanceModel } from "@/lib/ai/providers/openrouter";
import { prisma } from "@/lib/db";

const ProfileAnalysisSchema = z.object({
  tone: z
    .enum(["calm", "energetic", "professional", "friendly", "direct"])
    .nullable()
    .describe("Suggested communication tone based on user style"),
  mode: z
    .enum(["coaching", "friendly", "direct"])
    .nullable()
    .describe("Suggested interaction mode"),
  newNotes: z
    .string()
    .nullable()
    .describe(
      "New qualitative observations to append to profile notes (max 1 sentence)",
    ),
  updates: z
    .object({
      sport: z.string().nullable(),
      goal: z.string().nullable(),
      experience: z.string().nullable(),
    })
    .describe("Specific profile field updates detected with high confidence"),
});

export async function analyzeUserProfile(userId: string): Promise<void> {
  // 1. Fetch recent messages (last 50 or since last analysis?)
  // For simplicity MVP: fetch last 50 user messages
  const messages = await prisma.message.findMany({
    where: {
      userId,
      role: "USER",
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  if (messages.length < 10) return; // Need enough data

  const textAnalysis = messages
    .reverse() // chronologic
    .map((m) => m.content)
    .join("\n---\n");

  try {
    // 2. Analyze
    const { output } = await generateText({
      model: maintenanceModel,
      output: Output.object({ schema: ProfileAnalysisSchema }),
      system: `Analizza lo stile di comunicazione e gli obiettivi dell'utente dai messaggi recenti.
Cerca di estrarre:
- Tono: (calm, energetic, professional, friendly, direct)
- Modalità: (coaching, friendly, direct)
- Dati profilo: sport, obiettivi, esperienza.

Se rilevi queste informazioni, AGGIORNALE. Non esitare.
Se l'utente dice "mi piace X", aggiorna le preferenze.
Se parla di "tennis", aggiorna lo sport.`,
      prompt: `Messaggi recenti dell'utente:\n${textAnalysis}`,
    });

    if (!output) return;

    // 3. Update Database
    await prisma.$transaction(async (tx) => {
      // Update Preferences
      if (output.tone || output.mode) {
        await tx.preferences.upsert({
          where: { userId },
          update: {
            ...(output.tone && { tone: output.tone }),
            ...(output.mode && { mode: output.mode }),
          },
          create: {
            userId,
            tone: output.tone || "calm",
            mode: output.mode || "coaching",
          },
        });
      }

      // Update Profile Fields
      const profileUpdates: {
        sport?: string | null;
        goal?: string | null;
        experience?: string | null;
        notes?: string;
      } = {};
      if (output.updates.sport) profileUpdates.sport = output.updates.sport;
      if (output.updates.goal) profileUpdates.goal = output.updates.goal;
      if (output.updates.experience)
        profileUpdates.experience = output.updates.experience;

      // Append Notes
      if (output.newNotes) {
        const currentProfile = await tx.profile.findUnique({
          where: { userId },
          select: { notes: true },
        });
        const oldNotes = currentProfile?.notes || "";
        // Avoid duplicate notes logic could go here
        profileUpdates.notes = oldNotes
          ? `${oldNotes}\n- ${output.newNotes}`
          : `- ${output.newNotes}`;
      }

      if (Object.keys(profileUpdates).length > 0) {
        await tx.profile.upsert({
          where: { userId },
          update: profileUpdates,
          create: {
            userId,
            ...profileUpdates,
          },
        });
      }
    });
  } catch (error) {
    console.error("[Analyzer] Error analyzing profile:", error);
  }
}
