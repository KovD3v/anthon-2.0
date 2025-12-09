import { generateObject } from "ai";
import { z } from "zod";
import { MEMORY } from "@/lib/ai/constants";
import { subAgentModel } from "@/lib/ai/providers/openrouter";
import { prisma } from "@/lib/db";

// Schema for extracted memory facts
const ExtractedFactsSchema = z.object({
	facts: z.array(
		z.object({
			key: z
				.string()
				.describe(
					"A unique key for this fact, e.g., 'user_name', 'user_sport', 'user_goal', 'user_preference_*'"
				),
			value: z
				.string()
				.describe(
					"The value of the fact extracted from the conversation"
				),
			category: z
				.enum([
					"identity",
					"sport",
					"goal",
					"preference",
					"health",
					"schedule",
					"other",
				])
				.describe("Category of the fact"),
			confidence: z
				.number()
				.min(0)
				.max(1)
				.describe("Confidence score 0-1 that this fact is accurate"),
		})
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
	assistantResponse: string
): Promise<void> {
	try {
		// Use generateObject for structured extraction
		const { object } = await generateObject({
			model: subAgentModel,
			schema: ExtractedFactsSchema,
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
		const highConfidenceFacts = object.facts.filter(
			(f) => f.confidence >= MEMORY.MIN_CONFIDENCE
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
	} catch (error) {
		// Log error but don't throw - memory extraction is non-critical
		console.error("[MemoryExtractor] Error extracting memories:", error);
	}
}

/**
 * Bulk extract memories from a conversation history.
 * Useful for initial profile building or catch-up.
 */
export async function extractMemoriesFromHistory(
	userId: string,
	conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
): Promise<void> {
	// Build conversation text
	const conversationText = conversationHistory
		.map((m) => {
			const role = m.role === "user" ? "UTENTE" : "ASSISTENTE";
			return `${role}: ${m.content}`;
		})
		.join("\n\n");

	try {
		const { object } = await generateObject({
			model: subAgentModel,
			schema: ExtractedFactsSchema,
			system: `Sei un assistente che estrae informazioni importanti da una cronologia di conversazioni.
Analizza l'intera conversazione e estrai tutti i fatti persistenti sull'utente.

Regole:
- Estrai solo informazioni esplicite confermate dall'utente
- Priorità a: nome, sport praticato, obiettivi, preferenze, condizioni fisiche, disponibilità
- Usa key univoche in snake_case (es: user_name, user_sport, primary_goal)
- Assegna confidence in base a quanto l'informazione è chiara e ripetuta
- Ignora informazioni contraddittorie o incerte`,
			prompt: `Analizza questa cronologia di conversazione e estrai tutti i fatti importanti sull'utente:\n\n${conversationText}`,
		});

		// Save all high-confidence facts
		const validFacts = object.facts.filter(
			(f) => f.confidence >= MEMORY.HISTORY_MIN_CONFIDENCE
		);

		for (const fact of validFacts) {
			// Check if memory exists and if new confidence is higher
			const existing = await prisma.memory.findUnique({
				where: { userId_key: { userId, key: fact.key } },
			});

			const existingValue = existing?.value as {
				confidence?: number;
			} | null;
			const shouldUpdate =
				!existingValue?.confidence ||
				fact.confidence > existingValue.confidence;

			if (shouldUpdate) {
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
		}
	} catch (error) {
		console.error(
			"[MemoryExtractor] Error extracting from history:",
			error
		);
	}
}
