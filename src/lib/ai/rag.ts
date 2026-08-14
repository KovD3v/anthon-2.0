/**
 * RAG (Retrieval Augmented Generation) system for document search.
 * Uses pgvector on Neon for semantic search on embedded document chunks.
 * Uses OpenAI text-embedding-3-small via OpenRouter for embeddings.
 */

import { generateText, Output } from "ai";
import { z } from "zod";
import { RAG, RAG_KEYWORDS, RAG_NEGATIVE_KEYWORDS } from "@/lib/ai/constants";
import { generateEmbedding, generateEmbeddings } from "@/lib/ai/embeddings";
import { openrouter } from "@/lib/ai/providers/openrouter";
import { getOpenRouterProviderOptionsForClassifier } from "@/lib/ai/providers/openrouter-routing";
import { DEFAULT_TURN_CLASSIFIER_MODEL_ID } from "@/lib/ai/turn-classification";
import { scheduleSupportAiUsage } from "@/lib/ai/usage-meter";
import { prisma } from "@/lib/db";
import { LatencyLogger } from "@/lib/latency-logger";
import { createLogger } from "@/lib/logger";
import { isDeveloperDiagnosticsEnabled } from "@/lib/response-profiler/developer-diagnostics";
import type { ServerTraceCollector } from "@/lib/response-profiler/server-trace";

const ragLogger = createLogger("ai");

/**
 * Search for relevant document chunks based on a query.
 * Uses cosine similarity for semantic search with pgvector.
 */
export interface RagSearchResult {
  chunkId?: string;
  documentId?: string;
  documentTitle?: string;
  content: string;
  title: string;
  similarity: number;
}

type RagSearchOutcome = {
  results: RagSearchResult[];
  failed: boolean;
  error?: unknown;
};

async function searchDocumentsWithOutcome(
  query: string,
  limit: number = 5,
  traceCollector?: ServerTraceCollector,
): Promise<RagSearchOutcome> {
  try {
    // Generate embedding for the query
    const queryEmbedding = traceCollector
      ? await traceCollector.measure("rag_embedding", () =>
          generateEmbedding(query),
        )
      : await generateEmbedding(query);

    if (!queryEmbedding) {
      ragLogger.warn(
        "ai.rag.search.no_embedding",
        "Could not generate query embedding",
      );
      return { results: [], failed: true };
    }

    // Convert embedding array to pgvector format string
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    // Search using pgvector cosine similarity (<=> operator)
    // Lower distance = more similar, so we use 1 - distance for similarity score
    const searchSpan = traceCollector?.startSpan("rag_search");
    let results: RagSearchResult[];
    try {
      results = await LatencyLogger.measure("RAG: Vector search query", () =>
        prisma.$queryRawUnsafe<RagSearchResult[]>(
          `
      SELECT 
        rc.id AS "chunkId",
        rc."documentId" AS "documentId",
        rd.title AS "documentTitle",
        rc.content,
        rd.title,
        1 - (rc.embedding <=> $1::vector) as similarity
      FROM "RagChunk" rc
      JOIN "RagDocument" rd ON rc."documentId" = rd.id
      WHERE rc.embedding IS NOT NULL
      ORDER BY rc.embedding <=> $1::vector
      LIMIT $2
      `,
          embeddingStr,
          limit,
        ),
      );
    } catch (error) {
      searchSpan?.end("failed");
      throw error;
    }

    // Filter by similarity threshold
    const filteredResults = results.filter(
      (result) => result.similarity > RAG.SIMILARITY_THRESHOLD,
    );
    searchSpan?.end("completed", {
      ragChunkCount: filteredResults.length,
    });
    return {
      results: filteredResults,
      failed: false,
    };
  } catch (error) {
    ragLogger.error("ai.rag.search.error", "Search error", { error });
    return { results: [], failed: true, error };
  }
}

export async function searchDocuments(
  query: string,
  limit: number = 5,
  traceCollector?: ServerTraceCollector,
): Promise<RagSearchResult[]> {
  return (await searchDocumentsWithOutcome(query, limit, traceCollector))
    .results;
}

export interface RagContext {
  text: string;
  chunkCount: number;
  failed?: boolean;
  diagnostics?: {
    query: string;
    chunks: RagSearchResult[];
    failed: boolean;
    error?: unknown;
  };
}

