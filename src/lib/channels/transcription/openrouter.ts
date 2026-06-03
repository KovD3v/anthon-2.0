import {
  OPENROUTER_GEMINI_TRANSCRIPTION_MODEL_ID,
  transcribeWithOpenRouterGemini,
} from "@/lib/transcription/providers/openrouter-gemini";
import type { TranscriptionSource } from "@/lib/transcription/types";

export const TRANSCRIPTION_MODEL_ID = OPENROUTER_GEMINI_TRANSCRIPTION_MODEL_ID;

export interface TranscriptionInput {
  base64: string;
  mimeType: string;
  title?: string;
  prompt?: string;
  userId?: string;
  source?: TranscriptionSource;
}

export async function transcribeAudioWithOpenRouter({
  base64,
  mimeType,
  title = "Channel Bot",
  prompt = "Trascrivi questo messaggio audio in testo. Rispondi SOLO con la trascrizione, senza commenti.",
  userId,
  source = "TELEGRAM",
}: TranscriptionInput): Promise<string> {
  const result = await transcribeWithOpenRouterGemini({
    base64,
    mimeType,
    title,
    prompt,
    userId,
    source,
  });

  return result.text;
}
