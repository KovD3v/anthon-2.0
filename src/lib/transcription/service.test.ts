import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/transcription/providers/openrouter-gemini", () => ({
  openRouterGeminiTranscriptionProvider: {
    name: "openrouter-gemini",
    transcribe: vi.fn(),
  },
}));

vi.mock("@/lib/transcription/providers/openrouter-whisper", () => ({
  openRouterWhisperTranscriptionProvider: {
    name: "openrouter-whisper",
    transcribe: vi.fn(),
  },
}));

import { openRouterGeminiTranscriptionProvider } from "@/lib/transcription/providers/openrouter-gemini";
import { openRouterWhisperTranscriptionProvider } from "@/lib/transcription/providers/openrouter-whisper";
import { transcribeAudio } from "@/lib/transcription/service";
import type {
  TranscriptionInput,
  TranscriptionProvider,
} from "@/lib/transcription/types";

const input: TranscriptionInput = {
  base64: "YQ==",
  mimeType: "audio/ogg",
  userId: "user-1",
  source: "WEB",
};

describe("transcribeAudio", () => {
  it("uses OpenRouter Whisper Turbo as the default primary provider", async () => {
    vi.mocked(
      openRouterWhisperTranscriptionProvider.transcribe,
    ).mockResolvedValue({
      text: "trascrizione whisper",
      provider: "openrouter-whisper",
      modelId: "openai/whisper-large-v3-turbo",
    });

    await expect(transcribeAudio(input)).resolves.toEqual({
      text: "trascrizione whisper",
      provider: "openrouter-whisper",
      modelId: "openai/whisper-large-v3-turbo",
    });
    expect(
      openRouterWhisperTranscriptionProvider.transcribe,
    ).toHaveBeenCalledWith(input);
  });

  it("falls back to OpenRouter Gemini by default when Whisper Turbo fails", async () => {
    vi.mocked(
      openRouterWhisperTranscriptionProvider.transcribe,
    ).mockRejectedValue(new Error("whisper unavailable"));
    vi.mocked(
      openRouterGeminiTranscriptionProvider.transcribe,
    ).mockResolvedValue({
      text: "fallback gemini",
      provider: "openrouter-gemini",
      modelId: "google/gemini-2.5-flash-lite",
    });

    await expect(transcribeAudio(input)).resolves.toEqual({
      text: "fallback gemini",
      provider: "openrouter-gemini",
      modelId: "google/gemini-2.5-flash-lite",
    });
    expect(
      openRouterGeminiTranscriptionProvider.transcribe,
    ).toHaveBeenCalledWith(input);
  });

  it("uses the primary provider", async () => {
    const primary = createProvider("specialized", "trascrizione primaria");

    await expect(transcribeAudio(input, { primary })).resolves.toEqual({
      text: "trascrizione primaria",
      provider: "specialized",
      modelId: "specialized-model",
    });
    expect(primary.transcribe).toHaveBeenCalledWith(input);
  });

  it("falls back when the primary provider fails", async () => {
    const primary: TranscriptionProvider = {
      name: "specialized",
      transcribe: vi.fn().mockRejectedValue(new Error("primary unavailable")),
    };
    const fallback = createProvider("openrouter-gemini", "fallback ok");

    await expect(
      transcribeAudio(input, { primary, fallback }),
    ).resolves.toEqual({
      text: "fallback ok",
      provider: "openrouter-gemini",
      modelId: "openrouter-gemini-model",
    });
    expect(fallback.transcribe).toHaveBeenCalledWith(input);
  });

  it("throws when the primary provider fails without fallback", async () => {
    const primary: TranscriptionProvider = {
      name: "specialized",
      transcribe: vi.fn().mockRejectedValue(new Error("primary unavailable")),
    };

    await expect(transcribeAudio(input, { primary })).rejects.toThrow(
      "primary unavailable",
    );
  });
});

function createProvider(
  name: TranscriptionProvider["name"],
  text: string,
): TranscriptionProvider {
  return {
    name,
    transcribe: vi.fn().mockResolvedValue({
      text,
      provider: name,
      modelId: `${name}-model`,
    }),
  };
}
