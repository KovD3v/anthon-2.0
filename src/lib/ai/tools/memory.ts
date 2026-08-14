import { tool } from "ai";
import { z } from "zod";
import { MEMORY } from "@/lib/ai/constants";
import {
  createMemoryApproval,
  type PendingMemoryApproval,
  resolveMemoryApproval as resolvePendingMemoryApproval,
} from "@/lib/ai/memory-approval";
import {
  findActiveFactIdByKey,
  forgetFact as forgetDurableFact,
  invalidateFactCache,
  recallFacts as recallDurableFacts,
  rememberFact as rememberDurableFact,
  reviseFact as reviseDurableFact,
} from "@/lib/ai/memory-facts";
import {
  isDeletableStableMemoryKey,
  isExactStableMemoryKey,
} from "@/lib/ai/memory-target";
import { prisma } from "@/lib/db";
import type { ServerTraceCollector } from "@/lib/response-profiler/server-trace";

type MemoriesPromptCacheEntry = {
  value: string;
  expiresAt: number;
};

const MEMORIES_PROMPT_CACHE_TTL_MS = 30 * 1000;
const MAX_PROMPT_MEMORIES = 16;
const memoriesPromptCache = new Map<string, MemoriesPromptCacheEntry>();
const memoriesPromptInFlight = new Map<string, Promise<string>>();
const memoriesPromptGenerations = new Map<string, number>();

export function invalidateMemoriesForPromptCache(userId: string) {
  memoriesPromptCache.delete(userId);
  memoriesPromptInFlight.delete(userId);
  memoriesPromptGenerations.set(
    userId,
    (memoriesPromptGenerations.get(userId) ?? 0) + 1,
  );
  invalidateFactCache(userId);
}

interface MemoryValue {
  content: unknown;
  category: string;
  confidence: number;
  createdAt?: string;
  updatedAt?: string;
}

const memoryCategories = [
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
] as const;
const memoryCategorySchema = z.enum(memoryCategories);
const sensitiveMemoryCategories = new Set([
  "health",
  "diagnosis",
  "trauma",
  "intimate",
]);
const sensitiveMemoryPolicy =
  /\b(?:health|medical|medicine|diagnos\w*|condition|disease|illness|injur\w*|pain|allerg\w*|medication|therapy|trauma|abuse|intimat\w*|sexual\w*|pregnan\w*|salute|medic\w*|diagnos\w*|patolog\w*|malatt\w*|infortun\w*|dolor\w*|farmac\w*|terapia|trauma|abus\w*|intim\w*|sessual\w*|gravidanza|asma|depression\w*)\b/i;
const stableMemoryKeySchema = z
  .string()
  .refine(isExactStableMemoryKey, "Serve una singola chiave stabile esatta");

type CreateMemoryToolsOptions = {
  deleteTargetKey?: string | null;
  reviseTarget?: { id: string; key: string } | null;
  sourceInboundMessageId?: string;
  sourceThreadId?: string;
  memoryWriteOrigin?: "EXPLICIT" | "INFERRED";
  pendingMemoryApproval?: PendingMemoryApproval;
  currentUserMessageId?: string;
};

function requiresServerApproval(input: {
  key: string;
  value: string;
  category: string;
  sensitivity: "low" | "high";
}) {
  return (
    input.sensitivity === "high" ||
    sensitiveMemoryCategories.has(input.category) ||
    sensitiveMemoryPolicy.test(
      `${input.key.replaceAll("_", " ")} ${input.value}`,
    )
  );
}

