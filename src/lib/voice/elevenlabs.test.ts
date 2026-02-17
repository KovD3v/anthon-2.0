import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  measure: vi.fn(),
}));

vi.mock("@/lib/latency-logger", () => ({
  LatencyLogger: {
    measure: mocks.measure,
  },
}));

const originalApiKey = process.env.ELEVENLABS_API_KEY;
const originalVoiceId = process.env.ELEVENLABS_VOICE_ID;
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

describe("voice/elevenlabs", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    mocks.measure.mockReset();
    mocks.measure.mockImplementation(
      async (_name: string, fn: () => unknown | Promise<unknown>) => await fn(),
    );

    process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
    process.env.ELEVENLABS_VOICE_ID = "voice-test-id";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  });

  afterEach(() => {
    process.env.ELEVENLABS_API_KEY = originalApiKey;
    process.env.ELEVENLABS_VOICE_ID = originalVoiceId;
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  });

  it("generateVoice throws when API key is missing", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const { generateVoice } = await import("./elevenlabs");

    await expect(generateVoice("hello")).rejects.toThrow("API key not configured");
  });

  it("generateVoice calls ElevenLabs and returns audio buffer + character count", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { generateVoice } = await import("./elevenlabs");
    const result = await generateVoice("hello");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.elevenlabs.io/v1/text-to-speech/voice-test-id",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "xi-api-key": "test-elevenlabs-key",
          Accept: "audio/mpeg",
        }),
      }),
    );
    expect(result.characterCount).toBe(5);
    expect(result.audioBuffer).toBeInstanceOf(Buffer);
    expect(result.audioBuffer.length).toBe(3);
    expect(mocks.measure).toHaveBeenCalledWith(
      "Voice: ElevenLabs API",
      expect.any(Function),
    );
  });

  it("generateVoice throws on non-ok response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("tts failed", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const { generateVoice } = await import("./elevenlabs");

    await expect(generateVoice("hello")).rejects.toThrow("TTS failed: 500");
  });

  it("getElevenLabsSubscription returns null when API key is missing", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const { getElevenLabsSubscription } = await import("./elevenlabs");

    await expect(getElevenLabsSubscription()).resolves.toBeNull();
  });

  it("getElevenLabsSubscription uses cache and respects bypassCache", async () => {
    const subscription = {
      character_count: 100,
      character_limit: 1000,
      next_character_count_reset_unix: 1739999999,
    };
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify(subscription), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getElevenLabsSubscription } = await import("./elevenlabs");

    const first = await getElevenLabsSubscription();
    const second = await getElevenLabsSubscription();
    const bypassed = await getElevenLabsSubscription(true);

    expect(first).toEqual(subscription);
    expect(second).toEqual(subscription);
    expect(bypassed).toEqual(subscription);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("getSystemLoad returns ratio from subscription usage", async () => {
    const subscription = {
      character_count: 20,
      character_limit: 100,
      next_character_count_reset_unix: 1739999999,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(subscription), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { getSystemLoad } = await import("./elevenlabs");
    await expect(getSystemLoad()).resolves.toBe(0.8);
  });

  it("getSystemLoad falls back to conservative value when subscription cannot be fetched", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const { getSystemLoad } = await import("./elevenlabs");

    await expect(getSystemLoad()).resolves.toBe(0.5);
  });

  it("returns 0 system load when subscription limit is zero", async () => {
    const subscription = {
      character_count: 0,
      character_limit: 0,
      next_character_count_reset_unix: 1739999999,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(subscription), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { getSystemLoad } = await import("./elevenlabs");
    await expect(getSystemLoad()).resolves.toBe(0);
  });

  it("isElevenLabsConfigured reflects API key presence", async () => {
    const { isElevenLabsConfigured } = await import("./elevenlabs");
    expect(isElevenLabsConfigured()).toBe(true);

    delete process.env.ELEVENLABS_API_KEY;
    expect(isElevenLabsConfigured()).toBe(false);
  });
});
