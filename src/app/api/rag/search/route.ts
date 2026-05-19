/**
 * API endpoint for RAG search.
 * Allows testing semantic search queries.
 */

import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { RAG } from "@/lib/ai/constants";
import { getRagContext, searchDocuments, shouldUseRag } from "@/lib/ai/rag";

// POST /api/rag/search - Search for relevant documents
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { query, limit: rawLimit, checkNeedsRag = false } = body;

    if (!query) {
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
      needsRag = await shouldUseRag(query);
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
    const results = await searchDocuments(query, limit);
    const context = getRagContext ? await getRagContext(query) : "";

    return NextResponse.json({
      needsRag,
      results,
      context,
      resultCount: results.length,
    });
  } catch (error) {
    console.error("[RAG API] Error searching:", error);
    return NextResponse.json(
      { error: "Failed to search documents" },
      { status: 500 },
    );
  }
}
