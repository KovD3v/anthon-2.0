import { type Tool, tool } from "ai";
import { z } from "zod";
import { getRagContext } from "@/lib/ai/rag";
import { createLogger } from "@/lib/logger";
import type { DeveloperDiagnosticsCollector } from "@/lib/response-profiler/developer-diagnostics";
import type { ServerTraceCollector } from "@/lib/response-profiler/server-trace";

const ragToolLogger = createLogger("ai");
const DEFAULT_MAX_QUERY_CHARACTERS = 1_000;

export type RagToolResult = {
  success: boolean;
  chunkCount: number;
  context: string;
};

export function createRagTools(options?: {
  maxQueryCharacters?: number;
  traceCollector?: ServerTraceCollector;
  developerDiagnostics?: DeveloperDiagnosticsCollector;
}): {
  searchRag: Tool;
} {
  const maxQueryCharacters =
    options?.maxQueryCharacters ?? DEFAULT_MAX_QUERY_CHARACTERS;
  let searchCalls = 0;

  return {
    searchRag: tool({
      description:
        "Search the approved RAG document corpus for relevant context. Use at most once, with a concise, specific query. The result contains only safe context and its chunk count.",
      inputSchema: z.object({
        query: z
          .string()
          .trim()
          .min(1, "Query cannot be empty")
          .max(maxQueryCharacters, "Query is too long"),
      }),
      execute: async ({ query }): Promise<RagToolResult> => {
        const boundedQuery = query.trim();
        options?.developerDiagnostics?.recordRagDecision({
          needed: true,
          query: boundedQuery,
        });
        if (
          searchCalls >= 1 ||
          boundedQuery.length === 0 ||
          boundedQuery.length > maxQueryCharacters
        ) {
          return { success: false, chunkCount: 0, context: "" };
        }

        searchCalls += 1;

        try {
          const result = options?.traceCollector
            ? await getRagContext(boundedQuery, options.traceCollector)
            : await getRagContext(boundedQuery);
          if (result.failed) {
            options?.developerDiagnostics?.recordRagFailure({
              query: boundedQuery,
              error:
                result.diagnostics?.error ?? new Error("RAG retrieval failed"),
            });
            ragToolLogger.error(
              "ai.rag.tool.failed",
              "RAG tool retrieval failed",
              {},
            );
            return { success: false, chunkCount: 0, context: "" };
          }
          if (result.chunkCount === 0) {
            options?.developerDiagnostics?.recordRagResult({
              query: boundedQuery,
              chunks: [],
            });
            return { success: true, chunkCount: 0, context: "" };
          }

          if (result.diagnostics) {
            options?.developerDiagnostics?.recordRagResult({
              query: result.diagnostics.query,
              chunks: result.diagnostics.chunks.map((chunk) => ({
                chunkId: chunk.chunkId,
                documentId: chunk.documentId,
                documentTitle: chunk.documentTitle ?? chunk.title,
                score: chunk.similarity,
                text: chunk.content,
              })),
            });
          }

          return {
            success: true,
            chunkCount: result.chunkCount,
            context: result.text,
          };
        } catch (error) {
          options?.developerDiagnostics?.recordRagFailure({
            query: boundedQuery,
            error,
          });
          ragToolLogger.error(
            "ai.rag.tool.failed",
            "RAG tool retrieval failed",
            { error },
          );
          return { success: false, chunkCount: 0, context: "" };
        }
      },
    }),
  };
}
