import { createHash } from "node:crypto";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  forgetFact,
  listActiveFacts,
  rememberFact,
  reviseFact,
} from "@/lib/ai/memory-facts";
import {
  MAINTENANCE_MODEL_ID,
  maintenanceModel,
} from "@/lib/ai/providers/openrouter";
import { getOpenRouterProviderOptionsForModel } from "@/lib/ai/providers/openrouter-routing";
import { invalidateMemoriesForPromptCache } from "@/lib/ai/tools/memory";
import { trackSupportAiUsage } from "@/lib/ai/usage-meter";
import { createLogger } from "@/lib/logger";

const consolidationLogger = createLogger("maintenance");

function consolidationDedupeKey(
  action: "remember" | "revise" | "forget",
  userId: string,
  payload: string,
) {
  const digest = createHash("sha256")
    .update(payload)
    .digest("hex")
    .slice(0, 24);
  return `maintenance:${action}:${userId}:${digest}`;
}

function sensitivityForCategory(category: string) {
  return ["health", "diagnosis", "trauma", "intimate"].includes(category)
    ? ("HIGH" as const)
    : ("LOW" as const);
}

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
  const activeFacts = await listActiveFacts({ userId, limit: 64 });
  if (activeFacts.degraded) return;
  const memories = activeFacts.facts;

  if (memories.length < 5) {
    // Too few memories to consolidate
    return;
  }

  const memoryList = memories
    .map(
      (memory) =>
        `- [${memory.key}] (${memory.category}, conf:${memory.confidence}): ${memory.content}`,
    )
    .join("\n");

  try {
    const result = await generateText({
      model: maintenanceModel,
      output: Output.object({ schema: ConsolidatedMemoriesSchema }),
      providerOptions: {
        openrouter: getOpenRouterProviderOptionsForModel(MAINTENANCE_MODEL_ID),
      },
      instructions: `Sei un sistema di gestione della memoria a lungo termine.
Il tuo compito è analizzare una lista di fatti (memorie) e consolidarli AGGRESSIVAMENTE.

Regole di consolidamento:
1. UNIRE soltanto duplicati reali mantenendo una chiave specifica esistente quando possibile.
2. RISOLVERE conflitti (scegli sempre il valore più specifico o recente).
3. RAGGRUPPARE fatti correlati.
4. Rimuovere chiavi ridondanti.
5. Non creare chiavi generiche di profilo come user_sport, user_goal o user_name.

Devi restituire un array di oggetti con 'originalKeys' (da eliminare) e 'newKey'/'newValue' (da creare/aggiornare).
NON aver paura di unire.`,
      prompt: `Analizza e consolida queste memorie:\n\n${memoryList}`,
    });
    const { output } = result;

    await trackSupportAiUsage({
      userId,
      modelId: MAINTENANCE_MODEL_ID,
      usage: result.usage,
      providerMetadata: result.providerMetadata,
    });

    const changes = output?.memories || [];

    if (changes.length === 0) {
      consolidationLogger.debug("no_changes", "No changes needed", { userId });
      return;
    }

    consolidationLogger.info(
      "applying_changes",
      `Applying ${changes.length} changes`,
      { userId, count: changes.length },
    );

    let changed = false;
    for (const change of changes) {
      const originals = memories.filter((memory) =>
        change.originalKeys.includes(memory.key),
      );
      if (originals.length === 0) continue;

      const payload = `${change.newKey}\0${change.newValue}\0${change.category}`;
      const target = originals.find((memory) => memory.key === change.newKey);
      const mutation = target
        ? await reviseFact({
            userId,
            factId: target.id,
            key: change.newKey,
            value: change.newValue,
            category: change.category,
            confidence: change.confidence,
            sensitivity: sensitivityForCategory(change.category),
            origin: "INFERRED",
            dedupeKey: consolidationDedupeKey(
              "revise",
              userId,
              `${target.id}\0${payload}`,
            ),
          })
        : await rememberFact({
            userId,
            key: change.newKey,
            value: change.newValue,
            category: change.category,
            confidence: change.confidence,
            sensitivity: sensitivityForCategory(change.category),
            origin: "INFERRED",
            dedupeKey: consolidationDedupeKey("remember", userId, payload),
          });
      if (mutation.status !== "saved" && mutation.status !== "duplicate") {
        continue;
      }
      changed = true;

      for (const original of originals) {
        if (original.id === target?.id) continue;
        await forgetFact({
          userId,
          factId: original.id,
          dedupeKey: consolidationDedupeKey(
            "forget",
            userId,
            `${payload}\0${original.id}`,
          ),
        });
      }
    }

    if (changed) invalidateMemoriesForPromptCache(userId);
  } catch (error) {
    consolidationLogger.error(
      "consolidation_failed",
      "Error consolidating memories",
      { userId, error },
    );
  }
}
