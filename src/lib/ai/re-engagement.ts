import { generateText } from "ai";
import { subAgentModel } from "@/lib/ai/providers/openrouter";
import { prisma } from "@/lib/db";

export async function generateReEngagementMessage(
	userId: string
): Promise<string | null> {
	try {
		// 1. Fetch user memories to personalize the nudge
		const memories = await prisma.memory.findMany({
			where: { userId },
		});

		if (memories.length === 0) {
			return "Ehilà! È da un po' che non ci sentiamo. Come va oggi?";
		}

		const memoryContext = memories
			.map((m) => {
				const value = m.value as any;
				return `- ${m.key}: ${value.content || JSON.stringify(value)}`;
			})
			.join("\n");

		// 2. Generate a personalized question
		const { text } = await generateText({
			model: subAgentModel,
			system: `Sei Anthon, un mental coach empatico e diretto.
Il tuo obiettivo è fare una domanda di re-engagement a un utente che non senti da un po'.
Usa le informazioni della sua memoria per essere specifico e rilevante.
Sii breve (massimo 20 parole), amichevole e incoraggiante.
Non essere invadente, ma mostra che ti ricordi di lui/lei e dei suoi obiettivi.`,
			prompt: `Ecco cosa ricordi dell'utente:\n${memoryContext}\n\nGenera una domanda breve per riprendere la conversazione.`,
		});

		return text.trim();
	} catch (error) {
		console.error("[ReEngagement] Error generating message:", error);
		return null;
	}
}
