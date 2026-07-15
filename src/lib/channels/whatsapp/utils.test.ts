import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loggerMocks = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: loggerMocks.warn,
    error: loggerMocks.error,
  }),
}));

import { downloadWhatsAppMedia } from "./utils";

const MAX_BYTES = 10 * 1024 * 1024;
const MEDIA_URL = "https://media.example/private-file";

function metadataResponse(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      url: MEDIA_URL,
      mime_type: "audio/ogg",
      ...overrides,
    }),
    { headers: { "content-type": "application/json" } },
  );
}

function streamResponse(
  chunks: Uint8Array[],
  options?: {
    contentLength?: number;
    cancel?: () => void;
    stayOpen?: boolean;
  },
) {
  let index = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks[index++];
        if (chunk) controller.enqueue(chunk);
        else if (!options?.stayOpen) controller.close();
      },
      cancel: options?.cancel,
    }),
    {
      headers:
        options?.contentLength === undefined
          ? undefined
          : { "content-length": String(options.contentLength) },
    },
  );
}

describe("bounded WhatsApp media downloads", () => {
  beforeEach(() => {
    process.env.WHATSAPP_ACCESS_TOKEN = "whatsapp-secret-token";
    loggerMocks.error.mockReset();
    loggerMocks.warn.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("rejects trusted oversize metadata before the binary fetch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(metadataResponse({ file_size: MAX_BYTES + 1 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(downloadWhatsAppMedia("media-1")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects an oversize Content-Length and cancels the body", async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(metadataResponse())
        .mockResolvedValueOnce(
          streamResponse([new Uint8Array([1])], {
            contentLength: MAX_BYTES + 1,
            cancel,
          }),
        ),
    );

    await expect(downloadWhatsAppMedia("media-1")).resolves.toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects and cancels a chunked body at limit plus one", async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(metadataResponse({ file_size: "unknown" }))
        .mockResolvedValueOnce(
          streamResponse([new Uint8Array(MAX_BYTES), new Uint8Array([1])], {
            cancel,
            stayOpen: true,
          }),
        ),
    );

    await expect(downloadWhatsAppMedia("media-1")).resolves.toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("accepts a body exactly at the limit", async () => {
    const bytes = new Uint8Array(MAX_BYTES);
    bytes[0] = 9;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(metadataResponse({ file_size: MAX_BYTES }))
        .mockResolvedValueOnce(
          streamResponse([bytes], { contentLength: MAX_BYTES }),
        ),
    );

    await expect(downloadWhatsAppMedia("media-1")).resolves.toEqual({
      base64: Buffer.from(bytes).toString("base64"),
      mimeType: "audio/ogg",
    });
  });

  it("aborts a stalled binary fetch at the timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(metadataResponse())
        .mockImplementationOnce(
          (_url: string, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () =>
                reject(new DOMException("Aborted", "AbortError")),
              );
            }),
        ),
    );

    const result = downloadWhatsAppMedia("media-1");
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(result).resolves.toBeNull();
  });

  it("downloads normal media with a nonempty MIME type", async () => {
    const bytes = new TextEncoder().encode("media-data");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(metadataResponse())
        .mockResolvedValueOnce(streamResponse([bytes])),
    );

    await expect(downloadWhatsAppMedia("media-1")).resolves.toEqual({
      base64: Buffer.from(bytes).toString("base64"),
      mimeType: "audio/ogg",
    });
  });

  it("returns null for malformed metadata", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(metadataResponse({ mime_type: "   " }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(downloadWhatsAppMedia("media-1")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not log tokens, URLs, or response content", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(metadataResponse())
        .mockResolvedValueOnce(
          new Response("private-response-content", { status: 500 }),
        ),
    );

    await downloadWhatsAppMedia("media-1");

    const logs = JSON.stringify([
      ...loggerMocks.error.mock.calls,
      ...loggerMocks.warn.mock.calls,
    ]);
    expect(logs).not.toContain("whatsapp-secret-token");
    expect(logs).not.toContain(MEDIA_URL);
    expect(logs).not.toContain("private-response-content");
  });
});
