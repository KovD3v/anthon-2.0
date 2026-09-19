import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/cost-attribution", () => ({
  recordAiOperation: vi.fn().mockResolvedValue(undefined),
  recordAiOperationFailure: vi.fn().mockResolvedValue(undefined),
  scheduleCostAttribution: vi.fn(),
}));

const vector = (value = 0.1) => Array.from({ length: 1536 }, () => value);
const originalKey = process.env.OPENROUTER_API_KEY;

describe("shared embedding client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    process.env.OPENROUTER_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.OPENROUTER_API_KEY = originalKey;
  });

  it("does not call the provider for empty input", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { generateEmbedding, generateEmbeddings } = await import(
      "./embeddings"
    );

    expect(await generateEmbedding("   ")).toBeNull();
    expect(await generateEmbeddings([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves batch order and rejects invalid dimensions independently", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { index: 1, embedding: vector(0.2) },
            { index: 2, embedding: [1, 2] },
            { index: 0, embedding: vector(0.1) },
          ],
        }),
      }),
    );
    const { generateEmbeddings } = await import("./embeddings");

    const result = await generateEmbeddings(["one", "two", "three"]);

    expect(result[0]?.[0]).toBe(0.1);
    expect(result[1]?.[0]).toBe(0.2);
    expect(result[2]).toBeNull();
  });

  it("returns content-free failure results when credentials are missing", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { generateEmbeddings } = await import("./embeddings");

    expect(await generateEmbeddings(["private content"])).toEqual([null]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates caller abort to the request and resolves failure safely", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new DOMException("aborted", "AbortError"));
    vi.stubGlobal("fetch", fetchMock);
    const { generateEmbedding } = await import("./embeddings");

    expect(
      await generateEmbedding("query", { abortSignal: controller.signal }),
    ).toBeNull();
    expect(fetchMock.mock.calls[0]?.[1]?.signal.aborted).toBe(true);
  });

  it("does not retry deterministic non-JSON client errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => {
        throw new SyntaxError("not JSON");
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const { generateEmbedding } = await import("./embeddings");
    const { recordAiOperation, recordAiOperationFailure } = await import(
      "./cost-attribution"
    );

    expect(await generateEmbedding("query")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(recordAiOperation).toHaveBeenCalledTimes(1);
    expect(recordAiOperation).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "embeddings", failed: true }),
    );
    expect(recordAiOperationFailure).not.toHaveBeenCalled();
  });

  it("counts each observed retry once and does not wait for telemetry storage", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ usage: { cost: 0.001 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ embedding: vector() }],
          usage: { prompt_tokens: 15, cost: 0.002 },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const {
      recordAiOperation,
      recordAiOperationFailure,
      scheduleCostAttribution,
    } = await import("./cost-attribution");
    vi.mocked(recordAiOperation).mockImplementation(
      () => new Promise(() => undefined),
    );
    const { generateEmbedding } = await import("./embeddings");

    expect(await generateEmbedding("query")).toEqual(vector());
    expect(recordAiOperation).toHaveBeenCalledTimes(2);
    expect(recordAiOperation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        failed: true,
        providerMetadata: { openrouter: { usage: { cost: 0.001 } } },
      }),
    );
    expect(recordAiOperation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        failed: false,
        providerMetadata: {
          openrouter: { usage: { prompt_tokens: 15, cost: 0.002 } },
        },
      }),
    );
    expect(scheduleCostAttribution).toHaveBeenCalledTimes(2);
    expect(recordAiOperationFailure).not.toHaveBeenCalled();
  });

  it("does not count an attempt twice when malformed output fails after accounting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      }),
    );
    const { generateEmbedding } = await import("./embeddings");
    const { recordAiOperation, recordAiOperationFailure } = await import(
      "./cost-attribution"
    );

    expect(await generateEmbedding("query")).toBeNull();
    expect(recordAiOperation).toHaveBeenCalledTimes(
      vi.mocked(fetch).mock.calls.length,
    );
    expect(recordAiOperationFailure).not.toHaveBeenCalled();
  });
});
