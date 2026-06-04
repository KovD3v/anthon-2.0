import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  OPENROUTER_WHISPER_TRANSCRIPTION_MODEL_ID,
  transcribeWithOpenRouterWhisper,
} from "@/lib/transcription/providers/openrouter-whisper";

const originalEnv = { ...process.env };

vi.mock("@/lib/ai/usage-meter", () => ({
  trackSupportAiUsage: vi.fn(),
}));

describe("transcribeWithOpenRouterWhisper", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          text: "ciao mondo",
          usage: {
            cost: 0.0001,
            input_tokens: 12,
            output_tokens: 3,
            seconds: 4.2,
            total_tokens: 15,
          },
        }),
      }),
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("sends audio to the OpenRouter transcription endpoint", async () => {
    const result = await transcribeWithOpenRouterWhisper({
      base64: "UklGRg==",
      mimeType: "audio/wav",
      title: "Web Chat",
      userId: "user-1",
      source: "WEB",
    });

    expect(result).toEqual({
      text: "ciao mondo",
      provider: "openrouter-whisper",
      modelId: OPENROUTER_WHISPER_TRANSCRIPTION_MODEL_ID,
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer sk-or-test",
          "Content-Type": "application/json",
          "HTTP-Referer": "https://app.test",
          "X-Title": "Web Chat",
        },
        body: JSON.stringify({
          model: OPENROUTER_WHISPER_TRANSCRIPTION_MODEL_ID,
          input_audio: {
            data: "UklGRg==",
            format: "wav",
          },
        }),
      },
    );
  });

  it("throws when OpenRouter returns an empty transcription", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ text: "   " }),
    } as unknown as Response);

    await expect(
      transcribeWithOpenRouterWhisper({
        base64: "UklGRg==",
        mimeType: "audio/wav",
        source: "TELEGRAM",
      }),
    ).rejects.toThrow("OpenRouter returned no transcription text");
  });
});
