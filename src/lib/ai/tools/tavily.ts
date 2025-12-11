import { tavilySearch } from "@tavily/ai-sdk";

/**
 * Creates Tavily web search tool for real-time web searching.
 * This enables the AI assistant to search the web for current information.
 */
export function createTavilyTools() {
	return {
		tavilySearch: tavilySearch({
			searchDepth: "basic",
			includeAnswer: true,
			maxResults: 5,
			topic: "general",
		}),
	};
}
