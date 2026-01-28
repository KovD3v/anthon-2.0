import { tavily } from "@tavily/core";
import { tool } from "ai";
import { z } from "zod";

// Validate API key at module load
const apiKey = process.env.TAVILY_API_KEY;
if (!apiKey) {
  throw new Error("TAVILY_API_KEY environment variable is required");
}

// Initialize Tavily client
const tavilyClient = tavily({ apiKey });

/**
 * Creates Tavily web search tool with strict validation.
 * We manually define this instead of using the helper to enforce
 * that 'query' is mandatory and non-empty.
 */
export function createTavilyTools() {
  return {
    tavilySearch: tool({
      description: `Search the web for up-to-date information. 
CRITICAL: You MUST provide a 'query' argument. NEVER call this tool with empty arguments.`,
      inputSchema: z.object({
        query: z
          .string()
          .min(1, "Query cannot be empty")
          .describe(
            "The search query. MANDATORY. Example: 'latest news on tech'",
          ),
      }),
      execute: async ({ query }) => {
        try {
          const response = await tavilyClient.search(query, {
            searchDepth: "basic",
            includeAnswer: true,
            maxResults: 5,
            topic: "general",
          });

          return {
            results: response.results.map((r) => ({
              title: r.title,
              url: r.url,
              content: r.content,
            })),
            answer: response.answer,
          };
        } catch (error) {
          console.error("[tavilySearch] Error:", error);
          return {
            error: "Failed to perform search.",
          };
        }
      },
    }),
  };
}
