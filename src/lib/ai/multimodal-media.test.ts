import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dnsLookup: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: mocks.dnsLookup,
}));

import {
  getMultimodalMediaKind,
  hasSupportedOpenRouterMedia,
  isBase64Payload,
  isDataUrl,
  isHttpUrl,
  isPublicNetworkAddress,
  isTrustedVercelBlobHostname,
  loadTrustedRemoteMedia,
  MAX_MULTIMODAL_MEDIA_BYTES,
  modelSupportsMultimodalMediaKind,
  normalizeInlineMediaBase64,
  normalizeMediaType,
  toOpenRouterMessages,
} from "./multimodal-media";

const TRUSTED_HOST = "store.public.blob.vercel-storage.com";
const TRUSTED_URL = `https://${TRUSTED_HOST}/attachments/user-1/document.pdf`;
const TRUSTED_IMAGE_URL = `https://${TRUSTED_HOST}/attachments/user-1/photo.jpg`;
const PDF_BYTES = Buffer.from("%PDF-1.7 safe");
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

function remoteImageMessages(expectedSize = JPEG_BYTES.byteLength) {
  return [
    {
      role: "user",
      content: [
        {
          type: "file",
          data: TRUSTED_IMAGE_URL,
          mediaType: "image/jpeg",
          size: expectedSize,
        },
      ],
    },
  ] as never;
}

