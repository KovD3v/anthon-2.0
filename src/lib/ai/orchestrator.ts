import { type ModelMessage, streamText } from "ai";
import { type AIMetrics, extractAIMetrics } from "@/lib/ai/cost-calculator";
import {
  getModelForUser,
  getModelIdForPlan,
} from "@/lib/ai/providers/openrouter";
import { getRagContext, shouldUseRag } from "@/lib/ai/rag";
import { buildConversationContext } from "@/lib/ai/session-manager";
import {
  createMemoryTools,
  formatMemoriesForPrompt,
} from "@/lib/ai/tools/memory";
import {
  createUserContextTools,
  formatUserContextForPrompt,
} from "@/lib/ai/tools/user-context";

// System prompt template
const SYSTEM_PROMPT_TEMPLATE = `Sei **Anthon**, un assistente di coaching sportivo intelligente, empatico e personalizzato.
Aiuti atleti, coach e genitori a migliorare mentalità, tecnica, motivazione e performance.

Rispondi sempre con empatia, chiarezza e orientamento all'azione.
Non dire mai che sei un modello di AI. Sei un coach digitale professionale.

====================================================================
🎭 1) PERSONALITÀ E STILE
====================================================================
- Tono caldo, motivante, professionale.
- Quando serve puoi essere diretto e pragmatico.
- Usa un linguaggio semplice e naturale.
- Adatta il tuo stile in base alle preferenze dell'utente (tone, mode, language).
- Rispondi sempre nella lingua dell'utente.

Struttura tipica del messaggio:
1. Riconoscimento e validazione emotiva.
2. Osservazione personalizzata basata sul profilo e sulle memorie.
3. Consiglio pratico, breve e applicabile.
4. Domanda finale che guida alla prossima informazione utile.

====================================================================
🧠 2) CONOSCENZA DELL'UTENTE
====================================================================
Hai accesso a:
- Profilo (sport, obiettivi, esperienza, nome…)
- Preferenze (tono, lingua…)
- Memorie (informazioni rilevanti salvate nel tempo)
- Ultimi messaggi (contestualizzati)
- Documenti RAG (conoscenza metodologica)

Usa SEMPRE queste informazioni quando rispondi.
Non ripetere mai tutte le informazioni al completo: usale in modo naturale.

====================================================================
📥 3) REGOLE DI COMPORTAMENTO
====================================================================
- Non inventare informazioni.
- Se un'informazione non esiste in profilo/memorie, chiedila gentilmente.
- Non fare diagnosi mediche o cliniche.
- Non nominare mai i tool o i processi di salvataggio.
- Non dire "salvo questa informazione".
- Non dire "sto aggiornando il tuo profilo".

====================================================================
💾 4) REGOLE DI SALVATAGGIO (CRITICO)
====================================================================
Devi salvare le informazioni IMPORTANTI **automaticamente** usando i tool.

📌 **Salva nel PROFILO (updateProfile):**
- Nome, età, data di nascita
- Sport praticato
- Ruolo/posizione
- Livello di esperienza
- Obiettivi
- Infortuni rilevanti
- Routine di allenamento stabile

📌 **Salva nelle PREFERENZE (updatePreferences):**
- Lingua preferita
- Tono desiderato
- Modalità ("diretto", "empatico", "professionale")

📌 **Salva nelle MEMORIE (saveMemory):**
- Dati utili ma non strutturali (es. "fa fatica nelle partenze esplosive")
- Pattern emotivi o comportamentali
- Dettagli ricorrenti utili al coaching mentale

📌 **Appunti personali (addNotes):**
- Osservazioni tue sull'utente che noti durante le conversazioni
- Pattern che intuisci ma l'utente non ha detto esplicitamente
- Note per te stesso per il coaching futuro
- Intuizioni sul carattere, motivazioni, blocchi

📌 **NON salvare:**
- Emotività estemporanee (es: "oggi sono stanco")
- Informazioni banali o irrilevanti
- Domande generiche
- Opinioni momentanee

====================================================================
🌍 5) RILEVAMENTO LINGUA
====================================================================
- Alla prima interazione, rileva la lingua dell'utente.
- Salvala con updatePreferences({ language: "xx" })
- Usa codici ISO 639-1 (it, en, es, de, fr, pt, etc.)
- Rispetta sempre la lingua salvata.
- Se la lingua cambia, aggiorna le preferenze.

====================================================================
🛠️ 6) TOOL CALLING
====================================================================
Quando serve un dato che può essere salvato:
→ Usa *subito* il tool corretto.
→ Non chiedere conferma.
→ Non parlare del tool all'utente.

ESEMPIO CORRETTO:

Utente: "Mi chiamo Luca e gioco a basket da 8 anni."
Assistant:
- tool: updateProfile({ name: "Luca", sport: "basket", experience: "8 anni" })
- tool: updatePreferences({ language: "it" })
- poi risposta: "Piacere Luca! Basket da 8 anni è un'ottima base…"

====================================================================
📚 7) DOCUMENTI RAG (CONOSCENZA)
====================================================================
Hai accesso a documenti metodologici sul coaching sportivo.
Quando rispondi a domande tecniche o metodologiche:
- Basa le risposte sui documenti disponibili
- Cita concetti e tecniche quando appropriato
- Non inventare metodologie

{{RAG_CONTEXT}}

====================================================================
📅 8) DATA CORRENTE
====================================================================
Data: {{CURRENT_DATE}}

====================================================================
👤 9) CONTESTO UTENTE (dinamico)
====================================================================
{{USER_CONTEXT}}

====================================================================
🧠 10) MEMORIE UTENTE (dinamico)
====================================================================
{{USER_MEMORIES}}`;

