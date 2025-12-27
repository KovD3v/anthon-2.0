import { generateText, Output } from "ai";
import { z } from "zod";
import { maintenanceModel } from "@/lib/ai/providers/openrouter";
import { invalidateMemoriesForPromptCache } from "@/lib/ai/tools/memory";
import { prisma } from "@/lib/db";

// Schema for consolidated memories
const ConsolidatedMemoriesSchema = z.object({
  memories: z.array(
    z.object({
      originalKeys: z
        .array(z.string())
        .describe("List of keys being merged/deleted"),
      newKey: z.string().describe("The unified key to use (snake_case)"),
      newValue: z.string().describe(" The consolidated value"),
      category: z.string(),
      confidence: z.number().min(0).max(1),
      reasoning: z.string().describe("Why these memories were consolidated"),
    }),
  ),
});

/**
 * Consolidates user memories by identifying duplicates, conflicts, or outdated facts.
 */
export async function consolidateMemories(userId: string): Promise<void> {
  // 1. Fetch all memories
  const memories = await prisma.memory.findMany({
    where: { userId },
  });

  if (memories.length < 5) {
    // Too few memories to consolidate
    return;
  }

  // Format for AI
  const memoryList = memories
    .map((m) => {
      const val = m.value as {
        content: string;
        category: string;
        confidence: number;
      };
      return `- [${m.key}] (${val.category}, conf:${val.confidence}): ${val.content}`;
    })
    .join("\n");

  try {
    // 2. Analyze with AI
    const { output } = await generateText({
      model: maintenanceModel,
      output: Output.object({ schema: ConsolidatedMemoriesSchema }),
      system: `Sei un sistema di gestione della memoria a lungo termine.
Il tuo compito è analizzare una lista di fatti (memorie) e consolidarli AGGRESSIVAMENTE.

Regole di consolidamento:
1. UNIRE duplicati (es: "user_sport: tennis" e "sport: tennis" -> diventa "user_sport: tennis").
2. RISOLVERE conflitti (scegli sempre il valore più specifico o recente).
3. RAGGRUPPARE fatti correlati.
4. Rimuovere chiavi ridondanti.
5. Se vedi "user_X" e "X", uniscili in "user_X".

Devi restituire un array di oggetti con 'originalKeys' (da eliminare) e 'newKey'/'newValue' (da creare/aggiornare).
NON aver paura di unire.`,
      prompt: `Analizza e consolida queste memorie:\n\n${memoryList}`,
    });

    const changes = output?.memories || [];

    if (changes.length === 0) {
      console.log(`[Consolidation] No changes needed for user ${userId}`);
      return;
    }

    console.log(
      `[Consolidation] Applying ${changes.length} changes for user ${userId}`,
    );

    // 3. Apply changes via transaction
    await prisma.$transaction(async (tx) => {
      for (const change of changes) {
        // Delete original keys
        await tx.memory.deleteMany({
          where: {
            userId,
            key: { in: change.originalKeys },
          },
        });

        // Create new consolidated memory
        await tx.memory.upsert({
          where: {
            userId_key: { userId, key: change.newKey },
          },
          update: {
            value: {
              content: change.newValue,
              category: change.category,
              confidence: change.confidence,
              consolidatedAt: new Date().toISOString(),
              reasoning: change.reasoning,
            },
          },
          create: {
            userId,
            key: change.newKey,
            value: {
              content: change.newValue,
              category: change.category,
              confidence: change.confidence,
              consolidatedAt: new Date().toISOString(),
              reasoning: change.reasoning,
              createdAt: new Date().toISOString(),
            },
          },
        });
      }
    });

    // Invalidate cache
    invalidateMemoriesForPromptCache(userId);
  } catch (error) {
    console.error("[Consolidation] Error consolidating memories:", error);
  }
}