export function createMemoryTools(
  userId: string,
  options?: CreateMemoryToolsOptions,
) {
  const recallFacts = tool({
    description: `Recupera fatti durevoli pertinenti dalla memoria persistente dell'utente.
Usa una query concreta e una categoria opzionale. I risultati sono già limitati,
validi e ordinati dal server; non chiedere tutte le memorie se bastano pochi fatti.`,
    inputSchema: z.object({
      query: z.string().trim().max(500).optional(),
      category: z.enum(["all", ...memoryCategories]).optional(),
    }),
    execute: async ({ query, category }) => {
      const result = await recallDurableFacts({
        userId,
        query: query?.trim() || (category === "all" ? "" : category) || "",
        categories: category && category !== "all" ? [category] : undefined,
        limit: 8,
      });
      if (result.degraded) {
        return {
          success: false,
          data: null,
          message: "Errore nel recuperare le memorie.",
        };
      }
      if (result.facts.length === 0) {
        return {
          success: true,
          data: null,
          message: "Nessuna memoria salvata per questo utente.",
        };
      }
      return {
        success: true,
        data: result.facts.map((fact) => ({
          key: fact.key,
          value: fact.content,
          category: fact.category,
          confidence: fact.confidence,
        })),
        message: `Trovate ${result.facts.length} memorie pertinenti.`,
      };
    },
  });

  const rememberFact = tool({
    description: `Salva o sovrascrive in modo silenzioso un singolo fatto durevole.
Puoi inferire con prudenza fatti ordinari a basso rischio; non dire mai all'utente
che il tool è stato eseguito. Per fatti sensibili chiedi una conferma naturale.`,
    inputSchema: z.object({
      key: stableMemoryKeySchema,
      value: z.string().trim().min(1).max(1000),
      category: memoryCategorySchema,
      confidence: z.number().min(0).max(1),
      sensitivity: z.enum(["low", "high"]),
    }),
    execute: async ({ key, value, category, confidence, sensitivity }) => {
      if (
        confidence < MEMORY.MIN_CONFIDENCE ||
        !options?.sourceInboundMessageId
      ) {
        return { status: "rejected" as const };
      }
      if (requiresServerApproval({ key, value, category, sensitivity })) {
        try {
          await createMemoryApproval({
            userId,
            sourceInboundMessageId: options.sourceInboundMessageId,
            key,
            value,
            category,
            confidence,
          });
          return { status: "approval_required" as const };
        } catch {
          return { status: "rejected" as const };
        }
      }

      const result = await rememberDurableFact({
        userId,
        key,
        value,
        category,
        confidence,
        sensitivity: sensitivity === "high" ? "HIGH" : "LOW",
        origin: options.memoryWriteOrigin ?? "INFERRED",
        sourceMessageId: options.sourceInboundMessageId,
        sourceThreadId: options.sourceThreadId,
        dedupeKey: `tool:${options.sourceInboundMessageId}:${key}`,
      });
      return result.status === "saved" || result.status === "duplicate"
        ? { status: "saved" as const, memoryId: result.factId }
        : { status: "rejected" as const };
    },
  });

  const reviseFact = tool({
    description: `Aggiorna in modo silenzioso un solo fatto esatto già risolto dal server.
Non scegliere autonomamente l'identità del fatto e non usare questo tool per
modifiche ampie o ambigue.`,
    inputSchema: z.object({
      value: z.string().trim().min(1).max(1000),
      category: memoryCategorySchema,
      confidence: z.number().min(0).max(1),
      sensitivity: z.enum(["low", "high"]),
    }),
    execute: async ({ value, category, confidence, sensitivity }) => {
      if (
        !options?.reviseTarget ||
        !options.sourceInboundMessageId ||
        confidence < MEMORY.MIN_CONFIDENCE
      ) {
        return { status: "not_found" as const };
      }
      if (
        requiresServerApproval({
          key: options.reviseTarget.key,
          value,
          category,
          sensitivity,
        })
      ) {
        await createMemoryApproval({
          userId,
          sourceInboundMessageId: options.sourceInboundMessageId,
          key: options.reviseTarget.key,
          value,
          category,
          confidence,
        });
        return { status: "approval_required" as const };
      }
      const result = await reviseDurableFact({
        userId,
        factId: options.reviseTarget.id,
        key: options.reviseTarget.key,
        value,
        category,
        confidence,
        sensitivity: sensitivity === "high" ? "HIGH" : "LOW",
        origin: options.memoryWriteOrigin ?? "EXPLICIT",
        sourceMessageId: options.sourceInboundMessageId,
        sourceThreadId: options.sourceThreadId,
        dedupeKey: `tool:${options.sourceInboundMessageId}:revise:${options.reviseTarget.id}`,
      });
      return result.status === "saved" || result.status === "duplicate"
        ? { status: "saved" as const, memoryId: result.factId }
        : { status: result.status };
    },
  });

  const requestMemoryApproval = tool({
    description: `Crea in modo silenzioso una richiesta server-side per un singolo fatto sensibile.
Dopo il tool, chiedi una conferma naturale senza citare tool, id o meccanismi interni.`,
    inputSchema: z.object({
      key: stableMemoryKeySchema,
      value: z.string().trim().min(1).max(1000),
      category: memoryCategorySchema,
      confidence: z.number().min(MEMORY.MIN_CONFIDENCE).max(1),
    }),
    execute: async ({ key, value, category, confidence }) => {
      if (!options?.sourceInboundMessageId) {
        throw new Error("Missing server-owned inbound message context");
      }
      await createMemoryApproval({
        userId,
        sourceInboundMessageId: options.sourceInboundMessageId,
        key,
        value,
        category,
        confidence,
      });
      return { status: "approval_required" as const };
    },
  });

  const resolveMemoryApproval = tool({
    description: `Approva o rifiuta in modo silenzioso solo la richiesta attribuita.
Usalo soltanto quando il messaggio conferma o rifiuta esplicitamente il salvataggio:
un sì generico o non collegato non è una conferma del turno immediatamente successivo.`,
    inputSchema: z.object({ decision: z.enum(["approve", "reject"]) }),
    execute: async ({ decision }) => {
      const pendingApproval = options?.pendingMemoryApproval;
      if (
        !pendingApproval ||
        pendingApproval.userId !== userId ||
        !options.currentUserMessageId ||
        !isExactStableMemoryKey(pendingApproval.key)
      ) {
        return { status: "stale" as const };
      }
      const result = await resolvePendingMemoryApproval({
        userId,
        approvalId: pendingApproval.id,
        decision,
        currentUserMessageId: options.currentUserMessageId,
      });
      if (result.status === "approved") {
        invalidateMemoriesForPromptCache(userId);
      }
      return { status: result.status };
    },
  });

  const forgetFact = tool({
    description: `Elimina in modo silenzioso una sola memoria già risolta dal server
da una richiesta esplicita. Non accetta chiavi scelte dal modello, wildcard o categorie.`,
    inputSchema: z.object({}),
    execute: async () => {
      const key = options?.deleteTargetKey ?? null;
      if (
        !isDeletableStableMemoryKey(key) ||
        !options?.sourceInboundMessageId
      ) {
        return { status: "ambiguous" as const };
      }
      const factId = await findActiveFactIdByKey(userId, key);
      if (!factId) return { status: "not_found" as const };
      const result = await forgetDurableFact({
        userId,
        factId,
        sourceMessageId: options.sourceInboundMessageId,
        dedupeKey: `tool:${options.sourceInboundMessageId}:forget:${factId}`,
      });
      if (result.status === "forgotten" || result.status === "duplicate") {
        invalidateMemoriesForPromptCache(userId);
        return { status: "deleted" as const };
      }
      return { status: result.status };
    },
  });

  return {
    recallFacts,
    rememberFact,
    reviseFact,
    forgetFact,
    requestMemoryApproval,
    resolveMemoryApproval,
    getMemories: recallFacts,
    saveMemory: rememberFact,
    deleteMemory: forgetFact,
  };
}

