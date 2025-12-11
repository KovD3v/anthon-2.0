import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/db";

type UserContextPromptCacheEntry = {
  value: string;
  expiresAt: number;
};

const USER_CONTEXT_PROMPT_CACHE_TTL_MS = 30 * 1000; // 30s
const userContextPromptCache = new Map<string, UserContextPromptCacheEntry>();

function invalidateUserContextPromptCache(userId: string) {
  userContextPromptCache.delete(userId);
}

/**
 * Creates user context tools with userId context injected via closure.
 */
export function createUserContextTools(userId: string) {
  return {
    getUserContext: tool({
      description: `Recupera il profilo completo e le preferenze dell'utente.
Include informazioni di coaching come sport praticato, obiettivi, esperienza,
e preferenze di comunicazione come tono e lingua.
Usa questo tool per personalizzare le risposte in base al contesto dell'utente.`,
      inputSchema: z.object({}),
      execute: async () => {
        try {
          // Fetch user with profile and preferences
          const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
              profile: true,
              preferences: true,
            },
          });

          if (!user) {
            return {
              success: false,
              data: null,
              message: "Utente non trovato.",
            };
          }

          // Build context object
          const context = {
            email: user.email,
            profile: user.profile
              ? {
                  name: user.profile.name,
                  sport: user.profile.sport,
                  goal: user.profile.goal,
                  experience: user.profile.experience,
                  birthday: user.profile.birthday?.toISOString().split("T")[0],
                  notes: user.profile.notes,
                }
              : null,
            preferences: user.preferences
              ? {
                  tone: user.preferences.tone,
                  mode: user.preferences.mode,
                  language: user.preferences.language,
                  push: user.preferences.push,
                }
              : null,
            memberSince: user.createdAt.toISOString().split("T")[0],
          };

          return {
            success: true,
            data: context,
            message: "Contesto utente recuperato con successo.",
          };
        } catch (error) {
          console.error("[getUserContext] Error:", error);
          return {
            success: false,
            data: null,
            message: "Errore nel recuperare il contesto utente.",
          };
        }
      },
    }),

    updateProfile: tool({
      description: `Aggiorna il profilo di coaching dell'utente.
Usa questo tool quando l'utente fornisce nuove informazioni sul proprio 
sport, obiettivi, livello di esperienza o altri dettagli del profilo.`,
      inputSchema: z.object({
        name: z.string().optional().describe("Nome dell'utente"),
        sport: z.string().optional().describe("Sport praticato dall'utente"),
        goal: z
          .string()
          .optional()
          .describe("Obiettivo principale dell'utente"),
        experience: z
          .string()
          .optional()
          .describe(
            "Livello di esperienza (principiante, intermedio, avanzato, professionista)"
          ),
        notes: z.string().optional().describe("Note aggiuntive sul profilo"),
      }),
      execute: async (params) => {
        try {
          const profile = await prisma.profile.upsert({
            where: { userId },
            update: {
              ...(params.name && { name: params.name }),
              ...(params.sport && { sport: params.sport }),
              ...(params.goal && { goal: params.goal }),
              ...(params.experience && {
                experience: params.experience,
              }),
              ...(params.notes && { notes: params.notes }),
            },
            create: {
              userId,
              name: params.name,
              sport: params.sport,
              goal: params.goal,
              experience: params.experience,
              notes: params.notes,
            },
          });

          invalidateUserContextPromptCache(userId);

          return {
            success: true,
            data: profile,
            message: "Profilo aggiornato con successo.",
          };
        } catch (error) {
          console.error("[updateProfile] Error:", error);
          return {
            success: false,
            message: "Errore nell'aggiornare il profilo.",
          };
        }
      },
    }),

    updatePreferences: tool({
      description: `Aggiorna le preferenze di comunicazione dell'utente.
Usa questo tool quando rilevi lo stile comunicativo dell'utente o quando esprime
esplicitamente come vuole essere comunicato - tono, modalità o lingua.`,
      inputSchema: z.object({
        tone: z
          .string()
          .optional()
          .describe(
            "Tono preferito: diretto, empatico, tecnico, motivazionale"
          ),
        mode: z
          .string()
          .optional()
          .describe(
            "Modalità di risposta: conciso, elaborato, sfidante, supportivo"
          ),
        language: z
          .string()
          .optional()
          .describe("Lingua preferita: IT, EN, etc."),
        push: z
          .boolean()
          .optional()
          .describe("Se l'utente vuole ricevere notifiche push"),
      }),
      execute: async (params) => {
        try {
          const preferences = await prisma.preferences.upsert({
            where: { userId },
            update: {
              ...(params.tone && { tone: params.tone }),
              ...(params.mode && { mode: params.mode }),
              ...(params.language && {
                language: params.language,
              }),
              ...(params.push !== undefined && {
                push: params.push,
              }),
            },
            create: {
              userId,
              tone: params.tone,
              mode: params.mode,
              language: params.language ?? "IT",
              push: params.push ?? true,
            },
          });

          invalidateUserContextPromptCache(userId);

          return {
            success: true,
            data: preferences,
            message: "Preferenze aggiornate con successo.",
          };
        } catch (error) {
          console.error("[updatePreferences] Error:", error);
          return {
            success: false,
            message: "Errore nell'aggiornare le preferenze.",
          };
        }
      },
    }),

    addNotes: tool({
      description: `Aggiungi appunti personali sull'utente.
Usa questo tool per prendere note su osservazioni, pattern comportamentali, 
intuizioni o qualsiasi informazione utile che noti durante le conversazioni.
Queste note ti aiuteranno a ricordare dettagli importanti per il coaching.
Esempi: "Tende ad essere più motivato il lunedì", "Preferisce esempi pratici", 
"Ha difficoltà con la costanza", "Risponde bene ai complimenti".`,
      inputSchema: z.object({
        note: z
          .string()
          .describe(
            "L'appunto da aggiungere. Sarà concatenato alle note esistenti."
          ),
      }),
      execute: async ({ note }) => {
        try {
          // Get existing profile
          const existingProfile = await prisma.profile.findUnique({
            where: { userId },
            select: { notes: true },
          });

          // Append new note with timestamp
          const timestamp = new Date().toLocaleDateString("it-IT", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
          });
          const newNote = `[${timestamp}] ${note}`;
          const updatedNotes = existingProfile?.notes
            ? `${existingProfile.notes}\n${newNote}`
            : newNote;

          // Update or create profile with notes
          await prisma.profile.upsert({
            where: { userId },
            update: { notes: updatedNotes },
            create: { userId, notes: updatedNotes },
          });

          invalidateUserContextPromptCache(userId);

          return {
            success: true,
            message: "Appunto aggiunto con successo.",
          };
        } catch (error) {
          console.error("[addNotes] Error:", error);
          return {
            success: false,
            message: "Errore nell'aggiungere l'appunto.",
          };
        }
      },
    }),
  };
}

