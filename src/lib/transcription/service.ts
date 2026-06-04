import { createLogger } from "@/lib/logger";
import { openRouterGeminiTranscriptionProvider } from "@/lib/transcription/providers/openrouter-gemini";
import { openRouterWhisperTranscriptionProvider } from "@/lib/transcription/providers/openrouter-whisper";
import type {
  TranscriptionInput,
  TranscriptionProvider,
  TranscriptionResult,
} from "@/lib/transcription/types";

const logger = createLogger("ai");

export interface TranscriptionServiceOptions {
  primary?: TranscriptionProvider;
  fallback?: TranscriptionProvider;
}

export async function transcribeAudio(
  input: TranscriptionInput,
  options: TranscriptionServiceOptions = {},
): Promise<TranscriptionResult> {
  const primary = options.primary ?? openRouterWhisperTranscriptionProvider;
  const fallback =
    options.fallback ??
    (options.primary ? undefined : openRouterGeminiTranscriptionProvider);

  try {
    return await primary.transcribe(input);
  } catch (error) {
    if (!fallback) {
      throw error;
    }

    logger.warn(
      "transcription.primary_failed",
      "Primary transcription provider failed, trying fallback",
      {
        error,
        primaryProvider: primary.name,
        fallbackProvider: fallback.name,
        source: input.source,
      },
    );

    return fallback.transcribe(input);
  }
}
