import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dnsLookup: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: mocks.dnsLookup,
}));

import {
  isPublicNetworkAddress,
  isTrustedVercelBlobHostname,
  loadTrustedRemoteMedia,
  MAX_MULTIMODAL_MEDIA_BYTES,
  normalizeInlineMediaBase64,
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
