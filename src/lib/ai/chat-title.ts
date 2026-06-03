import { generateText } from "ai";
import { openrouter } from "@/lib/ai/providers/openrouter";
import { trackSupportAiUsage } from "@/lib/ai/usage-meter";
import { createLogger } from "@/lib/logger";

const titleLogger = createLogger("ai");

const SUMMARIZATION_MODEL_ID = "google/gemini-2.5-flash-lite";
const SUMMARIZATION_MODEL = openrouter(SUMMARIZATION_MODEL_ID);

/**
 * Generate a title for a conversation based on the first few messages.
 */
export async function generateChatTitle(
  context: string,
  options?: { userId?: string },
): Promise<string> {
  try {
    const result = await generateText({
      model: SUMMARIZATION_MODEL,
      prompt: `Generate a short, descriptive title (3-6 words) for a conversation based on these messages:
  
  "${context.slice(0, 1000)}"
  
  Title (no quotes, no punctuation at end):`,
      maxOutputTokens: 20,
      temperature: 0.7,
    });

    if (options?.userId) {
      await trackSupportAiUsage({
        userId: options.userId,
        modelId: SUMMARIZATION_MODEL_ID,
        usage: result.usage,
        providerMetadata: result.providerMetadata,
      });
    }

    // Clean up the title
    return result.text
      .trim()
      .replace(/["'.]+$/, "")
      .slice(0, 50);
  } catch (error) {
    titleLogger.error("title.generation_failed", "Title generation failed", {
      error,
    });
    // Fallback: use first few words
    return `${context.slice(0, 40).trim()}...`;
  }
}