/**
 * Format RAG results into a context string for the system prompt.
 */
function formatRagContext(results: RagSearchResult[]): string {
  if (results.length === 0) {
    return "Nessun documento rilevante trovato.";
  }

  const lines: string[] = ["### Documenti rilevanti:"];

  for (const result of results) {
    lines.push(
      `\n**${result.title}** (rilevanza: ${Math.round(
        result.similarity * 100,
      )}%)`,
    );
    lines.push(result.content);
  }

  return lines.join("\n");
}

/**
 * Search and format RAG context for a user query.
 * This is the main function to use in the orchestrator.
 */
export async function getRagContext(
  query: string,
  traceCollector?: ServerTraceCollector,
): Promise<RagContext> {
  const outcome = await searchDocumentsWithOutcome(
    query,
    undefined,
    traceCollector,
  );
  return {
    ...buildRagContext(outcome.results),
    failed: outcome.failed,
    ...(isDeveloperDiagnosticsEnabled()
      ? {
          diagnostics: {
            query,
            chunks: outcome.results,
            failed: outcome.failed,
            ...(outcome.error !== undefined ? { error: outcome.error } : {}),
          },
        }
      : {}),
  };
}

export function buildRagContext(results: RagSearchResult[]): RagContext {
  return {
    text: formatRagContext(results),
    chunkCount: results.length,
  };
}

/**
 * Add a document to the RAG system.
 * Splits the document into chunks and generates embeddings.
 */
export async function addDocument(
  title: string,
  content: string,
  source?: string,
  url?: string,
): Promise<string> {
  try {
    // Create the document
    const document = await prisma.ragDocument.create({
      data: {
        title,
        source: source || "user-upload",
        url,
      },
    });

    // Split content into chunks
    const chunks = splitIntoChunks(content);

    // Generate embeddings for all chunks in batch
    const embeddings = await generateEmbeddings(chunks);

    // Create chunks with embeddings using raw SQL (Prisma can't handle vector type directly).
    // Batched into a single multi-row INSERT to avoid one round-trip per chunk.
    const valueClauses: string[] = [];
    const params: unknown[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const embedding = embeddings[i];

      if (!embedding) {
        ragLogger.warn(
          "ai.rag.index.chunk_failed",
          `Skipping chunk ${i} - embedding generation failed`,
          { chunkIndex: i },
        );
        continue;
      }

      const base = params.length;
      valueClauses.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::vector, NOW())`,
      );
      params.push(
        `chunk_${document.id}_${i}`,
        document.id,
        chunks[i],
        i,
        `[${embedding.join(",")}]`,
      );
    }

    if (valueClauses.length > 0) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "RagChunk" (id, "documentId", content, index, embedding, "createdAt")
         VALUES ${valueClauses.join(", ")}`,
        ...params,
      );
    }

    return document.id;
  } catch (error) {
    ragLogger.error("ai.rag.index.add_failed", "Error adding document", {
      error,
    });
    throw error;
  }
}

/**
 * Update embeddings for existing chunks that don't have them.
 * Useful for migrating existing data.
 */
export async function updateMissingEmbeddings(): Promise<number> {
  try {
    // Find chunks without embeddings using raw SQL
    const chunks = await prisma.$queryRaw<
      Array<{ id: string; content: string }>
    >`
      SELECT id, content FROM "RagChunk" WHERE embedding IS NULL
    `;

    if (chunks.length === 0) {
      return 0;
    }

    // Generate embeddings in batches
    const batchSize = RAG.BATCH_SIZE;
    let updated = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const contents = batch.map((c) => c.content);
      const embeddings = await generateEmbeddings(contents);

      for (let j = 0; j < batch.length; j++) {
        const embedding = embeddings[j];
        if (embedding) {
          const embeddingStr = `[${embedding.join(",")}]`;
          await prisma.$executeRawUnsafe(
            `UPDATE "RagChunk" SET embedding = $1::vector WHERE id = $2`,
            embeddingStr,
            batch[j].id,
          );
          updated++;
        }
      }
    }

    return updated;
  } catch (error) {
    ragLogger.error("ai.rag.index.update_failed", "Error updating embeddings", {
      error,
    });
    throw error;
  }
}

/**
 * Delete a document and all its chunks.
 */
