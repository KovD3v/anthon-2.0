import { generateText } from "ai";
import { openrouter } from "@/lib/ai/providers/openrouter";

const SUMMARIZATION_MODEL = openrouter("google/gemini-2.0-flash-001");

/**
 * Generate a title for a conversation based on the first few messages.
 */
export async function generateChatTitle(
  firstUserMessage: string,
): Promise<string> {
  try {
    const result = await generateText({
      model: SUMMARIZATION_MODEL,
      prompt: `Generate a short, descriptive title (3-6 words) for a conversation that starts with this message:

"${firstUserMessage.slice(0, 500)}"

Title (no quotes, no punctuation at end):`,
      maxOutputTokens: 20,
      temperature: 0.7,
    });

    // Clean up the title
    return result.text
      .trim()
      .replace(/["'.]+$/, "")
      .slice(0, 50);
  } catch (error) {
    console.error("[ChatTitle] Title generation failed:", error);
    // Fallback: use first few words
    return `${firstUserMessage.slice(0, 40).trim()}...`;
  }
}