interface StreamChatOptions {
  userId: string;
  userMessage: string;
  planId?: string | null;
  userRole?: string;
  hasImages?: boolean;
  messageParts?: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
    [key: string]: unknown;
  }>;
  onFinish?: (result: { text: string; metrics: AIMetrics }) => void;
  onStepFinish?: (step: {
    text?: string;
    toolCalls?: unknown[];
    toolResults?: unknown[];
  }) => void;
}

/**
 * Builds the complete system prompt with user context and memories injected.
 */
async function buildSystemPrompt(
  userId: string,
  ragContext?: string,
): Promise<string> {
  // Fetch user context and memories in parallel
  const [userContext, userMemories] = await Promise.all([
    formatUserContextForPrompt(userId),
    formatMemoriesForPrompt(userId),
  ]);

  // Build system prompt
  let systemPrompt = SYSTEM_PROMPT_TEMPLATE;

  // Inject current date
  systemPrompt = systemPrompt.replace(
    "{{CURRENT_DATE}}",
    new Date().toLocaleDateString("it-IT", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  );

  // Inject RAG context
  systemPrompt = systemPrompt.replace(
    "{{RAG_CONTEXT}}",
    ragContext || "Nessun documento RAG disponibile al momento.",
  );

  // Inject user context
  systemPrompt = systemPrompt.replace(
    "{{USER_CONTEXT}}",
    userContext || "Nessun profilo utente disponibile.",
  );

  // Inject memories
  systemPrompt = systemPrompt.replace(
    "{{USER_MEMORIES}}",
    userMemories || "Nessuna memoria salvata per questo utente.",
  );

  return systemPrompt;
}

/**
 * Creates all tools with the userId context injected via factory pattern.
 */
function createToolsWithContext(userId: string) {
  const memoryTools = createMemoryTools(userId);
  const userContextTools = createUserContextTools(userId);

  return {
    ...memoryTools,
    ...userContextTools,
  };
}

/**
 * Main orchestrator function that streams a chat response.
 * Uses GPT-4.1-mini via OpenRouter with tool calling.
 */
export async function streamChat({
  userId,
  userMessage,
  planId,
  userRole,
  hasImages = false,
  messageParts,
  onFinish,
  onStepFinish,
}: StreamChatOptions) {
  // Record start time for performance tracking
  const startTime = Date.now();

  // Get the appropriate model based on user's subscription plan
  // All Gemini models support vision, so we just use the orchestrator model
  const model = getModelForUser(planId, userRole, "orchestrator");
  const modelId = getModelIdForPlan(planId, userRole, "orchestrator");

  // Check if we need RAG context for this query
  let ragContext: string | undefined;
  let ragUsed = false;
  let ragChunksCount = 0;
  try {
    const needsRag = await shouldUseRag(userMessage);
    if (needsRag) {
      ragContext = await getRagContext(userMessage);
      ragUsed = true;
      // Count chunks by counting "**" which marks each document title
      ragChunksCount = (ragContext.match(/\*\*[^*]+\*\*/g) || []).length;
    }
  } catch (error) {
    console.error("[Orchestrator] RAG error:", error);
  }

  // Build system prompt with user context and optional RAG
  const systemPrompt = await buildSystemPrompt(userId, ragContext);

  // Get conversation history
  const conversationHistory = await buildConversationContext(userId);

  // Build the last message with proper image support
  let lastMessage: ModelMessage;

  if (hasImages && messageParts && messageParts.length > 0) {
    // Convert parts to AI SDK format with images
    const contentParts: Array<
      { type: "text"; text: string } | { type: "image"; image: string }
    > = [];

    for (const part of messageParts) {
      if (part.type === "text" && part.text) {
        contentParts.push({ type: "text", text: part.text });
      } else if (
        part.type === "file" &&
        part.mimeType?.startsWith("image/") &&
        part.data
      ) {
        contentParts.push({
          type: "image",
          image: part.data, // The blob URL
        });
      }
    }

    lastMessage = {
      role: "user",
      content: contentParts,
    };
  } else {
    lastMessage = { role: "user", content: userMessage };
  }

  // Add the new user message
  const messages: ModelMessage[] = [...conversationHistory, lastMessage];

  // Create tools with userId context
  const tools = createToolsWithContext(userId);

  // Collect tool calls during execution
  const collectedToolCalls: Array<{
    name: string;
    args: unknown;
    result?: unknown;
  }> = [];

  // Stream the response
  const result = streamText({
    model,
    system: systemPrompt,
    messages,
    tools,
    onFinish: onFinish
      ? async ({ text, usage, providerMetadata }) => {
          // Calculate estimated system prompt tokens (approx 3.5 chars per token)
          const systemPromptTokens = Math.ceil(systemPrompt.length / 3.5);

          // Calculate estimated tool definition tokens (approx)
          // Based on inspection of src/lib/ai/tools/memory.ts and user-context.ts
          // The schemas and descriptions add up to roughly 1400 tokens
          // This allows us to show the user the tokens THEY are paying for vs system overhead
          const toolDefinitionTokens = 1400;

          // Extract AI metrics including cost calculation
          const metrics = await extractAIMetrics(
            modelId,
            startTime,
            {
              text,
              usage: {
                promptTokens: (usage as { promptTokens?: number })
                  ?.promptTokens,
                completionTokens: (usage as { completionTokens?: number })
                  ?.completionTokens,
                totalTokens: (usage as { totalTokens?: number })?.totalTokens,
              },
              providerMetadata: providerMetadata as Record<string, unknown>,
              // Pass collected tool calls
              collectedToolCalls:
                collectedToolCalls.length > 0 ? collectedToolCalls : undefined,
              // RAG tracking
              ragUsed,
              ragChunksCount,
            },
            systemPromptTokens, // Exclude system prompt
            toolDefinitionTokens, // Exclude tool definitions
          );

          onFinish({ text, metrics });
        }
      : undefined,
    onStepFinish: (step) => {
      // Collect tool calls from each step
      if (step.toolCalls && Array.isArray(step.toolCalls)) {
        for (let i = 0; i < step.toolCalls.length; i++) {
          const tc = step.toolCalls[i] as {
            toolName: string;
            args?: unknown;
          };
          const tr = step.toolResults?.[i] as { result?: unknown } | undefined;
          collectedToolCalls.push({
            name: tc.toolName,
            args: tc.args,
            result: tr?.result,
          });
        }
      }

      // Call user's onStepFinish if provided
      if (onStepFinish) {
        onStepFinish({
          text: step.text,
          toolCalls: step.toolCalls,
          toolResults: step.toolResults,
        });
      }
    },
  });

  return result;
}

/**
 * Non-streaming version for testing or simple use cases.
 */
export async function generateChatResponse(
  userId: string,
  userMessage: string,
): Promise<string> {
  const result = await streamChat({ userId, userMessage });

  // Collect the full response
  let fullText = "";
  for await (const chunk of result.textStream) {
    fullText += chunk;
  }

  return fullText;
}

// Export types for external use
export type { StreamChatOptions, AIMetrics };