export async function deleteDocument(documentId: string): Promise<void> {
  try {
    // Delete chunks first (foreign key constraint), atomically with the document
    // so a partial failure never leaves an empty document behind.
    await prisma.$transaction([
      prisma.ragChunk.deleteMany({
        where: { documentId },
      }),
      prisma.ragDocument.delete({
        where: { id: documentId },
      }),
    ]);
  } catch (error) {
    ragLogger.error("ai.rag.index.delete_failed", "Error deleting document", {
      error,
    });
    throw error;
  }
}

/**
 * List all documents in the RAG system.
 */
export async function listDocuments(): Promise<
  Array<{
    id: string;
    title: string;
    source: string | null;
    chunkCount: number;
    createdAt: Date;
  }>
> {
  const documents = await prisma.ragDocument.findMany({
    include: {
      _count: {
        select: { chunks: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return documents.map((doc) => ({
    id: doc.id,
    title: doc.title,
    source: doc.source,
    chunkCount: doc._count.chunks,
    createdAt: doc.createdAt,
  }));
}

/**
 * Split a document into chunks for embedding.
 * Uses a paragraph-based approach with overlap for context continuity.
 */
function splitIntoChunks(
  content: string,
  maxChunkSize: number = 800,
  overlap: number = 100,
): string[] {
  const chunks: string[] = [];
  const paragraphs = content.split(/\n\n+/);

  let currentChunk = "";

  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed max size
    if (
      currentChunk.length + paragraph.length > maxChunkSize &&
      currentChunk.trim()
    ) {
      chunks.push(currentChunk.trim());

      // Keep overlap from the end of the current chunk
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-Math.floor(overlap / 5)); // Approximate word count for overlap
      currentChunk = `${overlapWords.join(" ")}\n\n${paragraph}`;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    }
  }

  // Add the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Cache for document count to avoid repeated queries
 */
let documentCountCache: { count: number; timestamp: number } | null = null;
const DOCUMENT_COUNT_CACHE_TTL = 60000; // 1 minute

/**
 * Patterns that indicate RAG is NOT needed
 */
function matchesNonTechnicalPattern(message: string): boolean {
  const lower = message.toLowerCase().trim();

  // Very short messages (under 10 chars)
  if (lower.length < 10) {
    return true;
  }

  // Single word responses
  if (!lower.includes(" ") && lower.length < 15) {
    return true;
  }

  const greetingPattern = /^(ciao|salve|buongiorno|buonasera|hello|hi|hey)\b/i;
  const briefReplyPattern =
    /(risposta|answer|reply).{0,24}(breve|brevissima|short|brief)|\b(brevemente|briefly)\b/i;
  if (greetingPattern.test(lower) && briefReplyPattern.test(lower)) {
    return true;
  }

  // Questions about the user's own data/profile
  if (
    lower.includes("mio profilo") ||
    lower.includes("my profile") ||
    lower.includes("i miei dati") ||
    lower.includes("my data")
  ) {
    return true;
  }

  // Requests for motivation/encouragement (generic, not technical)
  const motivationalPatterns = [
    /dammi.*motivazione/i,
    /ho bisogno.*motivazione/i,
    /give me.*motivation/i,
    /need.*motivation/i,
    /incoraggia/i,
    /encourage/i,
  ];
  if (motivationalPatterns.some((pattern) => pattern.test(message))) {
    return true;
  }

  // Questions about feelings/emotions (unless technical like "mental coaching")
  if (
    (lower.includes("come mi sento") ||
      lower.includes("how do i feel") ||
      lower.includes("sono nervoso") ||
      lower.includes("i'm nervous")) &&
    !lower.includes("mental") &&
    !lower.includes("psicologi")
  ) {
    return true;
  }

  // Clarification questions
  if (
    lower.startsWith("quindi ") ||
    lower.startsWith("cioè ") ||
    lower.startsWith("so ") ||
    lower.startsWith("intendi ")
  ) {
    return true;
  }

  return false;
}

function matchesLiveWebSearchIntent(message: string): boolean {
  return /\b(usa internet|cerca (online|su internet|nel web)|accesso (a )?internet|web|notizia|notizie|news|latest|current|live|recente|recenti|ultimo|ultimi|ultima|ultime|risultato|risultati|classifica|classifiche|meteo|previsioni|schedule|calendario|fixture|202[0-9])\b/i.test(
    message,
  );
}

function matchesBriefGenericCoachingAdvice(message: string): boolean {
  const lower = message.toLowerCase().trim();
  const asksForAdvice =
    /\b(consiglio|consigli|tip|suggerimento|suggerimenti|advice)\b/i.test(
      lower,
    );
  const asksForMotivation =
    /\b(motivami|motivazione|motivazionale|caricami|spronami|incoraggiami|incoraggia|encourage|motivate)\b/i.test(
      lower,
    );
  const asksForBriefReply =
    /\b(risposta|rispondi|answer|reply)\b.{0,32}\b(breve|brevissima|massimo|max|short|brief)\b|\b(brevemente|in poche parole)\b/i.test(
      lower,
    );
  const asksForDocuments =
    /\b(documenti?|rag|metodologia|metodo|manuale|fonte|fonti|knowledge base|secondo i documenti)\b/i.test(
      lower,
    );

  return (
    (asksForAdvice || asksForMotivation) &&
    asksForBriefReply &&
    !asksForDocuments
  );
}

/**
 * Check if RAG documents exist (with caching)
 */
async function hasRagDocuments(): Promise<boolean> {
  // Check cache first
  if (
    documentCountCache &&
    Date.now() - documentCountCache.timestamp < DOCUMENT_COUNT_CACHE_TTL
  ) {
    return documentCountCache.count > 0;
  }

  // Query database
  const count = await LatencyLogger.measure("RAG: Count documents", () =>
    prisma.ragDocument.count(),
  );

  // Update cache
  documentCountCache = { count, timestamp: Date.now() };

  return count > 0;
}

/**
 * Fast classifier model for RAG detection
 * Reuses the bounded structured-output classifier route.
 */
const RAG_CLASSIFIER_MODEL_ID = DEFAULT_TURN_CLASSIFIER_MODEL_ID;
const RAG_CLASSIFIER_TIMEOUT_MS = 3_000;
const ragClassifierModel = openrouter(RAG_CLASSIFIER_MODEL_ID);

/**
 * Short-lived cache for LLM classification results.
 * Helps when users resend/iterate the same message or when the frontend retries.
 */
type RagClassificationCacheEntry = {
  needsRag: boolean;
  expiresAt: number;
};

const RAG_CLASSIFICATION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RAG_CLASSIFICATION_CACHE_MAX_ENTRIES = 500;
const ragClassificationCache = new Map<string, RagClassificationCacheEntry>();

function normalizeClassificationKey(userMessage: string): string {
  return userMessage.toLowerCase().trim().replaceAll(/\s+/g, " ");
}

const AMBIGUOUS_MENTAL_RAG_KEYWORDS = new Set([
  "ansia",
  "concentrazione",
  "motivazione",
  "mentalità",
  "pressione",
  "performance",
]);
const SPORTS_CONTEXT_PATTERN =
  /\b(?:partita|partite|gara|gare|campo|campionato|mister|coach|allen\w*|gol|palla|pallone|rigore|squadra|calcio|calciatore|sport|prestazione|titolare)\b/iu;
const SPORTS_MENTAL_NEED_PATTERN =
  /\b(?:ansia|ansios|nervos|pression|tension|paur|vomit|lucid|concentr|sbagli|error|giudiz|insicur|fiduc|blocc|agit)/iu;

function matchesSportsContext(message: string): boolean {
  return SPORTS_CONTEXT_PATTERN.test(message);
}

function matchesSpecificSportsMentalNeed(message: string): boolean {
  return (
    matchesSportsContext(message) && SPORTS_MENTAL_NEED_PATTERN.test(message)
  );
}

function hasDirectRagKeyword(message: string): boolean {
  const lower = message.toLowerCase();
  const hasSportsContext = matchesSportsContext(message);

  return RAG_KEYWORDS.some((keyword) => {
    if (!lower.includes(keyword)) return false;
    return !AMBIGUOUS_MENTAL_RAG_KEYWORDS.has(keyword) || hasSportsContext;
  });
}

/**
 * Determine if a user query needs RAG context.
 * Uses multi-layer optimization to minimize expensive LLM calls.
 *
 * Optimization layers (in order):
 * 1. Document existence check (cached)
 * 2. Direct and context-gated keyword matching (instant) - FIRST to catch
 *    technical queries with greetings without treating ambiguous mental terms
 *    as sports requests
 * 3. Negative keyword matching (instant) - only for short messages < 30 chars
 * 4. Non-technical pattern matching (instant)
 * 5. Bounded LLM classification (only as last resort)
 */
export async function shouldUseRag(
  userMessage: string,
  options?: {
    userId?: string;
    waitUntil?: (promise: Promise<unknown>) => void;
  },
): Promise<boolean> {
  const lower = userMessage.toLowerCase();
  const messageLength = userMessage.trim().length;
  const hasPositiveKeyword =
    hasDirectRagKeyword(userMessage) ||
    matchesSpecificSportsMentalNeed(userMessage);

  // OPTIMIZATION 1: Fast local rejects before any database work, unless a
  // positive RAG keyword is present.
  if (!hasPositiveKeyword) {
    if (matchesLiveWebSearchIntent(userMessage)) {
      return false;
    }

    if (matchesBriefGenericCoachingAdvice(userMessage)) {
      return false;
    }

    // "ciao" alone = skip, but "ciao, mi dai un allenamento" = don't skip
    // because "allenamento" is a positive keyword.
    if (
      messageLength < 30 &&
      RAG_NEGATIVE_KEYWORDS.some((kw) => lower.includes(kw))
    ) {
      return false;
    }

    if (matchesNonTechnicalPattern(userMessage)) {
      return false;
    }
  } else if (matchesBriefGenericCoachingAdvice(userMessage)) {
    return false;
  }

  // OPTIMIZATION 2: Skip if no documents exist (saves LLM classification)
  const hasDocuments = await hasRagDocuments();
  if (!hasDocuments) {
    return false;
  }

  // OPTIMIZATION 3: Check POSITIVE keywords - these always trigger RAG
  // This ensures "ciao, dimmi come fare allenamento" still uses RAG
  if (hasPositiveKeyword) {
    return true;
  }

  // OPTIMIZATION 4: Bounded LLM classification (only for uncertain cases)
  try {
    const cacheKey = normalizeClassificationKey(userMessage);
    const cached = ragClassificationCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.needsRag;
    }

    const result = await LatencyLogger.measure(
      "RAG: Classify query (LLM)",
      () =>
        generateText({
          model: ragClassifierModel,
          temperature: 0,
          maxOutputTokens: 120,
          timeout: { totalMs: RAG_CLASSIFIER_TIMEOUT_MS },
          providerOptions: {
            openrouter: getOpenRouterProviderOptionsForClassifier(
              RAG_CLASSIFIER_MODEL_ID,
            ),
          },
          output: Output.object({
            schema: z.object({
              needsRag: z
                .boolean()
                .describe("Whether the query needs RAG context"),
              reason: z.string().describe("Brief reason for the decision"),
            }),
          }),
          instructions: `You are a query classifier. Determine if a user's question requires information from methodological documents about sports coaching.

Answer needsRag: true if the question is about:
- Specific training techniques
- Coaching methodologies
- Mental coaching principles
- Training exercises or programs
- Sports theory
- "How to" questions about training/performance

Answer needsRag: false if the question is:
- Personal conversation
- Questions about user profile/data
- Greetings or small talk
- Generic motivation requests
- Information already in profile/memories`,
          prompt: `User query: "${userMessage}"`,
        }),
    );
    const { output } = result;

    if (options?.userId) {
      scheduleSupportAiUsage(
        {
          userId: options.userId,
          modelId: RAG_CLASSIFIER_MODEL_ID,
          usage: result.usage,
          providerMetadata: result.providerMetadata,
        },
        options.waitUntil,
      );
    }

    if (ragClassificationCache.size >= RAG_CLASSIFICATION_CACHE_MAX_ENTRIES) {
      const firstKey = ragClassificationCache.keys().next().value;
      if (firstKey !== undefined) ragClassificationCache.delete(firstKey);
    }
    ragClassificationCache.set(cacheKey, {
      needsRag: output?.needsRag ?? false,
      expiresAt: Date.now() + RAG_CLASSIFICATION_CACHE_TTL_MS,
    });

    return output?.needsRag ?? false;
  } catch (error) {
    ragLogger.error("ai.rag.classify.error", "Error classifying query", {
      error,
    });
    return false;
  }
}