async function getAllMemories(
  userId: string,
): Promise<Map<string, MemoryValue>> {
  const memories = await prisma.memory.findMany({
    where: {
      userId,
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_PROMPT_MEMORIES,
    select: {
      key: true,
      value: true,
      category: true,
    },
  });

  const memoryMap = new Map<string, MemoryValue>();
  for (const memory of memories) {
    const value = memory.value as unknown as MemoryValue;
    memoryMap.set(memory.key, { ...value, category: memory.category });
  }
  return memoryMap;
}

function formatMemoryMap(memories: Map<string, MemoryValue>): string {
  if (memories.size === 0) return "";

  const lines: string[] = ["## Informazioni salvate sull'utente:"];
  const byCategory = new Map<
    string,
    Array<{ key: string; value: MemoryValue }>
  >();
  for (const [key, value] of memories) {
    const category = value.category || "other";
    const items = byCategory.get(category) ?? [];
    items.push({ key, value });
    byCategory.set(category, items);
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
  for (const [category, items] of byCategory) {
    lines.push(`\n### ${categoryLabels[category] || category}`);
    for (const item of items) {
      lines.push(`- **${item.key.replace(/_/g, " ")}**: ${item.value.content}`);
    }
  }

  return lines.join("\n");
}

type FormatMemoriesForPromptOptions = {
  traceCollector?: ServerTraceCollector;
};

async function loadAndFormatMemories(
  userId: string,
  traceCollector?: ServerTraceCollector,
): Promise<string> {
  const memories = traceCollector
    ? await traceCollector.measure("memory_query", () => getAllMemories(userId))
    : await getAllMemories(userId);

  if (traceCollector) {
    return traceCollector.measure("memory_format", async () =>
      formatMemoryMap(memories),
    );
  }

  return formatMemoryMap(memories);
}

export async function formatMemoriesForPrompt(
  userId: string,
  options?: FormatMemoriesForPromptOptions,
): Promise<string> {
  const cached = memoriesPromptCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const existing = memoriesPromptInFlight.get(userId);
  if (existing) return existing;

  const generation = memoriesPromptGenerations.get(userId) ?? 0;
  const promise = loadAndFormatMemories(userId, options?.traceCollector).then(
    (value) => {
      if ((memoriesPromptGenerations.get(userId) ?? 0) === generation) {
        memoriesPromptCache.set(userId, {
          value,
          expiresAt: Date.now() + MEMORIES_PROMPT_CACHE_TTL_MS,
        });
      }
      return value;
    },
  );
  memoriesPromptInFlight.set(userId, promise);

  return promise.finally(() => {
    if (memoriesPromptInFlight.get(userId) === promise) {
      memoriesPromptInFlight.delete(userId);
    }
  });
}
