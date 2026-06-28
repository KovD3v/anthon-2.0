import { generateText } from "ai";
import { openrouter } from "@/lib/ai/providers/openrouter";
import { getOpenRouterProviderOptionsForModel } from "@/lib/ai/providers/openrouter-routing";
import { trackSupportAiUsage } from "@/lib/ai/usage-meter";
import { createLogger } from "@/lib/logger";

const titleLogger = createLogger("ai");

const SUMMARIZATION_MODEL_ID = "google/gemini-2.5-flash-lite";
const SUMMARIZATION_MODEL = openrouter(SUMMARIZATION_MODEL_ID);
const MAX_TITLE_LENGTH = 55;
const TRAILING_WEAK_WORD_PATTERN =
  /\s+(a|ad|al|allo|alla|ai|agli|alle|con|da|dal|dallo|dalla|dai|dagli|dalle|di|del|dello|della|dei|degli|delle|e|in|nel|nello|nella|nei|negli|nelle|o|per|su|sul|sullo|sulla|sui|sugli|sulle|tra|fra)$/i;

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateAtWordBoundary(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const truncated = value.slice(0, maxLength).trimEnd();
  const lastSpace = truncated.lastIndexOf(" ");

  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
}

function cleanupTitle(value: string): string {
  const cleaned = compactWhitespace(value)
    .replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, "")
    .replace(/^(titolo|title)\s*:\s*/i, "")
    .replace(/[.!?…,:;'"“”‘’«»\s]+$/g, "")
    .replace(/\s*[-–—]\s*$/g, "")
    .replace(TRAILING_WEAK_WORD_PATTERN, "");

  return truncateAtWordBoundary(cleaned, MAX_TITLE_LENGTH);
}

function fallbackTitleFromContext(context: string): string {
  const firstContentLine =
    context
      .split(/\r?\n/)
      .map((line) => line.replace(/^(user|assistant|system)\s*:\s*/i, ""))
      .map((line) => line.replace(/[^\p{L}\p{N}\s-]/gu, " "))
      .map(compactWhitespace)
      .find(Boolean) ?? "Nuova Chat";

  const words = firstContentLine.split(" ").filter(Boolean).slice(0, 6);
  const title = words.join(" ");

  return cleanupTitle(title.charAt(0).toUpperCase() + title.slice(1));
}

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
      prompt: `Genera un titolo in italiano, breve e descrittivo, per una chat di coaching basata su questi messaggi.
Regole obbligatorie:
- usa 3-6 parole, massimo 55 caratteri;
- descrivi il tema concreto della conversazione, non l'azione generica "chat" o "conversazione";
- non iniziare con "Titolo:";
- non usare virgolette, emoji, punto finale o punteggiatura decorativa;
- preferisci sostantivi specifici e parole dell'utente quando sono rilevanti;
- se il testo e' vago, scegli il bisogno principale espresso dall'utente.
Non usare inglese, a meno che una parola inglese sia un nome proprio, un prodotto, una tecnologia o un termine citato dall'utente.
  
  "${context.slice(0, 1000)}"
  
  Titolo in italiano, senza virgolette e senza punteggiatura finale:`,
      maxOutputTokens: 20,
      temperature: 0.7,
      providerOptions: {
        openrouter: getOpenRouterProviderOptionsForModel(
          SUMMARIZATION_MODEL_ID,
        ),
      },
    });

    if (options?.userId) {
      await trackSupportAiUsage({
        userId: options.userId,
        modelId: SUMMARIZATION_MODEL_ID,
        usage: result.usage,
        providerMetadata: result.providerMetadata,
      });
    }

    return cleanupTitle(result.text) || fallbackTitleFromContext(context);
  } catch (error) {
    titleLogger.error("title.generation_failed", "Title generation failed", {
      error,
    });
    return fallbackTitleFromContext(context);
  }
}
