import { generateText } from "ai";
import { z } from "zod";
import {
  SUB_AGENT_MODEL_ID,
  subAgentModel,
} from "@/lib/ai/providers/openrouter";
import { getOpenRouterProviderOptionsForModel } from "@/lib/ai/providers/openrouter-routing";
import { trackSupportAiUsage } from "@/lib/ai/usage-meter";
import { createLogger } from "@/lib/logger";

const extractorLogger = createLogger("ai");

const MemoryCandidateSchema = z.object({
  key: z.string().trim().min(3).max(80),
  value: z.string().trim().min(1).max(1000),
  category: z.enum([
    "identity",
    "sport",
    "goal",
    "preference",
    "health",
    "diagnosis",
    "trauma",
    "intimate",
    "schedule",
    "conversation_topic",
    "other",
  ]),
  confidence: z.number().min(0).max(1),
  sensitivity: z.enum(["LOW", "HIGH"]),
  origin: z.enum(["EXPLICIT", "INFERRED"]),
  explicitSetting: z.boolean(),
  durability: z.enum(["DURABLE", "TRANSIENT"]),
  evidence: z.string().trim().min(1).max(500),
  subject: z.enum(["ACCOUNT_HOLDER", "REFERENCED_PERSON"]),
  subjectName: z.string().trim().min(1).max(80).nullable(),
  subjectRelationship: z.string().trim().min(1).max(80).nullable(),
});

const ExtractedFactsSchema = z.object({
  facts: z.array(MemoryCandidateSchema).max(8),
});

export type MemoryCandidate = z.infer<typeof MemoryCandidateSchema>;

function normalizeEvidence(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it-IT")
    .replace(/\s+/g, " ")
    .trim();
}

function isUserSupported(userText: string, evidence: string) {
  const normalizedEvidence = normalizeEvidence(evidence);
  return (
    normalizedEvidence.length >= 4 &&
    normalizeEvidence(userText).includes(normalizedEvidence)
  );
}

function extractJsonText(text: string | undefined) {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  return (
    trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim() ?? trimmed
  );
}

function parseCandidates(text: string | undefined, userText: string) {
  const jsonText = extractJsonText(text);
  if (!jsonText) return null;
  try {
    const result = ExtractedFactsSchema.safeParse(JSON.parse(jsonText));
    if (!result.success) return null;
    return result.data.facts.filter((candidate) =>
      isUserSupported(userText, candidate.evidence),
    );
  } catch {
    return null;
  }
}

export async function extractMemoryCandidates(input: {
  userId: string;
  userText: string;
  assistantText: string;
}): Promise<MemoryCandidate[]> {
  const trimmedUserText = input.userText.trim();
  if (trimmedUserText.length < 10 || trimmedUserText.split(/\s+/).length < 3) {
    return [];
  }

  try {
    const result = await generateText({
      model: subAgentModel,
      temperature: 0,
      maxOutputTokens: 700,
      providerOptions: {
        openrouter: getOpenRouterProviderOptionsForModel(SUB_AGENT_MODEL_ID),
      },
      instructions: `Estrai al massimo 8 candidati di memoria durevole forniti dall'utente.
L'assistente non è mai la fonte: può solo disambiguare il contesto. Ogni candidato
deve includere in evidence una citazione breve presente letteralmente nel testo utente.
Classifica come TRANSIENT i dettagli del momento; explicitSetting è true soltanto per
un'impostazione o preferenza esplicitamente richiesta. Usa HIGH per salute, diagnosi,
trauma, sfera intima o fatti ad alto impatto. Salva anche i fatti durevoli su altre
persone citate dall'utente: usa REFERENCED_PERSON e riporta il nome e la relazione
quando sono espliciti. Usa ACCOUNT_HOLDER solo per fatti sull'utente. Non inventare
e non completare dettagli.
Restituisci solo JSON valido: {"facts":[{"key":"snake_case","value":"...",
"category":"...","confidence":0.9,"sensitivity":"LOW|HIGH",
"origin":"EXPLICIT|INFERRED","explicitSetting":false,
"durability":"DURABLE|TRANSIENT","evidence":"testo utente",
"subject":"ACCOUNT_HOLDER|REFERENCED_PERSON","subjectName":null,
"subjectRelationship":null}]}.`,
      prompt: `TESTO UTENTE:\n${input.userText}\n\nRISPOSTA ASSISTENTE (solo contesto, mai fonte):\n${input.assistantText}`,
    });

    await trackSupportAiUsage({
      userId: input.userId,
      modelId: SUB_AGENT_MODEL_ID,
      usage: result.usage,
      providerMetadata: result.providerMetadata,
    });

    const candidates = parseCandidates(result.text, input.userText);
    if (!candidates) {
      extractorLogger.warn(
        "ai.memory.extraction_unparseable",
        "Memory extractor returned invalid structured output",
        { userId: input.userId },
      );
      return [];
    }
    return candidates;
  } catch (error) {
    extractorLogger.error(
      "ai.memory.extraction_failed",
      "Memory candidate extraction failed",
      {
        errorName: error instanceof Error ? error.name : "unknown",
        userId: input.userId,
      },
    );
    return [];
  }
}
