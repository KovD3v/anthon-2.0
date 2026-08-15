import { tool } from "ai";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import {
  updateCanonicalPreferences,
  updateCanonicalProfile,
} from "@/lib/ai/user-knowledge";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import {
  clearTinyUserSnapshotInFlight,
  clearUserContextPromptInFlight,
  getTinyUserSnapshotCache,
  getTinyUserSnapshotGeneration,
  getTinyUserSnapshotInFlight,
  getUserContextPromptCache,
  getUserContextPromptGeneration,
  getUserContextPromptInFlight,
  invalidateUserContextPromptCache,
  setTinyUserSnapshotCache,
  setTinyUserSnapshotInFlight,
  setUserContextPromptCache,
  setUserContextPromptInFlight,
} from "./user-context-cache";

type CompactMemoryValue = {
  content?: unknown;
};

type PromptUserRow = {
  profileName: string | null;
  profileAge: number | null;
  profileOccupation: string | null;
  profileSport: string | null;
  profileGoal: string | null;
  profileExperience: string | null;
  profileBirthday: Date | null;
  profileNotes: string | null;
  preferenceTone: string | null;
  preferenceMode: string | null;
  preferenceLanguage: string | null;
  memoryKey?: string | null;
  memoryValue?: Prisma.JsonValue | null;
};

const USER_CONTEXT_PROMPT_CACHE_TTL_MS = 30 * 1000; // 30s
const TINY_USER_SNAPSHOT_CACHE_TTL_MS = 2 * 60 * 1000; // 2m
const userContextLogger = createLogger("ai");

export { invalidateUserContextPromptCache } from "./user-context-cache";