/**
 * Utility function to get formatted user context for system prompt.
 */
export async function formatUserContextForPrompt(
  userId: string
): Promise<string> {
  const cached = userContextPromptCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      preferences: true,
    },
  });

  if (!user) {
    return "";
  }

  const lines: string[] = [];

  // Profile section
  if (user.profile) {
    lines.push("## Profilo Utente:");
    if (user.profile.name) lines.push(`- **Nome**: ${user.profile.name}`);
    if (user.profile.sport) lines.push(`- **Sport**: ${user.profile.sport}`);
    if (user.profile.goal) lines.push(`- **Obiettivo**: ${user.profile.goal}`);
    if (user.profile.experience)
      lines.push(`- **Esperienza**: ${user.profile.experience}`);
    if (user.profile.birthday) {
      const age = Math.floor(
        (Date.now() - user.profile.birthday.getTime()) /
          (365.25 * 24 * 60 * 60 * 1000)
      );
      lines.push(`- **Età**: ${age} anni`);
    }
    if (user.profile.notes) lines.push(`- **Note**: ${user.profile.notes}`);
  }

  // Preferences section
  if (user.preferences) {
    lines.push("\n## Preferenze di Comunicazione:");
    if (user.preferences.tone)
      lines.push(`- **Tono**: ${user.preferences.tone}`);
    if (user.preferences.mode)
      lines.push(`- **Modalità**: ${user.preferences.mode}`);
    if (user.preferences.language)
      lines.push(`- **Lingua**: ${user.preferences.language}`);
  }

  const value = lines.join("\n");
  userContextPromptCache.set(userId, {
    value,
    expiresAt: Date.now() + USER_CONTEXT_PROMPT_CACHE_TTL_MS,
  });
  return value;
}
