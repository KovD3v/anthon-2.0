import { tool } from "ai";
import { z } from "zod";
import { MEMORY } from "@/lib/ai/constants";
import {
  createMemoryApproval,
  resolveMemoryApproval as resolvePendingMemoryApproval,
} from "@/lib/ai/memory-approval";
import { isExactStableMemoryKey } from "@/lib/ai/memory-target";
import { prisma } from "@/lib/db";

type MemoriesPromptCacheEntry = {
  value: string;
  expiresAt: number;
};

const MEMORIES_PROMPT_CACHE_TTL_MS = 30 * 1000; // 30s
const memoriesPromptCache = new Map<string, MemoriesPromptCacheEntry>();

export function invalidateMemoriesForPromptCache(userId: string) {
  memoriesPromptCache.delete(userId);
}

// Type for memory value stored in JSON
interface MemoryValue {
  content: unknown;
  category: string;
  confidence: number;
  createdAt?: string;
  updatedAt?: string;
}

const memoryCategorySchema = z.enum([
  "identity",
  "sport",
  "goal",
  "preference",
  "health",
  "diagnosis",
  "trauma",
  "intimate",
  "schedule",
  "conversation_topic",
  "other",
]);
const sensitiveMemoryCategories = new Set([
  "health",
  "diagnosis",
  "trauma",
  "intimate",
]);
const broadDeleteTargets = new Set([
  "all",
  "identity",
  "sport",
  "goal",
  "preference",
  "health",
  "diagnosis",
  "trauma",
  "intimate",
  "schedule",
  "conversation_topic",
  "other",
]);
const stableMemoryKeySchema = z
  .string()
  .refine(isExactStableMemoryKey, "Serve una singola chiave stabile esatta");

type CreateMemoryToolsOptions = {
  deleteTargetKey?: string | null;
  sourceInboundMessageId?: string;
  pendingApprovalId?: string;
  currentUserMessageId?: string;
};

/**
 * Creates memory tools with userId context injected via closure.
 * This factory pattern allows passing userId to tool execute functions.
 */
export function createMemoryTools(
  userId: string,
  options?: CreateMemoryToolsOptions,
) {
  const deleteTargetKey = options?.deleteTargetKey ?? null;
  return {
    getMemories: tool({
      description: `Recupera tutte le informazioni salvate sull'utente dalla memoria persistente.
Usa questo tool all'inizio della conversazione per ricordare fatti importanti sull'utente
come nome, sport praticato, obiettivi, preferenze e altre informazioni personali.`,
      inputSchema: z.object({
        category: z
          .enum([
            "all",
            "identity",
            "sport",
            "goal",
            "preference",
            "health",
            "diagnosis",
            "trauma",
            "intimate",
            "schedule",
            "conversation_topic",
            "other",
          ])
          .optional()
          .describe(
            "Filtra per categoria specifica o 'all' per tutte le memorie",
          ),
      }),
      execute: async ({ category }) => {
        try {
          const memories = await prisma.memory.findMany({
            where: {
              userId,
              ...(category && category !== "all" ? { category } : {}),
            },
            orderBy: { createdAt: "desc" },
          });

          if (memories.length === 0) {
            return {
              success: true,
              data: null,
              message: "Nessuna memoria salvata per questo utente.",
            };
          }

          const formattedMemories = memories.map((m) => {
            const value = m.value as unknown as MemoryValue;
            return {
              key: m.key,
              value: value.content,
              category: m.category, // use column, not JSON
              confidence: value.confidence,
            };
          });

          return {
            success: true,
            data: formattedMemories,
            message: `Trovate ${formattedMemories.length} memorie.`,
          };
        } catch (error) {
          console.error("[getMemories] Error:", error);
          return {
            success: false,
            data: null,
            message: "Errore nel recuperare le memorie.",
          };
        }
      },
    }),

    saveMemory: tool({
      description: `Salva o sovrascrive in modo silenzioso un singolo fatto durevole con una chiave stabile esatta.
Puoi inferire con prudenza fatti ordinari a basso rischio solo con confidence sufficiente; non dire mai all'utente che il tool è stato eseguito.
Per salute, diagnosi, trauma, sfera intima o qualunque fatto ad alto impatto, non salvare direttamente: crea una richiesta e chiedi una conferma naturale nella risposta.`,
      inputSchema: z.object({
        key: stableMemoryKeySchema.describe(
          "Chiave univoca in snake_case (es: knee_injury, training_schedule)",
        ),
        value: z.string().describe("Il valore dell'informazione da salvare"),
        category: memoryCategorySchema.describe("Categoria dell'informazione"),
        confidence: z.number().min(0).max(1),
        sensitivity: z
          .enum(["low", "high"])
          .describe(
            "Usa high per informazioni sensibili o ad alto impatto, anche se la categoria sembra generica",
          ),
      }),
      execute: async ({ key, value, category, confidence, sensitivity }) => {
        if (
          confidence < MEMORY.MIN_CONFIDENCE ||
          !isExactStableMemoryKey(key)
        ) {
          return { status: "rejected" as const };
        }

        const requiresApproval =
          sensitivity === "high" || sensitiveMemoryCategories.has(category);
        if (requiresApproval) {
          if (!options?.sourceInboundMessageId) {
            return { status: "rejected" as const };
          }
          try {
            const approval = await createMemoryApproval({
              userId,
              sourceInboundMessageId: options.sourceInboundMessageId,
              key,
              value,
              category,
              confidence,
            });
            return {
              status: "approval_required" as const,
              approvalId: approval.id,
            };
          } catch {
            return { status: "rejected" as const };
          }
        }

        try {
          const timestamp = new Date().toISOString();
          const memory = await prisma.memory.upsert({
            where: { userId_key: { userId, key } },
            update: {
              category,
              value: {
                content: value,
                category,
                confidence,
                updatedAt: timestamp,
              },
            },
            create: {
              userId,
              key,
              category,
              value: {
                content: value,
                category,
                confidence,
                createdAt: timestamp,
              },
            },
            select: { id: true },
          });

          invalidateMemoriesForPromptCache(userId);
          return { status: "saved" as const, memoryId: memory.id };
        } catch {
          return { status: "rejected" as const };
        }
      },
    }),

    requestMemoryApproval: tool({
      description: `Crea in modo silenzioso una richiesta server-side per un singolo fatto sensibile che non può essere salvato direttamente.
Dopo il tool, chiedi una conferma naturale senza citare tool, id o meccanismi interni.`,
      inputSchema: z.object({
        key: stableMemoryKeySchema,
        value: z.string(),
        category: memoryCategorySchema,
        confidence: z.number().min(MEMORY.MIN_CONFIDENCE).max(1),
      }),
      execute: async ({ key, value, category, confidence }) => {
        if (!options?.sourceInboundMessageId) {
          throw new Error("Missing server-owned inbound message context");
        }
        const approval = await createMemoryApproval({
          userId,
          sourceInboundMessageId: options.sourceInboundMessageId,
          key,
          value,
          category,
          confidence,
        });
        return {
          status: "approval_required" as const,
          approvalId: approval.id,
        };
      },
    }),

    resolveMemoryApproval: tool({
      description: `Approva o rifiuta in modo silenzioso solo la richiesta server-side attribuita al turno immediatamente successivo.
Usalo soltanto quando il messaggio corrente conferma o rifiuta esplicitamente il salvataggio: un sì generico o non collegato non è una conferma.`,
      inputSchema: z.object({
        approvalId: z.string(),
        decision: z.enum(["approve", "reject"]),
      }),
      execute: async ({ approvalId, decision }) => {
        if (
          !options?.pendingApprovalId ||
          !options.currentUserMessageId ||
          approvalId !== options.pendingApprovalId
        ) {
          return { status: "stale" as const };
        }
        const result = await resolvePendingMemoryApproval({
          userId,
          approvalId: options.pendingApprovalId,
          decision,
          currentUserMessageId: options.currentUserMessageId,
        });
        if (result.status === "approved") {
          invalidateMemoriesForPromptCache(userId);
        }
        return result;
      },
    }),

    deleteMemory: tool({
      description: `Elimina in modo silenzioso una sola memoria già risolta dal server da una richiesta esplicita di dimenticare.
Non accetta chiavi scelte dal modello, wildcard, categorie o richieste ampie.`,
      inputSchema: z.object({}),
      execute: async () => {
        if (
          !isExactStableMemoryKey(deleteTargetKey) ||
          broadDeleteTargets.has(deleteTargetKey)
        ) {
          return { status: "ambiguous" as const };
        }
        try {
          const deleted = await prisma.memory.deleteMany({
            where: { userId, key: deleteTargetKey },
          });
          if (deleted.count === 0) return { status: "not_found" as const };
          invalidateMemoriesForPromptCache(userId);
          return { status: "deleted" as const };
        } catch {
          return { status: "ambiguous" as const };
        }
      },
    }),
  };
}

