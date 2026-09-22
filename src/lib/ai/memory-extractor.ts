import { generateText } from "ai";
import { z } from "zod";
import { recordAiOperationFailure } from "@/lib/ai/cost-attribution";
import { shouldExtractMemory } from "@/lib/ai/memory-candidate-gate";
import { memoryExpirySchema } from "@/lib/ai/memory-expiry";
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
  durability: z.enum(["DURABLE", "TEMPORARY", "TRANSIENT"]),
  expiry: memoryExpirySchema.nullable().optional(),
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
  if (!input.userText.trim() || !(await shouldExtractMemory(input))) {
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
      instructions: `Estrai al massimo 8 candidati di memoria forniti dall'utente.
L'assistente non è mai la fonte: può solo disambiguare il contesto. Ogni candidato
deve includere in evidence una citazione breve presente letteralmente nel testo utente.
Escludi i fatti che l'utente chiede esplicitamente di non memorizzare.
Classifica come TEMPORARY eventi futuri, scadenze, pressioni e piani temporanei
utili al coaching soltanto se l'utente indica una data di fine o revisione.
In expiry.expression copia la data letterale completa, senza calcolarla:
"domani", "venerdì", "2026-10-24", "24 ottobre 2026", "domani alle 18:00"
o un timestamp ISO con offset. Il server la risolve rispetto all'orario del messaggio.
In expiry.timeZone usa un fuso IANA solo se scritto dall'utente, altrimenti null.
Non inventare anno, fuso, durata o data di revisione. Date ambigue come "venerdì
prossimo" richiedono chiarimento; non troncare l'espressione per renderla valida.
I fatti temporanei usano chiavi contestuali specifiche, mai campi di profilo o preferenze.
Il valore deve indicare l'evento o piano, non trasformarlo in una caratteristica permanente.
Per ogni fatto contestuale usa una key snake_case specifica dell'attività o situazione,
non una categoria generica come schedule, health o other. Identifica il tema del fatto,
non il suo valore variabile: non mettere nella key il giorno o la data aggiornati.
Per ogni fatto contestuale, value deve essere una frase completa e comprensibile
senza leggere key: conserva l'attività o situazione e il dettaglio attribuito.
Per un orario o una correzione scrivi quale attività avviene quando; per una
scadenza scrivi quale evento o piano termina. Non restituire soltanto un giorno,
una data o un numero. Conserva soltanto i dettagli presenti nel testo utente.
I fatti durevoli usano DURABLE con expiry null; i normali dettagli del momento senza
utilità futura sono TRANSIENT. Un fuso personale esplicito usa user_timezone e valore IANA.
explicitSetting è true soltanto per
un'impostazione o preferenza esplicitamente richiesta. Usa HIGH per salute, diagnosi,
trauma, sfera intima o fatti ad alto impatto. Salva anche i fatti durevoli su altre
persone citate dall'utente: usa REFERENCED_PERSON e riporta il nome e la relazione
quando sono espliciti. Usa ACCOUNT_HOLDER solo per fatti sull'utente. Non inventare
e non completare dettagli.
category deve essere uno dei seguenti valori, esattamente in minuscolo:
${MemoryCandidateSchema.shape.category.options.map((category) => JSON.stringify(category)).join(", ")}.
Usa "other" per abitudini o fatti che non rientrano nelle altre categorie; non inventare categorie.
Restituisci un oggetto con la proprietà facts, mai un array alla radice.
Restituisci solo JSON valido: {"facts":[{"key":"snake_case","value":"...",
"category":"...","confidence":0.9,"sensitivity":"LOW|HIGH",
"origin":"EXPLICIT|INFERRED","explicitSetting":false,
"durability":"DURABLE|TEMPORARY|TRANSIENT","expiry":null,"evidence":"testo utente",
"subject":"ACCOUNT_HOLDER|REFERENCED_PERSON","subjectName":null,
"subjectRelationship":null}]}.`,
      prompt: `TESTO UTENTE:\n${input.userText}\n\nRISPOSTA ASSISTENTE (solo contesto, mai fonte):\n${input.assistantText}`,
    }).catch(async (error: unknown) => {
      await recordAiOperationFailure(
        "memory_extraction",
        SUB_AGENT_MODEL_ID,
        error,
      );
      throw error;
    });

    await trackSupportAiUsage({
      operation: "memory_extraction",
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