describe("multimodal media validation", () => {
  beforeEach(() => {
    mocks.dnsLookup.mockReset();
    mocks.dnsLookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("uses a label-boundary-safe Vercel Blob hostname allowlist", () => {
    expect(isTrustedVercelBlobHostname(TRUSTED_HOST)).toBe(true);
    expect(isTrustedVercelBlobHostname("blob.vercel-storage.com")).toBe(false);
    expect(
      isTrustedVercelBlobHostname(
        "store.public.blob.vercel-storage.com.attacker.example",
      ),
    ).toBe(false);
    expect(
      isTrustedVercelBlobHostname("vercel-storage.com.attacker.example"),
    ).toBe(false);
  });

  it("normalizes media types and classifies only supported media families", () => {
    expect(normalizeMediaType(" Image/PNG ; charset=binary ")).toBe(
      "image/png",
    );
    expect(getMultimodalMediaKind()).toBeNull();
    expect(getMultimodalMediaKind("image/png")).toBe("image");
    expect(getMultimodalMediaKind("application/pdf; charset=binary")).toBe(
      "pdf",
    );
    expect(getMultimodalMediaKind("video/mp4")).toBe("video");
    expect(getMultimodalMediaKind("audio/mpeg")).toBeNull();

    expect(
      modelSupportsMultimodalMediaKind("google/gemini-2.5-flash-lite", "video"),
    ).toBe(true);
    expect(modelSupportsMultimodalMediaKind("unknown/model", "image")).toBe(
      true,
    );
    expect(modelSupportsMultimodalMediaKind("unknown/model", "pdf")).toBe(
      false,
    );
  });

  it("recognizes bounded base64, data URLs, and HTTP URLs without guessing", () => {
    expect(isBase64Payload("c2FmZQ==")).toBe(true);
    expect(isBase64Payload("c2 Fm\nZQ==")).toBe(true);
    expect(isBase64Payload("")).toBe(false);
    expect(isBase64Payload("abc")).toBe(false);
    expect(isBase64Payload("%%%%")).toBe(false);
    expect(
      isBase64Payload(
        "A".repeat(Math.ceil(MAX_MULTIMODAL_MEDIA_BYTES / 3) * 4 + 5),
      ),
    ).toBe(false);

    expect(isHttpUrl("http://example.com/file")).toBe(true);
    expect(isHttpUrl("https://example.com/file")).toBe(true);
    expect(isHttpUrl("ftp://example.com/file")).toBe(false);
    expect(isHttpUrl("not a url")).toBe(false);
    expect(isDataUrl("data:image/png;charset=binary;base64,AAAA")).toBe(true);
    expect(isDataUrl("data:image/png,AAAA")).toBe(false);
  });

  it("detects public-address boundaries across reserved IPv4 and IPv6 ranges", () => {
    for (const address of [
      "192.0.2.1",
      "198.18.0.1",
      "198.19.255.255",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "not-an-address",
      "2001:0::1",
      "2001:db8::1",
      "2002::1",
      "64:ff9b:1::1",
      "ff00::1",
    ]) {
      expect(isPublicNetworkAddress(address), address).toBe(false);
    }
  });

  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.0.1",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
  ])("rejects non-public address %s", (address) => {
    expect(isPublicNetworkAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2001:4860:4860::8888"])(
    "accepts public address %s",
    (address) => {
      expect(isPublicNetworkAddress(address)).toBe(true);
    },
  );

  it("rejects untrusted protocols and hosts before network access", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      loadTrustedRemoteMedia({
        url: `http://${TRUSTED_HOST}/document.pdf`,
        mediaType: "application/pdf",
      }),
    ).rejects.toThrow("Remote media URL is not trusted");
    await expect(
      loadTrustedRemoteMedia({
        url: "https://store.public.blob.vercel-storage.com.attacker.example/document.pdf",
        mediaType: "application/pdf",
      }),
    ).rejects.toThrow("Remote media URL is not trusted");

    expect(mocks.dnsLookup).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    "not a url",
    `https://user:password@${TRUSTED_HOST}/document.pdf`,
    `https://${TRUSTED_HOST}:444/document.pdf`,
  ])("rejects malformed or credentialed remote URL %s", async (url) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      loadTrustedRemoteMedia({ url, mediaType: "application/pdf" }),
    ).rejects.toThrow(
      /Invalid remote media URL|Remote media URL is not trusted/,
    );
    expect(mocks.dnsLookup).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails closed when DNS errors or returns no addresses", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    mocks.dnsLookup.mockRejectedValueOnce(new Error("resolver unavailable"));

    await expect(
      loadTrustedRemoteMedia({
        url: TRUSTED_URL,
        mediaType: "application/pdf",
      }),
    ).rejects.toThrow("Remote media host did not resolve");

    mocks.dnsLookup.mockResolvedValueOnce([]);
    await expect(
      loadTrustedRemoteMedia({
        url: TRUSTED_URL,
        mediaType: "application/pdf",
      }),
    ).rejects.toThrow("resolved to a non-public address");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a trusted hostname resolving to a private address", async () => {
    mocks.dnsLookup.mockResolvedValueOnce([
      { address: "127.0.0.1", family: 4 },
    ]);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      loadTrustedRemoteMedia({
        url: TRUSTED_URL,
        mediaType: "application/pdf",
      }),
    ).rejects.toThrow("resolved to a non-public address");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("revalidates every redirect target and blocks a private redirect host", async () => {
    mocks.dnsLookup.mockImplementation(async (hostname: string) =>
      hostname === TRUSTED_HOST
        ? [{ address: "8.8.8.8", family: 4 }]
        : [{ address: "10.0.0.7", family: 4 }],
    );
    const fetchSpy = vi.fn().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          Location:
            "https://redirect.public.blob.vercel-storage.com/private.pdf",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      loadTrustedRemoteMedia({
        url: TRUSTED_URL,
        mediaType: "application/pdf",
      }),
    ).rejects.toThrow("resolved to a non-public address");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(mocks.dnsLookup).toHaveBeenCalledTimes(2);
  });

  it("bounds redirects and rejects redirects without a location", async () => {
    const redirect = () =>
      new Response(null, {
        status: 302,
        headers: { Location: TRUSTED_URL },
      });
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302 }))
      .mockResolvedValue(redirect());
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      loadTrustedRemoteMedia({
        url: TRUSTED_URL,
        mediaType: "application/pdf",
      }),
    ).rejects.toThrow("redirect has no location");

    await expect(
      loadTrustedRemoteMedia({
        url: TRUSTED_URL,
        mediaType: "application/pdf",
      }),
    ).rejects.toThrow("Too many media redirects");
    expect(fetchSpy).toHaveBeenCalledTimes(5);
  });

  it("rejects HTTP failures, missing bodies, and malformed content lengths", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response("failure", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(null, { headers: { "Content-Type": "application/pdf" } }),
      )
      .mockResolvedValueOnce(
        new Response(PDF_BYTES, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Length": "not-a-number",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      loadTrustedRemoteMedia({
        url: TRUSTED_URL,
        mediaType: "application/pdf",
      }),
    ).rejects.toThrow("status 503");
    await expect(
      loadTrustedRemoteMedia({
        url: TRUSTED_URL,
        mediaType: "application/pdf",
      }),
    ).rejects.toThrow("response is empty");
    await expect(
      loadTrustedRemoteMedia({
        url: TRUSTED_URL,
        mediaType: "application/pdf",
      }),
    ).rejects.toThrow("invalid content length");
  });

  it.each([-1, 1.5, Number.NaN, MAX_MULTIMODAL_MEDIA_BYTES + 1])(
    "rejects invalid attachment size metadata %s before network access",
    async (expectedSize) => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      await expect(
        loadTrustedRemoteMedia({
          url: TRUSTED_URL,
          mediaType: "application/pdf",
          expectedSize,
        }),
      ).rejects.toThrow("Invalid attachment size metadata");
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("rejects oversized metadata and response content length without reading a body", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(PDF_BYTES, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(MAX_MULTIMODAL_MEDIA_BYTES + 1),
        },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      loadTrustedRemoteMedia({
        url: TRUSTED_URL,
        mediaType: "application/pdf",
        expectedSize: MAX_MULTIMODAL_MEDIA_BYTES + 1,
      }),
    ).rejects.toThrow("Invalid attachment size metadata");
    expect(fetchSpy).not.toHaveBeenCalled();

    await expect(
      loadTrustedRemoteMedia({
        url: TRUSTED_URL,
        mediaType: "application/pdf",
      }),
    ).rejects.toThrow("response size does not match");
  });

  it("caps a streaming response even when content length is absent", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(PDF_BYTES);
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(body, {
          headers: { "Content-Type": "application/pdf" },
        }),
      ),
    );

    await expect(
      loadTrustedRemoteMedia({
        url: TRUSTED_URL,
        mediaType: "application/pdf",
        expectedSize: PDF_BYTES.byteLength - 1,
      }),
    ).rejects.toThrow("Remote media exceeds size limit");
  });

  it("aborts a remote media download after the fixed timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_input: RequestInfo | URL, init?: RequestInit) =>
          await new Promise<Response>((_resolve, reject) => {
            if (init?.signal?.aborted) {
              reject(new DOMException("aborted", "AbortError"));
              return;
            }
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          }),
      ),
    );

    const download = loadTrustedRemoteMedia({
      url: TRUSTED_URL,
      mediaType: "application/pdf",
    });
    const rejection = expect(download).rejects.toThrow(
      "Remote media download timed out",
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
  });

  it("aborts remote media conversion with the caller request signal", async () => {
    const abortController = new AbortController();
    const abortError = new Error("request aborted");
    const fetchSpy = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(init.signal.reason);
            return;
          }
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const conversion = toOpenRouterMessages(
      "system",
      remoteImageMessages(),
      abortController.signal,
    );
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    abortController.abort(abortError);

    await expect(conversion).rejects.toBe(abortError);
    expect(fetchSpy.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("bounds DNS resolution with the same remote media timeout", async () => {
    vi.useFakeTimers();
    mocks.dnsLookup.mockReturnValueOnce(new Promise(() => undefined));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const download = loadTrustedRemoteMedia({
      url: TRUSTED_URL,
      mediaType: "application/pdf",
    });
    const rejection = expect(download).rejects.toThrow(
      "Remote media download timed out",
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("requires exact response MIME, byte count, and magic signature", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(PDF_BYTES, {
          headers: { "Content-Type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from("not a pdf"), {
          headers: { "Content-Type": "application/pdf" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(PDF_BYTES, {
          headers: {
            "Content-Type": "application/pdf; charset=binary",
            "Content-Length": String(PDF_BYTES.byteLength),
          },
        }),
      );
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      loadTrustedRemoteMedia({
        url: TRUSTED_URL,
        mediaType: "application/pdf",
      }),
    ).rejects.toThrow("response type does not match");
    await expect(
      loadTrustedRemoteMedia({
        url: TRUSTED_URL,
        mediaType: "application/pdf",
      }),
    ).rejects.toThrow("content does not match declared type");
    await expect(
      loadTrustedRemoteMedia({
        url: TRUSTED_URL,
        mediaType: "application/pdf",
        expectedSize: PDF_BYTES.byteLength,
      }),
    ).resolves.toEqual(new Uint8Array(PDF_BYTES));
  });

  it("embeds a remote image only after downloading and validating it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JPEG_BYTES, {
          headers: {
            "Content-Type": "image/jpeg",
            "Content-Length": String(JPEG_BYTES.byteLength),
          },
        }),
      ),
    );

    await expect(
      toOpenRouterMessages("system", remoteImageMessages()),
    ).resolves.toEqual([
      { role: "system", content: "system" },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${JPEG_BYTES.toString("base64")}`,
            },
          },
        ],
      },
    ]);
  });

  it("rejects spoofed remote image MIME and magic bytes", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JPEG_BYTES, {
          headers: { "Content-Type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from("not an image"), {
          headers: { "Content-Type": "image/jpeg" },
        }),
      );
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      toOpenRouterMessages("system", remoteImageMessages()),
    ).rejects.toThrow("response type does not match");
    await expect(
      toOpenRouterMessages(
        "system",
        remoteImageMessages(Buffer.byteLength("not an image")),
      ),
    ).rejects.toThrow("content does not match declared type");
  });

  it("rejects an oversized remote image before consuming its body", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JPEG_BYTES, {
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Length": String(MAX_MULTIMODAL_MEDIA_BYTES + 1),
        },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      toOpenRouterMessages("system", remoteImageMessages()),
    ).rejects.toThrow("response size does not match");
  });

  it("normalizes only bounded inline media matching canonical MIME, size, and signature", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const jpegBase64 = jpeg.toString("base64");

    expect(
      normalizeInlineMediaBase64({
        data: `data:image/jpeg;base64,${jpegBase64}`,
        mediaType: "image/jpeg",
        expectedSize: jpeg.byteLength,
      }),
    ).toBe(jpegBase64);
    expect(() =>
      normalizeInlineMediaBase64({
        data: `data:image/png;base64,${jpegBase64}`,
        mediaType: "image/jpeg",
        expectedSize: jpeg.byteLength,
      }),
    ).toThrow("type does not match");
    expect(() =>
      normalizeInlineMediaBase64({
        data: Buffer.from("plain text").toString("base64"),
        mediaType: "image/jpeg",
      }),
    ).toThrow("content does not match");
    expect(() =>
      normalizeInlineMediaBase64({
        data: jpegBase64,
        mediaType: "image/jpeg",
        expectedSize: jpeg.byteLength + 1,
      }),
    ).toThrow("size does not match");
  });

  it.each([
    [
      "image/png",
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ],
    ["image/gif", Buffer.from("GIF87a")],
    ["image/gif", Buffer.from("GIF89a")],
    ["image/webp", Buffer.from("RIFF0000WEBP")],
    ["image/bmp", Buffer.from("BM")],
    ["audio/mpeg", Buffer.from("ID3")],
    ["audio/mpeg", Buffer.from([0xff, 0xe0])],
    ["audio/wav", Buffer.from("RIFF0000WAVE")],
    ["audio/ogg", Buffer.from("OggS")],
    ["audio/webm", Buffer.from([0x1a, 0x45, 0xdf, 0xa3])],
    ["audio/aac", Buffer.from([0xff, 0xf0])],
    ["audio/flac", Buffer.from("fLaC")],
    ["audio/mp4", Buffer.from("0000ftyp")],
    ["audio/x-m4a", Buffer.from("0000ftyp")],
    ["video/mp4", Buffer.from("0000ftyp")],
    ["video/quicktime", Buffer.from("0000ftyp")],
    ["video/mov", Buffer.from("0000ftyp")],
    ["video/3gpp", Buffer.from("0000ftyp")],
    ["video/webm", Buffer.from([0x1a, 0x45, 0xdf, 0xa3])],
    ["video/avi", Buffer.from("RIFF0000AVI ")],
    ["video/x-msvideo", Buffer.from("RIFF0000AVI ")],
    ["video/x-flv", Buffer.from("FLV")],
    [
      "video/wmv",
      Buffer.from([0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11]),
    ],
    [
      "video/x-ms-wmv",
      Buffer.from([0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11]),
    ],
    ["video/mpeg", Buffer.from([0x00, 0x00, 0x01, 0xba])],
    ["video/mpg", Buffer.from([0x00, 0x00, 0x01, 0xb3])],
  ])("validates the declared %s magic signature", (mediaType, bytes) => {
    const base64 = bytes.toString("base64");
    expect(normalizeInlineMediaBase64({ data: base64, mediaType })).toBe(
      base64,
    );
  });

  it("rejects empty and oversized byte payloads before provider conversion", async () => {
    const messages = (bytes: Uint8Array) =>
      [
        {
          role: "user",
          content: [
            {
              type: "file",
              data: bytes,
              mediaType: "application/pdf",
            },
          ],
        },
      ] as never;

    await expect(
      toOpenRouterMessages("system", messages(new Uint8Array())),
    ).rejects.toThrow("Media payload is empty");
    await expect(
      toOpenRouterMessages(
        "system",
        messages(new Uint8Array(MAX_MULTIMODAL_MEDIA_BYTES + 1)),
      ),
    ).rejects.toThrow("Media payload exceeds size limit");
  });

  it("reports supported media only for valid file parts and model capabilities", () => {
    const messages = [
      { role: "system", content: "not parts" },
      {
        role: "user",
        content: [
          null,
          { type: "text", text: "hello" },
          { type: "file", mediaType: 42 },
          { type: "file", mediaType: "audio/mpeg" },
          { type: "file", mediaType: "application/pdf" },
        ],
      },
    ] as never;

    expect(hasSupportedOpenRouterMedia(messages, "unknown/model")).toBe(false);
    expect(
      hasSupportedOpenRouterMedia(messages, "google/gemini-2.5-flash-lite"),
    ).toBe(true);
  });

  it("filters invalid message parts while preserving text and inline files", async () => {
    const pdf = Buffer.from("%PDF-1.7 safe");
    const video = Buffer.from("0000ftyp");

    await expect(
      toOpenRouterMessages("system", [
        { role: "system", content: "ignored duplicate system" },
        { role: "tool", content: [] },
        { role: "assistant", content: 42 },
        {
          role: "user",
          content: [
            null,
            "invalid",
            { type: "text", text: 42 },
            { type: "text", text: "hello" },
            { type: "file", mediaType: "application/pdf" },
            {
              type: "file",
              mediaType: "application/pdf",
              data: pdf,
              name: "notes.pdf",
            },
            {
              type: "file",
              mediaType: "video/mp4",
              data: video,
              name: "   ",
            },
          ],
        },
      ] as never),
    ).resolves.toEqual([
      { role: "system", content: "system" },
      { role: "assistant", content: "" },
      {
        role: "user",
        content: [
          { type: "text", text: "hello" },
          {
            type: "file",
            file: {
              filename: "notes.pdf",
              file_data: `data:application/pdf;base64,${pdf.toString("base64")}`,
            },
          },
          {
            type: "file",
            file: {
              filename: "video",
              file_data: `data:video/mp4;base64,${video.toString("base64")}`,
            },
          },
        ],
      },
    ]);
  });

  it.each([-1, 1.5, Number.NaN, MAX_MULTIMODAL_MEDIA_BYTES + 1, "4"])(
    "rejects invalid message media size metadata %s",
    async (size) => {
      await expect(
        toOpenRouterMessages("system", [
          {
            role: "user",
            content: [
              {
                type: "file",
                mediaType: "application/pdf",
                data: PDF_BYTES,
                size,
              },
            ],
          },
        ] as never),
      ).rejects.toThrow("Invalid media size metadata");
    },
  );

  it("requires an SVG root after an optional XML declaration and comments", () => {
    const svg = Buffer.from(
      '<?xml version="1.0"?><!-- safe --><svg xmlns="http://www.w3.org/2000/svg"></svg>',
    );
    const xmlOnly = Buffer.from(
      '<?xml version="1.0"?><!-- not svg --><html></html>',
    );

    expect(
      normalizeInlineMediaBase64({
        data: svg.toString("base64"),
        mediaType: "image/svg+xml",
        expectedSize: svg.byteLength,
      }),
    ).toBe(svg.toString("base64"));
    expect(() =>
      normalizeInlineMediaBase64({
        data: xmlOnly.toString("base64"),
        mediaType: "image/svg+xml",
        expectedSize: xmlOnly.byteLength,
      }),
    ).toThrow("content does not match declared type");
  });
});
