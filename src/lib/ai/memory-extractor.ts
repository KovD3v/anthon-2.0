import { generateText, Output } from "ai";
import { z } from "zod";
import { MEMORY } from "@/lib/ai/constants";
import { subAgentModel } from "@/lib/ai/providers/openrouter";
import { invalidateMemoriesForPromptCache } from "@/lib/ai/tools/memory";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const extractorLogger = createLogger("ai");

// Schema for extracted memory facts
const ExtractedFactsSchema = z.object({
  facts: z.array(
    z.object({
      key: z
        .string()
        .describe(
          "A unique key for this fact, e.g., 'user_name', 'user_sport', 'user_goal', 'user_preference_*'",
        ),
      value: z
        .string()
        .describe("The value of the fact extracted from the conversation"),
      category: z
        .enum([
          "identity",
          "sport",
          "goal",
          "preference",
          "health",
          "schedule",
          "conversation_topic",
          "other",
        ])
        .describe("Category of the fact"),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .describe("Confidence score 0-1 that this fact is accurate"),
    }),
  ),
});

/**
 * Extracts important facts from a conversation exchange and saves them to Memory.
 * This runs as a post-processing step after each assistant response.
 * Uses Gemini 2.5 Flash for fast extraction.
 */
export async function extractAndSaveMemories(
  userId: string,
  userMessage: string,
  assistantResponse: string,
): Promise<void> {
  // Skip extraction for very short messages (unlikely to contain useful info)
  const MIN_MESSAGE_LENGTH = 20;
  const MIN_WORD_COUNT = 5;

  const wordCount = userMessage.trim().split(/\s+/).length;
  if (userMessage.length < MIN_MESSAGE_LENGTH || wordCount < MIN_WORD_COUNT) {
    return;
  }

  try {
    // Use generateText with Output.object() for structured extraction
    const { output } = await generateText({
      model: subAgentModel,
      output: Output.object({
        schema: ExtractedFactsSchema,
      }),
      system: `Sei un assistente che estrae informazioni importanti dalle conversazioni.
Analizza lo scambio tra utente e assistente e estrai fatti persistenti sull'utente.

Regole:
- Estrai solo informazioni esplicite, non fare assunzioni
- Priorità a: nome, sport praticato, obiettivi, preferenze, condizioni fisiche, disponibilità orarie
- Ignora informazioni transitorie o specifiche del momento
- Usa key in snake_case in inglese (es: user_name, user_sport, user_goal)
- Assegna confidence alta (>0.8) solo se l'informazione è chiara e non ambigua
- Se non ci sono fatti da estrarre, restituisci un array vuoto`,
      prompt: `Estrai i fatti importanti da questo scambio:

UTENTE: ${userMessage}

ASSISTENTE: ${assistantResponse}

Restituisci i fatti estratti o un array vuoto se non ce ne sono.`,
    });

    // Filter facts with high enough confidence and save them
    const highConfidenceFacts = (output?.facts ?? []).filter(
      (f) => f.confidence >= MEMORY.MIN_CONFIDENCE,
    );

    for (const fact of highConfidenceFacts) {
      // Use proper Prisma upsert with composite unique key (userId + key)
      await prisma.memory.upsert({
        where: {
          userId_key: { userId, key: fact.key },
        },
        update: {
          value: {
            content: fact.value,
            category: fact.category,
            confidence: fact.confidence,
            updatedAt: new Date().toISOString(),
          },
        },
        create: {
          userId,
          key: fact.key,
          value: {
            content: fact.value,
            category: fact.category,
            confidence: fact.confidence,
            createdAt: new Date().toISOString(),
          },
        },
      });
    }

    if (highConfidenceFacts.length > 0) {
      invalidateMemoriesForPromptCache(userId);
    }

    // Update lastActivityAt for the user
    await prisma.user.update({
      where: { id: userId },
      data: { lastActivityAt: new Date() },
    });
  } catch (error) {
    // Log error but don't throw - memory extraction is non-critical
    extractorLogger.error("extraction_failed", "Error extracting memories", { error });
  }
}
