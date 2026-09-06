import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  measure: vi.fn(),
}));

vi.mock("@/lib/ai/cost-attribution", () => ({
  recordAiOperation: vi.fn().mockResolvedValue(undefined),
  recordAiOperationFailure: vi.fn().mockResolvedValue(undefined),
  scheduleCostAttribution: vi.fn(),
}));

vi.mock("@/lib/latency-logger", () => ({
  LatencyLogger: {
    measure: mocks.measure,
  },
}));

const originalApiKey = process.env.ELEVENLABS_API_KEY;
const originalVoiceId = process.env.ELEVENLABS_VOICE_ID;
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const originalFlashCost =
  process.env.ELEVENLABS_FLASH_COST_USD_PER_1000_CHARACTERS;

describe("voice/elevenlabs", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mocks.measure.mockReset();
    mocks.measure.mockImplementation(
      async (_name: string, fn: () => unknown | Promise<unknown>) => await fn(),
    );

    process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
    process.env.ELEVENLABS_VOICE_ID = "voice-test-id";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
    delete process.env.ELEVENLABS_FLASH_COST_USD_PER_1000_CHARACTERS;
  });

  afterEach(() => {
    process.env.ELEVENLABS_API_KEY = originalApiKey;
    process.env.ELEVENLABS_VOICE_ID = originalVoiceId;
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    process.env.ELEVENLABS_FLASH_COST_USD_PER_1000_CHARACTERS =
      originalFlashCost;
  });

  it("generateVoice throws when API key is missing", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const { generateVoice } = await import("./elevenlabs");

    await expect(generateVoice("hello")).rejects.toThrow(
      "API key not configured",
    );
  });

  it("generateVoice calls ElevenLabs and returns audio buffer + character count", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
      );
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
    expect(result.costUsd).toBe(0.00025);
    expect(result.audioBuffer).toBeInstanceOf(Buffer);
    expect(result.audioBuffer.length).toBe(3);
    expect(mocks.measure).toHaveBeenCalledWith(
      "Voice: ElevenLabs API",
      expect.any(Function),
    );
  });

  it("supports a configured Flash cost rate", async () => {
    process.env.ELEVENLABS_FLASH_COST_USD_PER_1000_CHARACTERS = "0.08";
    const { estimateVoiceCostUsd } = await import("./elevenlabs");

    expect(estimateVoiceCostUsd(2500)).toBe(0.2);
    expect(estimateVoiceCostUsd(-10)).toBe(0);
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

  it("coalesces concurrent non-bypass cache misses", async () => {
    const subscription = {
      character_count: 100,
      character_limit: 1000,
      next_character_count_reset_unix: 1739999999,
    };
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getElevenLabsSubscription } = await import("./elevenlabs");
    const first = getElevenLabsSubscription();
    const second = getElevenLabsSubscription();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(
      new Response(JSON.stringify(subscription), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(Promise.all([first, second])).resolves.toEqual([
      subscription,
      subscription,
    ]);
  });

  it("uses a bounded timeout signal and retries after a failed fetch", async () => {
    const subscription = {
      character_count: 100,
      character_limit: 1000,
      next_character_count_reset_unix: 1739999999,
    };
    const timeoutController = new AbortController();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url: string, init?: RequestInit) => {
        const signal = init?.signal;
        if (!signal) throw new Error("missing timeout signal");
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      })
      .mockResolvedValueOnce(
        new Response(JSON.stringify(subscription), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValueOnce(timeoutController.signal);

    const { getElevenLabsSubscription } = await import("./elevenlabs");
    const timedOut = getElevenLabsSubscription();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    timeoutController.abort(new DOMException("timed out", "TimeoutError"));
    await expect(timedOut).resolves.toBeNull();
    await expect(getElevenLabsSubscription()).resolves.toEqual(subscription);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.elevenlabs.io/v1/user/subscription",
      expect.objectContaining({
        signal: timeoutController.signal,
      }),
    );
    expect(timeoutSpy).toHaveBeenNthCalledWith(1, 5_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps bypass fetches independent from a pending chat fetch", async () => {
    const pendingSubscription = {
      character_count: 100,
      character_limit: 1000,
      next_character_count_reset_unix: 1739999999,
    };
    const bypassSubscription = {
      character_count: 200,
      character_limit: 1000,
      next_character_count_reset_unix: 1740000000,
    };
    let resolvePending!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolvePending = resolve;
          }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(bypassSubscription), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { getElevenLabsSubscription } = await import("./elevenlabs");
    const pending = getElevenLabsSubscription();
    const bypassed = getElevenLabsSubscription(true);
    const coalesced = getElevenLabsSubscription();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(bypassed).resolves.toEqual(bypassSubscription);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolvePending(
      new Response(JSON.stringify(pendingSubscription), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(Promise.all([pending, coalesced])).resolves.toEqual([
      pendingSubscription,
      pendingSubscription,
    ]);
  });

  it("getSystemLoad returns ratio from subscription usage", async () => {
    const subscription = {
      character_count: 20,
      character_limit: 100,
      next_character_count_reset_unix: 1739999999,
    };
    const fetchMock = vi.fn().mockResolvedValue(
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
    const fetchMock = vi.fn().mockResolvedValue(
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
