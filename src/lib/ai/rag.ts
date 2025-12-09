/**
 * RAG (Retrieval Augmented Generation) system for document search.
 * Uses pgvector on Neon for semantic search on embedded document chunks.
 * Uses OpenAI text-embedding-3-small via OpenRouter for embeddings.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { RAG, RAG_KEYWORDS } from "@/lib/ai/constants";
import { subAgentModel } from "@/lib/ai/providers/openrouter";
import { prisma } from "@/lib/db";

// Embedding dimensions for OpenAI text-embedding-3-small
// The model outputs 1536-dimensional embeddings
const EMBEDDING_DIMENSIONS = 1536;

// OpenRouter API endpoint for embeddings
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/embeddings";
const EMBEDDING_MODEL = "openai/text-embedding-3-small";

/**
 * Sleep helper for retry backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with retry and exponential backoff.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = RAG.MAX_RETRIES,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Success or client error (4xx) - don't retry
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      // Server error (5xx) - retry
      lastError = new Error(`Server error: ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    // Don't sleep after the last attempt
    if (attempt < maxRetries - 1) {
      const delay = RAG.RETRY_BASE_DELAY_MS * 2 ** attempt;
      console.warn(`[RAG] Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
      await sleep(delay);
    }
  }

  throw lastError ?? new Error("Max retries exceeded");
}

/**
 * Generate embeddings using OpenAI text-embedding-3-small via OpenRouter.
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      console.error("[RAG] OPENROUTER_API_KEY not configured");
      return null;
    }

    const response = await fetchWithRetry(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer":
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "Anthon Coach",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[RAG] OpenRouter embedding error:", error);
      return null;
    }

    const data = await response.json();

    if (data.data?.[0]?.embedding) {
      return data.data[0].embedding;
    }

    console.error("[RAG] Unexpected embedding response format:", data);
    return null;
  } catch (error) {
    console.error("[RAG] Embedding generation error:", error);
    return null;
  }
}

/**
 * Generate embeddings for multiple texts in batch.
 */
async function generateEmbeddings(
  texts: string[],
): Promise<(number[] | null)[]> {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      console.error("[RAG] OPENROUTER_API_KEY not configured");
      return texts.map(() => null);
    }

    const response = await fetchWithRetry(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer":
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "Anthon Coach",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[RAG] OpenRouter batch embedding error:", error);
      return texts.map(() => null);
    }

    const data = await response.json();

    if (data.data && Array.isArray(data.data)) {
      // Sort by index to maintain order
      const sorted = data.data.sort(
        (a: { index: number }, b: { index: number }) => a.index - b.index,
      );
      return sorted.map(
        (item: { embedding: number[] }) => item.embedding || null,
      );
    }

    console.error("[RAG] Unexpected batch embedding response format:", data);
    return texts.map(() => null);
  } catch (error) {
    console.error("[RAG] Batch embedding generation error:", error);
    return texts.map(() => null);
  }
}

/**
 * Search for relevant document chunks based on a query.
 * Uses cosine similarity for semantic search with pgvector.
 */
export async function searchDocuments(
  query: string,
  limit: number = 5,
): Promise<Array<{ content: string; title: string; similarity: number }>> {
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    if (!queryEmbedding) {
      console.warn("[RAG] Could not generate query embedding");
      return [];
    }

    // Convert embedding array to pgvector format string
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    // Search using pgvector cosine similarity (<=> operator)
    // Lower distance = more similar, so we use 1 - distance for similarity score
    const results = await prisma.$queryRawUnsafe<
      Array<{
        content: string;
        title: string;
        similarity: number;
      }>
    >(
      `
      SELECT 
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
    );

    // Filter by similarity threshold
    return results.filter((r) => r.similarity > RAG.SIMILARITY_THRESHOLD);
  } catch (error) {
    console.error("[RAG] Search error:", error);
    return [];
  }
}

/**
 * Format RAG results into a context string for the system prompt.
 */
export function formatRagContext(
  results: Array<{ content: string; title: string; similarity: number }>,
): string {
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
export async function getRagContext(query: string): Promise<string> {
  const results = await searchDocuments(query);
  return formatRagContext(results);
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
        source,
        url,
      },
    });

    // Split content into chunks
    const chunks = splitIntoChunks(content);

    // Generate embeddings for all chunks in batch
    const embeddings = await generateEmbeddings(chunks);

    // Create chunks with embeddings using raw SQL (Prisma can't handle vector type directly)
    for (let i = 0; i < chunks.length; i++) {
      const embedding = embeddings[i];

      if (!embedding) {
        console.warn(`[RAG] Skipping chunk ${i} - embedding generation failed`);
        continue;
      }

      // Use raw SQL to insert with vector type
      const embeddingStr = `[${embedding.join(",")}]`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "RagChunk" (id, "documentId", content, index, embedding, "createdAt")
         VALUES ($1, $2, $3, $4, $5::vector, NOW())`,
        `chunk_${document.id}_${i}`,
        document.id,
        chunks[i],
        i,
        embeddingStr,
      );
    }

    return document.id;
  } catch (error) {
    console.error("[RAG] Error adding document:", error);
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
    console.error("[RAG] Error updating embeddings:", error);
    throw error;
  }
}

/**
 * Delete a document and all its chunks.
 */
export async function deleteDocument(documentId: string): Promise<void> {
  try {
    // Delete chunks first (foreign key constraint)
    await prisma.ragChunk.deleteMany({
      where: { documentId },
    });

    // Delete document
    await prisma.ragDocument.delete({
      where: { id: documentId },
    });
  } catch (error) {
    console.error("[RAG] Error deleting document:", error);
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
 * Determine if a user query needs RAG context.
 * Uses keyword pre-filter for fast path, falls back to LLM for uncertain cases.
 */
export async function shouldUseRag(userMessage: string): Promise<boolean> {
  const lower = userMessage.toLowerCase();

  // Fast path: if any RAG keyword is found, use RAG
  if (RAG_KEYWORDS.some((kw) => lower.includes(kw))) {
    return true;
  }

  // For uncertain cases, use LLM classification
  try {
    const { object } = await generateObject({
      model: subAgentModel,
      schema: z.object({
        needsRag: z.boolean().describe("Whether the query needs RAG context"),
        reason: z.string().describe("Brief reason for the decision"),
      }),
      system: `Sei un classificatore di query. Determina se una domanda dell'utente
richiede informazioni da documenti metodologici sul coaching sportivo.

Rispondi needsRag: true se la domanda riguarda:
- Tecniche di allenamento specifiche
- Metodologie di coaching
- Principi di mental coaching
- Esercizi o programmi di allenamento
- Teoria dello sport
- Domande "come fare" o "come migliorare"

Rispondi needsRag: false se la domanda è:
- Una conversazione personale
- Una domanda sul profilo dell'utente
- Un saluto o smalltalk
- Una richiesta di motivazione generica
- Informazioni già nel profilo/memorie`,
      prompt: `Query dell'utente: "${userMessage}"`,
    });

    return object.needsRag;
  } catch (error) {
    console.error("[RAG] Error classifying query:", error);
    return false;
  }
}

// Export embedding dimensions for schema migrations
export { EMBEDDING_DIMENSIONS };
