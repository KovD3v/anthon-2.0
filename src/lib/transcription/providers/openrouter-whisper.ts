import { trackSupportAiUsage } from "@/lib/ai/usage-meter";
import type {
  TranscriptionInput,
  TranscriptionProvider,
  TranscriptionResult,
} from "@/lib/transcription/types";

export const OPENROUTER_WHISPER_TRANSCRIPTION_MODEL_ID =
  "openai/whisper-large-v3-turbo";

export const openRouterWhisperTranscriptionProvider: TranscriptionProvider = {
  name: "openrouter-whisper",
  async transcribe(input) {
    return transcribeWithOpenRouterWhisper(input);
  },
};

export async function transcribeWithOpenRouterWhisper({
  base64,
  mimeType,
  title = "Channel Bot",
  userId,
}: TranscriptionInput): Promise<TranscriptionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

  const audioData = base64.trim();
  if (!audioData) {
    throw new Error("Audio payload is empty");
  }

  const response = await fetch(
    "https://openrouter.ai/api/v1/audio/transcriptions",
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
        model: OPENROUTER_WHISPER_TRANSCRIPTION_MODEL_ID,
        input_audio: {
          data: audioData,
          format: getAudioFormat(mimeType),
        },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenRouter API failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as {
    text?: string;
    usage?: {
      cost?: number;
      input_tokens?: number;
      output_tokens?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      seconds?: number;
    };
  };

  const text = data.text?.trim();
  if (!text) {
    throw new Error("OpenRouter returned no transcription text");
  }

  if (userId) {
    await trackSupportAiUsage({
      userId,
      modelId: OPENROUTER_WHISPER_TRANSCRIPTION_MODEL_ID,
      providerMetadata: toOpenRouterProviderMetadata(data.usage),
    });
  }

  return {
    text,
    provider: "openrouter-whisper",
    modelId: OPENROUTER_WHISPER_TRANSCRIPTION_MODEL_ID,
  };
}

function getAudioFormat(mimeType: string): string {
  const normalized = mimeType.split(";")[0]?.trim().toLowerCase();
  const subtype = normalized?.split("/")[1]?.replace(/^x-/, "");

  if (!subtype) {
    return "wav";
  }

  if (subtype === "mpeg") {
    return "mp3";
  }

  return subtype;
}

function toOpenRouterProviderMetadata(
  usage:
    | {
        cost?: number;
        input_tokens?: number;
        output_tokens?: number;
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        seconds?: number;
      }
    | undefined,
) {
  if (!usage) {
    return undefined;
  }

  return {
    openrouter: {
      usage,
    },
  };
}
