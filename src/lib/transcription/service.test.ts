import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/transcription/providers/openrouter-gemini", () => ({
  openRouterGeminiTranscriptionProvider: {
    name: "openrouter-gemini",
    transcribe: vi.fn(),
  },
}));

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
