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

import {
  downloadTelegramAudio,
  downloadTelegramDocument,
  downloadTelegramPhoto,
} from "./utils";

const MAX_BYTES = 10 * 1024 * 1024;

function getFileResponse(filePath = "media/file.bin") {
  return new Response(
    JSON.stringify({ ok: true, result: { file_path: filePath } }),
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

describe("bounded Telegram media downloads", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "telegram-secret-token";
    loggerMocks.error.mockReset();
    loggerMocks.warn.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("rejects a declared oversize file before getFile", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      downloadTelegramAudio({
        file_id: "voice-1",
        file_unique_id: "unique-1",
        duration: 1,
        file_size: MAX_BYTES + 1,
      }),
    ).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an oversize Content-Length and cancels the body", async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(getFileResponse())
        .mockResolvedValueOnce(
          streamResponse([new Uint8Array([1])], {
            contentLength: MAX_BYTES + 1,
            cancel,
          }),
        ),
    );

    await expect(
      downloadTelegramDocument({
        file_id: "document-1",
        file_unique_id: "unique-1",
      }),
    ).resolves.toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects and cancels a chunked body at limit plus one", async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(getFileResponse())
        .mockResolvedValueOnce(
          streamResponse([new Uint8Array(MAX_BYTES), new Uint8Array([1])], {
            cancel,
            stayOpen: true,
          }),
        ),
    );

    await expect(
      downloadTelegramPhoto([
        {
          file_id: "photo-1",
          file_unique_id: "unique-1",
          width: 1,
          height: 1,
        },
      ]),
    ).resolves.toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("accepts a body exactly at the limit", async () => {
    const bytes = new Uint8Array(MAX_BYTES);
    bytes[0] = 7;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(getFileResponse())
        .mockResolvedValueOnce(
          streamResponse([bytes], { contentLength: MAX_BYTES }),
        ),
    );

    const result = await downloadTelegramDocument({
      file_id: "document-1",
      file_unique_id: "unique-1",
    });
    expect(result?.base64).toBe(Buffer.from(bytes).toString("base64"));
  });

  it("aborts a stalled download at the timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(getFileResponse())
      .mockImplementationOnce(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = downloadTelegramAudio({
      file_id: "voice-1",
      file_unique_id: "unique-1",
      duration: 1,
    });
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(result).resolves.toBeNull();
  });

  it("downloads a normal audio body", async () => {
    const bytes = new TextEncoder().encode("audio-data");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(getFileResponse("voice/file.ogg"))
        .mockResolvedValueOnce(streamResponse([bytes])),
    );

    await expect(
      downloadTelegramAudio({
        file_id: "voice-1",
        file_unique_id: "unique-1",
        duration: 1,
        mime_type: "audio/ogg",
      }),
    ).resolves.toEqual({
      base64: Buffer.from(bytes).toString("base64"),
      mimeType: "audio/ogg",
    });
  });

  it("does not log tokens, paths, or response content", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(getFileResponse("private/secret-file.bin"))
        .mockResolvedValueOnce(
          new Response("private-response-content", { status: 500 }),
        ),
    );

    await downloadTelegramDocument({
      file_id: "document-1",
      file_unique_id: "unique-1",
    });

    const logs = JSON.stringify([
      ...loggerMocks.error.mock.calls,
      ...loggerMocks.warn.mock.calls,
    ]);
    expect(logs).not.toContain("telegram-secret-token");
    expect(logs).not.toContain("secret-file");
    expect(logs).not.toContain("private-response-content");
  });
});
