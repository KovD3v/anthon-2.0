import { recordAiOperationFailure } from "@/lib/ai/cost-attribution";
import { trackSupportAiUsage } from "@/lib/ai/usage-meter";
import type {
  TranscriptionInput,
  TranscriptionProvider,
  TranscriptionResult,
} from "@/lib/transcription/types";

const OPENROUTER_GEMINI_TRANSCRIPTION_MODEL_ID = "google/gemini-2.5-flash-lite";

const DEFAULT_PROMPT =
  "Trascrivi questo messaggio audio in testo. Rispondi SOLO con la trascrizione, senza commenti.";

export const openRouterGeminiTranscriptionProvider: TranscriptionProvider = {
  name: "openrouter-gemini",
  async transcribe(input) {
    return transcribeWithOpenRouterGemini(input);
  },
};

async function transcribeWithOpenRouterGemini({
  base64,
  mimeType,
  title = "Channel Bot",
  prompt = DEFAULT_PROMPT,
  userId,
}: TranscriptionInput): Promise<TranscriptionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

  if (!base64.trim()) {
    throw new Error("Audio payload is empty");
  }

  const dataUri = `data:${mimeType};base64,${base64}`;

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": title,
      },
      body: JSON.stringify({
        model: OPENROUTER_GEMINI_TRANSCRIPTION_MODEL_ID,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt,
              },
              {
                type: "image_url",
                image_url: {
                  url: dataUri,
                },
              },
            ],
          },
        ],
      }),
    },
  ).catch(async (error: unknown) => {
    await recordAiOperationFailure(
      "transcription",
      OPENROUTER_GEMINI_TRANSCRIPTION_MODEL_ID,
      error,
    );
    throw error;
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    await recordAiOperationFailure(
      "transcription",
      OPENROUTER_GEMINI_TRANSCRIPTION_MODEL_ID,
      { responseBody: body },
    );
    throw new Error(`OpenRouter API failed: ${response.status} ${body}`);
  }

  const data = (await response.json().catch(async (error: unknown) => {
    await recordAiOperationFailure(
      "transcription",
      OPENROUTER_GEMINI_TRANSCRIPTION_MODEL_ID,
      error,
    );
    throw error;
  })) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      promptTokens?: number;
      completionTokens?: number;
      cost?: number;
    };
  };

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    await recordAiOperationFailure(
      "transcription",
      OPENROUTER_GEMINI_TRANSCRIPTION_MODEL_ID,
      { providerMetadata: toOpenRouterProviderMetadata(data.usage) },
    );
    throw new Error("OpenRouter returned no text output");
  }

  await trackSupportAiUsage({
    operation: "transcription",
    userId,
    modelId: OPENROUTER_GEMINI_TRANSCRIPTION_MODEL_ID,
    providerMetadata: toOpenRouterProviderMetadata(data.usage),
  });

  return {
    text,
    provider: "openrouter-gemini",
    modelId: OPENROUTER_GEMINI_TRANSCRIPTION_MODEL_ID,
  };
}

function toOpenRouterProviderMetadata(
  usage:
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        promptTokens?: number;
        completionTokens?: number;
        cost?: number;
      }
    | undefined,
) {
  if (!usage) {
    return undefined;
  }

  return {
    openrouter: {
      usage: {
        promptTokens: usage.promptTokens ?? usage.prompt_tokens,
        completionTokens: usage.completionTokens ?? usage.completion_tokens,
        cost: usage.cost,
      },
    },
  };
}
