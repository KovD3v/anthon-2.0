export type TranscriptionSource = "WEB" | "TELEGRAM" | "WHATSAPP";

export type TranscriptionProviderName = "openrouter-gemini" | "specialized";

export interface TranscriptionInput {
  base64: string;
  mimeType: string;
  title?: string;
  prompt?: string;
  userId?: string;
  source: TranscriptionSource;
}

export interface TranscriptionResult {
  text: string;
  provider: TranscriptionProviderName;
  modelId: string;
}

export interface TranscriptionProvider {
  name: TranscriptionProviderName;
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
}