/**
 * Utility function to get all memories for a user (not a tool, for internal use).
 */
async function getAllMemories(
  userId: string,
): Promise<Map<string, MemoryValue>> {
  const memories = await prisma.memory.findMany({
    where: { userId },
  });

  const memoryMap = new Map<string, MemoryValue>();
  for (const m of memories) {
    const val = m.value as unknown as MemoryValue;
    // Use the column as source of truth for category
    memoryMap.set(m.key, { ...val, category: m.category });
  }

  return memoryMap;
}

/**
 * Formats memories into a readable string for system prompt injection.
 */
export async function formatMemoriesForPrompt(userId: string): Promise<string> {
  const cached = memoriesPromptCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const memories = await getAllMemories(userId);

  if (memories.size === 0) {
    return "";
  }

  const lines: string[] = ["## Informazioni salvate sull'utente:"];

  // Group by category
  const byCategory = new Map<
    string,
    Array<{ key: string; value: MemoryValue }>
  >();

  for (const [key, value] of memories) {
    const cat = value.category || "other";
    if (!byCategory.has(cat)) {
      byCategory.set(cat, []);
    }
    byCategory.get(cat)?.push({ key, value });
  }

  const categoryLabels: Record<string, string> = {
    identity: "🪪 Identità",
    sport: "🏃 Sport",
    goal: "🎯 Obiettivi",
    preference: "⚙️ Preferenze",
    health: "❤️ Salute",
    diagnosis: "🩺 Diagnosi",
    trauma: "🛡️ Trauma",
    intimate: "🔒 Sfera intima",
    schedule: "📅 Disponibilità",
    conversation_topic: "💬 Temi di conversazione",
    other: "📝 Altro",
  };

  for (const [cat, items] of byCategory) {
    lines.push(`\n### ${categoryLabels[cat] || cat}`);
    for (const item of items) {
      lines.push(`- **${item.key.replace(/_/g, " ")}**: ${item.value.content}`);
    }
  }

  const value = lines.join("\n");
  memoriesPromptCache.set(userId, {
    value,
    expiresAt: Date.now() + MEMORIES_PROMPT_CACHE_TTL_MS,
  });
  return value;
}
