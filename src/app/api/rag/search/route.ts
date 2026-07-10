/**
 * API endpoint for RAG search.
 * Allows testing semantic search queries.
 */

import { NextResponse } from "next/server";
import { RAG } from "@/lib/ai/constants";
import { getRagContext, searchDocuments, shouldUseRag } from "@/lib/ai/rag";
import { requireAdmin } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

const ragLogger = createLogger("ai");

// POST /api/rag/search - Search for relevant documents
export async function POST(req: Request) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  try {
    let body: Record<string, unknown>;
    try {
      const parsedBody = await req.json();
      if (
        !parsedBody ||
        typeof parsedBody !== "object" ||
        Array.isArray(parsedBody)
      ) {
        return NextResponse.json(
          { error: "Invalid request body" },
          { status: 400 },
        );
      }
      body = parsedBody as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const { query, limit: rawLimit, checkNeedsRag = false } = body;

    const normalizedQuery = typeof query === "string" ? query.trim() : "";
    if (!normalizedQuery) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const limit = rawLimit ?? RAG.MAX_RESULTS;
    if (
      typeof limit !== "number" ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > RAG.MAX_RESULTS
    ) {
      return NextResponse.json(
        { error: `limit must be an integer between 1 and ${RAG.MAX_RESULTS}` },
        { status: 400 },
      );
    }

    // Optionally check if the query needs RAG
    let needsRag = true;
    if (checkNeedsRag) {
      needsRag = await shouldUseRag(normalizedQuery);
      if (!needsRag) {
        return NextResponse.json({
          needsRag: false,
          message: "This query does not need RAG context",
          results: [],
          context: "",
        });
      }
    }

    // Search for relevant documents
    const results = await searchDocuments(normalizedQuery, limit);
    const context = getRagContext ? await getRagContext(normalizedQuery) : "";

    return NextResponse.json({
      needsRag,
      results,
      context,
      resultCount: results.length,
    });
  } catch (error) {
    ragLogger.error("post.error", "Failed to search RAG documents", { error });
    return NextResponse.json(
      { error: "Failed to search documents" },
      { status: 500 },
    );
  }
}