async function loadPromptUserContext(
  userId: string,
  includeTinyMemories: boolean,
): Promise<PromptUserRow[]> {
  if (!includeTinyMemories) {
    return prisma.$queryRaw<PromptUserRow[]>(Prisma.sql`
      SELECT
        p."name" AS "profileName",
        p."age" AS "profileAge",
        p."occupation" AS "profileOccupation",
        p."sport" AS "profileSport",
        p."goal" AS "profileGoal",
        p."experience" AS "profileExperience",
        p."birthday" AS "profileBirthday",
        p."notes" AS "profileNotes",
        pref."tone" AS "preferenceTone",
        pref."mode" AS "preferenceMode",
        pref."language" AS "preferenceLanguage"
      FROM "User" u
      LEFT JOIN "Profile" p ON p."userId" = u."id"
      LEFT JOIN "Preferences" pref ON pref."userId" = u."id"
      WHERE u."id" = ${userId}
        AND u."deletedAt" IS NULL
      LIMIT 1
    `);
  }

  return prisma.$queryRaw<PromptUserRow[]>(Prisma.sql`
    SELECT
      p."name" AS "profileName",
      p."age" AS "profileAge",
      p."occupation" AS "profileOccupation",
      p."sport" AS "profileSport",
      p."goal" AS "profileGoal",
      p."experience" AS "profileExperience",
      p."birthday" AS "profileBirthday",
      p."notes" AS "profileNotes",
      pref."tone" AS "preferenceTone",
      pref."mode" AS "preferenceMode",
      pref."language" AS "preferenceLanguage",
      memory."key" AS "memoryKey",
      memory."value" AS "memoryValue"
    FROM "User" u
    LEFT JOIN "Profile" p ON p."userId" = u."id"
    LEFT JOIN "Preferences" pref ON pref."userId" = u."id"
    LEFT JOIN LATERAL (
      SELECT m."key", m."value"
      FROM "Memory" m
      WHERE m."userId" = u."id"
        AND m."category" IN (
          'identity', 'sport', 'goal', 'preference', 'schedule'
        )
      ORDER BY m."updatedAt" DESC
      LIMIT 4
    ) memory ON TRUE
    WHERE u."id" = ${userId}
      AND u."deletedAt" IS NULL
  `);
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
                  age: user.profile.age,
                  occupation: user.profile.occupation,
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
          userContextLogger.error(
            "ai.user_context.fetch_failed",
            "Failed to fetch user context",
            { error },
          );
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
        age: z
          .number()
          .int()
          .min(1)
          .max(120)
          .optional()
          .describe("Età dell'utente"),
        occupation: z
          .string()
          .optional()
          .describe("Lavoro o ambito di studio dell'utente"),
        sport: z.string().optional().describe("Sport praticato dall'utente"),
        goal: z
          .string()
          .optional()
          .describe("Obiettivo principale dell'utente"),
        experience: z
          .string()
          .optional()
          .describe(
            "Livello di esperienza (principiante, intermedio, avanzato, professionista)",
          ),
        notes: z.string().optional().describe("Note aggiuntive sul profilo"),
      }),
      execute: async (params) => {
        try {
          const profile = await updateCanonicalProfile(userId, params);

          return {
            success: true,
            data: profile,
            message: "Profilo aggiornato con successo.",
          };
        } catch (error) {
          userContextLogger.error(
            "ai.user_context.profile_update_failed",
            "Failed to update user profile",
            { error },
          );
          return {
            success: false,
            message: "Errore nell'aggiornare il profilo.",
          };
        }
      },
    }),

    updatePreferences: tool({
      description: `Aggiorna le preferenze di comunicazione dell'utente.
USE THIS TOOL immediately when the user specifies a preferred tone, length, or mode.
CRITICAL: You MUST provide at least one parameter. Do not call with empty arguments.`,
      inputSchema: z.object({
        tone: z
          .string()
          .optional()
          .describe(
            "Tono preferito: diretto, empatico, tecnico, motivazionale",
          ),
        mode: z
          .string()
          .optional()
          .describe(
            "Modalità di risposta: conciso, elaborato, sfidante, supportivo",
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
          if (Object.keys(params).length === 0) {
            return {
              success: false,
              message:
                "Errore: Nessun parametro fornito. Specifica almeno una preferenza da aggiornare.",
            };
          }

          const preferences = await updateCanonicalPreferences(userId, params);

          return {
            success: true,
            data: preferences,
            message: "Preferenze aggiornate con successo.",
          };
        } catch (error) {
          userContextLogger.error(
            "ai.user_context.preferences_update_failed",
            "Failed to update user preferences",
            { error },
          );
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
            "L'appunto da aggiungere. Sarà concatenato alle note esistenti.",
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
          userContextLogger.error(
            "ai.user_context.notes_update_failed",
            "Failed to add user note",
            { error },
          );
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
  userId: string,
): Promise<string> {
  const cached = getUserContextPromptCache(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const existing = getUserContextPromptInFlight(userId);
  if (existing) return existing;

  const generation = getUserContextPromptGeneration(userId);
  const promise = loadPromptUserContext(userId, false)
    .then(([row]) => {
      if (!row) return "";

      const lines: string[] = [];

      // Profile section
      if (
        row.profileName ||
        row.profileAge ||
        row.profileOccupation ||
        row.profileSport ||
        row.profileGoal ||
        row.profileExperience ||
        row.profileBirthday ||
        row.profileNotes
      ) {
        lines.push("## Profilo Utente:");
        if (row.profileName) lines.push(`- **Nome**: ${row.profileName}`);
        if (row.profileAge) lines.push(`- **Età**: ${row.profileAge} anni`);
        if (row.profileOccupation)
          lines.push(`- **Lavoro o studio**: ${row.profileOccupation}`);
        if (row.profileSport) lines.push(`- **Sport**: ${row.profileSport}`);
        if (row.profileGoal) lines.push(`- **Obiettivo**: ${row.profileGoal}`);
        if (row.profileExperience)
          lines.push(`- **Esperienza**: ${row.profileExperience}`);
        if (!row.profileAge && row.profileBirthday) {
          const age = Math.floor(
            (Date.now() - row.profileBirthday.getTime()) /
              (365.25 * 24 * 60 * 60 * 1000),
          );
          lines.push(`- **Età**: ${age} anni`);
        }
        if (row.profileNotes) lines.push(`- **Note**: ${row.profileNotes}`);
      }

      // Preferences section
      if (row.preferenceTone || row.preferenceMode || row.preferenceLanguage) {
        lines.push("\n## Preferenze di Comunicazione:");
        if (row.preferenceTone) lines.push(`- **Tono**: ${row.preferenceTone}`);
        if (row.preferenceMode)
          lines.push(`- **Modalità**: ${row.preferenceMode}`);
        if (row.preferenceLanguage)
          lines.push(`- **Lingua**: ${row.preferenceLanguage}`);
      }

      return lines.join("\n");
    })
    .then((value) => {
      if (getUserContextPromptGeneration(userId) === generation) {
        setUserContextPromptCache(userId, {
          value,
          expiresAt: Date.now() + USER_CONTEXT_PROMPT_CACHE_TTL_MS,
        });
      }
      return value;
    });
  setUserContextPromptInFlight(userId, promise);

  return promise.finally(() => {
    clearUserContextPromptInFlight(userId, promise);
  });
}

/**
 * Minimal profile/preferences snapshot for latency-sensitive prompts.
 * Keep this intentionally compact: it preserves personalization without
 * injecting long notes, full memories, or tool instructions.
 */
export async function formatTinyUserSnapshotForPrompt(
  userId: string,
): Promise<string> {
  const cached = getTinyUserSnapshotCache(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const existing = getTinyUserSnapshotInFlight(userId);
  if (existing) return existing;

  const generation = getTinyUserSnapshotGeneration(userId);
  const promise = loadPromptUserContext(userId, true)
    .then((rows) => {
      const [firstRow] = rows;
      if (!firstRow) return "";

      const lines: string[] = [];
      if (firstRow.preferenceLanguage) {
        lines.push(`Lingua: ${firstRow.preferenceLanguage}`);
      }
      if (firstRow.profileSport) {
        lines.push(`Sport: ${firstRow.profileSport}`);
      }
      if (firstRow.profileAge) {
        lines.push(`Età: ${firstRow.profileAge} anni`);
      }
      if (firstRow.profileOccupation) {
        lines.push(`Lavoro o studio: ${firstRow.profileOccupation}`);
      }
      if (firstRow.profileGoal) {
        lines.push(`Obiettivo: ${firstRow.profileGoal}`);
      }
      if (firstRow.preferenceTone) {
        lines.push(`Tono: ${firstRow.preferenceTone}`);
      }
      if (firstRow.preferenceMode) {
        lines.push(`Modalità: ${firstRow.preferenceMode}`);
      }
      for (const row of rows) {
        if (!row.memoryKey) continue;
        const value = row.memoryValue as CompactMemoryValue | null | undefined;
        if (typeof value?.content === "string" && value.content.trim()) {
          lines.push(
            `Memoria ${row.memoryKey.replace(/_/g, " ")}: ${value.content.trim()}`,
          );
        }
      }

      return lines.join("\n");
    })
    .then((value) => {
      if (getTinyUserSnapshotGeneration(userId) === generation) {
        setTinyUserSnapshotCache(userId, {
          value,
          expiresAt: Date.now() + TINY_USER_SNAPSHOT_CACHE_TTL_MS,
        });
      }
      return value;
    });
  setTinyUserSnapshotInFlight(userId, promise);

  return promise.finally(() => {
    clearTinyUserSnapshotInFlight(userId, promise);
  });
}
