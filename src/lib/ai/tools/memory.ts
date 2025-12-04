import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/db";

// Type for memory value stored in JSON
interface MemoryValue {
  content: string;
  category: string;
  confidence: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Creates memory tools with userId context injected via closure.
 * This factory pattern allows passing userId to tool execute functions.
 */
export function createMemoryTools(userId: string) {
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
            "schedule",
            "other",
          ])
          .optional()
          .describe(
            "Filtra per categoria specifica o 'all' per tutte le memorie"
          ),
      }),
      execute: async ({ category }) => {
        const memories = await prisma.memory.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
        });

        if (memories.length === 0) {
          return {
            success: true,
            data: null,
            message: "Nessuna memoria salvata per questo utente.",
          };
        }

        // Filter by category if specified
        const filteredMemories = memories.filter((m) => {
          if (category === "all" || !category) return true;
          const value = m.value as unknown as MemoryValue;
          return value.category === category;
        });

        // Format memories for the agent
        const formattedMemories = filteredMemories.map((m) => {
          const value = m.value as unknown as MemoryValue;
          return {
            key: m.key,
            value: value.content,
            category: value.category,
            confidence: value.confidence,
          };
        });

        return {
          success: true,
          data: formattedMemories,
          message: `Trovate ${formattedMemories.length} memorie.`,
        };
      },
    }),

    saveMemory: tool({
      description: `Salva un'informazione importante sull'utente nella memoria persistente.
Usa questo tool quando l'utente condivide esplicitamente informazioni che dovrebbero essere ricordate
per le conversazioni future, come preferenze, obiettivi o dettagli personali.`,
      inputSchema: z.object({
        key: z
          .string()
          .describe(
            "Chiave univoca per questa informazione in snake_case (es: user_name, primary_goal)"
          ),
        value: z.string().describe("Il valore dell'informazione da salvare"),
        category: z
          .enum([
            "identity",
            "sport",
            "goal",
            "preference",
            "health",
            "schedule",
            "other",
          ])
          .describe("Categoria dell'informazione"),
      }),
      execute: async ({ key, value, category }) => {
        try {
          // Check if memory exists
          const existing = await prisma.memory.findFirst({
            where: { userId, key },
          });

          if (existing) {
            // Update existing memory
            await prisma.memory.update({
              where: { id: existing.id },
              data: {
                value: {
                  content: value,
                  category,
                  confidence: 1.0,
                  updatedAt: new Date().toISOString(),
                },
              },
            });

            return {
              success: true,
              message: `Memoria "${key}" aggiornata con successo.`,
            };
          }

          // Create new memory
          await prisma.memory.create({
            data: {
              userId,
              key,
              value: {
                content: value,
                category,
                confidence: 1.0,
                createdAt: new Date().toISOString(),
              },
            },
          });

          return {
            success: true,
            message: `Memoria "${key}" salvata con successo.`,
          };
        } catch (error) {
          console.error("[saveMemory] Error:", error);
          return {
            success: false,
            message: "Errore nel salvare la memoria.",
          };
        }
      },
    }),

    deleteMemory: tool({
      description: `Elimina un'informazione dalla memoria persistente dell'utente.
Usa questo tool quando l'utente chiede esplicitamente di dimenticare un'informazione
o quando un'informazione non è più valida.`,
      inputSchema: z.object({
        key: z.string().describe("La chiave della memoria da eliminare"),
      }),
      execute: async ({ key }) => {
        try {
          const memory = await prisma.memory.findFirst({
            where: { userId, key },
          });

          if (!memory) {
            return {
              success: false,
              message: `Memoria "${key}" non trovata.`,
            };
          }

          await prisma.memory.delete({
            where: { id: memory.id },
          });

          return {
            success: true,
            message: `Memoria "${key}" eliminata con successo.`,
          };
        } catch (error) {
          console.error("[deleteMemory] Error:", error);
          return {
            success: false,
            message: "Errore nell'eliminare la memoria.",
          };
        }
      },
    }),
  };
}

/**
 * Utility function to get all memories for a user (not a tool, for internal use).
 */
export async function getAllMemories(
  userId: string
): Promise<Map<string, MemoryValue>> {
  const memories = await prisma.memory.findMany({
    where: { userId },
  });

  const memoryMap = new Map<string, MemoryValue>();
  for (const m of memories) {
    memoryMap.set(m.key, m.value as unknown as MemoryValue);
  }

  return memoryMap;
}

/**
 * Formats memories into a readable string for system prompt injection.
 */
export async function formatMemoriesForPrompt(userId: string): Promise<string> {
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
    schedule: "📅 Disponibilità",
    other: "📝 Altro",
  };

  for (const [cat, items] of byCategory) {
    lines.push(`\n### ${categoryLabels[cat] || cat}`);
    for (const item of items) {
      lines.push(`- **${item.key.replace(/_/g, " ")}**: ${item.value.content}`);
    }
  }

  return lines.join("\n");
}
