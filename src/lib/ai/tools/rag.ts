import { type Tool, tool } from "ai";
import { z } from "zod";
import { getRagContext } from "@/lib/ai/rag";
import { createLogger } from "@/lib/logger";
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
            ragToolLogger.error(
              "ai.rag.tool.failed",
              "RAG tool retrieval failed",
              {},
            );
            return { success: false, chunkCount: 0, context: "" };
          }
          if (result.chunkCount === 0) {
            return { success: true, chunkCount: 0, context: "" };
          }

          return {
            success: true,
            chunkCount: result.chunkCount,
            context: result.text,
          };
        } catch (error) {
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
