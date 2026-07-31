import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { ModelMessage } from "ai";

export type MultimodalMediaKind = "image" | "pdf" | "video";

type OpenRouterTextPart = {
  type: "text";
  text: string;
};

type OpenRouterImagePart = {
  type: "image_url";
  image_url: {
    url: string;
  };
};

type OpenRouterFilePart = {
  type: "file";
  file: {
    filename: string;
    file_data: string;
  };
};

export type OpenRouterContentPart =
  | OpenRouterTextPart
  | OpenRouterImagePart
  | OpenRouterFilePart;

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string | OpenRouterContentPart[];
};

const DEFAULT_MULTIMODAL_MODEL_CAPABILITIES = new Set<MultimodalMediaKind>([
  "image",
]);

const MULTIMODAL_MODEL_CAPABILITIES: Record<
  string,
  ReadonlySet<MultimodalMediaKind>
> = {
  "google/gemini-2.5-flash-lite": new Set(["image", "pdf", "video"]),
};

const VERCEL_BLOB_HOST_SUFFIX = ".blob.vercel-storage.com";
const REMOTE_MEDIA_TIMEOUT_MS = 10_000;
const MAX_REMOTE_REDIRECTS = 3;
export const MAX_MULTIMODAL_MEDIA_BYTES = 10 * 1024 * 1024;
const MAX_BASE64_ENCODED_LENGTH =
  Math.ceil(MAX_MULTIMODAL_MEDIA_BYTES / 3) * 4 + 4;

export class MediaPayloadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaPayloadValidationError";
  }
}

export function normalizeMediaType(mediaType: string) {
  return mediaType.split(";")[0]?.trim().toLowerCase() || mediaType;
}

export function getMultimodalMediaKind(
  mediaType?: string,
): MultimodalMediaKind | null {
  if (!mediaType) {
    return null;
  }

  const normalized = normalizeMediaType(mediaType);
  if (normalized.startsWith("image/")) {
    return "image";
  }

  if (normalized === "application/pdf") {
    return "pdf";
  }

  if (normalized.startsWith("video/")) {
    return "video";
  }

  return null;
}

export function getMultimodalModelCapabilities(modelId: string) {
  return (
    MULTIMODAL_MODEL_CAPABILITIES[modelId] ??
    DEFAULT_MULTIMODAL_MODEL_CAPABILITIES
  );
}

export function modelSupportsMultimodalMediaKind(
  modelId: string,
  mediaKind: MultimodalMediaKind,
) {
  return getMultimodalModelCapabilities(modelId).has(mediaKind);
}

export function isBase64Payload(value: string) {
  // Reject oversized encoded strings before stripping whitespace or decoding,
  // so enforcing the decoded-byte cap cannot itself allocate a huge buffer.
  if (value.length > MAX_BASE64_ENCODED_LENGTH) {
    return false;
  }

  const normalized = value.replace(/\s/g, "");
  if (normalized.length === 0 || normalized.length % 4 !== 0) {
    return false;
  }
  return /^[A-Za-z0-9+/]+={0,2}$/.test(normalized);
}

export function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isDataUrl(value: string) {
  return /^data:[a-z0-9.+-]+\/[a-z0-9.+-]+(?:;[a-z0-9=.+-]+)*;base64,/i.test(
    value,
  );
}

function decodedBase64Size(value: string) {
  const normalized = value.replace(/\s/g, "");
  const padding = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;
  return (normalized.length / 4) * 3 - padding;
}

function decodeBoundedBase64(value: string) {
  if (!isBase64Payload(value)) {
    throw new MediaPayloadValidationError("Invalid base64 media payload");
  }

  if (decodedBase64Size(value) > MAX_MULTIMODAL_MEDIA_BYTES) {
    throw new MediaPayloadValidationError("Media payload exceeds size limit");
  }

  return Buffer.from(value.replace(/\s/g, ""), "base64");
}

function parseDataUrl(value: string, expectedMediaType: string) {
  if (value.length > MAX_BASE64_ENCODED_LENGTH + 256) {
    throw new MediaPayloadValidationError("Media payload exceeds size limit");
  }

  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) {
    throw new MediaPayloadValidationError("Invalid media data URL");
  }

  const metadata = value.slice(5, commaIndex);
  const metadataParts = metadata.split(";");
  const mediaType = normalizeMediaType(metadataParts[0] ?? "");
  const isBase64 = metadataParts.some(
    (part) => part.trim().toLowerCase() === "base64",
  );
  if (!isBase64 || mediaType !== normalizeMediaType(expectedMediaType)) {
    throw new MediaPayloadValidationError(
      "Media data URL type does not match declared type",
    );
  }

  return decodeBoundedBase64(value.slice(commaIndex + 1));
}

function startsWithBytes(
  bytes: Uint8Array,
  expected: readonly number[],
  offset = 0,
) {
  return expected.every((byte, index) => bytes[offset + index] === byte);
}

function startsWithAscii(bytes: Uint8Array, expected: string, offset = 0) {
  return startsWithBytes(
    bytes,
    Array.from(expected, (character) => character.charCodeAt(0)),
    offset,
  );
}

function mediaBytesMatchType(bytes: Uint8Array, mediaType: string) {
  const normalized = normalizeMediaType(mediaType);

  if (normalized === "application/pdf") {
    return startsWithAscii(bytes, "%PDF-");
  }
  if (normalized === "image/jpeg") {
    return startsWithBytes(bytes, [0xff, 0xd8, 0xff]);
  }
  if (normalized === "image/png") {
    return startsWithBytes(
      bytes,
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    );
  }
  if (normalized === "image/gif") {
    return startsWithAscii(bytes, "GIF87a") || startsWithAscii(bytes, "GIF89a");
  }
  if (normalized === "image/webp") {
    return startsWithAscii(bytes, "RIFF") && startsWithAscii(bytes, "WEBP", 8);
  }
  if (normalized === "image/bmp") {
    return startsWithAscii(bytes, "BM");
  }
  if (normalized === "image/svg+xml") {
    const prefix = new TextDecoder()
      .decode(bytes.slice(0, 512))
      .replace(/^\uFEFF/, "")
      .trimStart()
      .replace(/^<\?xml[\s\S]*?\?>\s*/i, "")
      .replace(/^(?:<!--[\s\S]*?-->\s*)+/i, "");
    return /^<svg(?:\s|>)/i.test(prefix);
  }
  if (normalized === "audio/mpeg") {
    return (
      startsWithAscii(bytes, "ID3") ||
      (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)
    );
  }
  if (normalized === "audio/wav") {
    return startsWithAscii(bytes, "RIFF") && startsWithAscii(bytes, "WAVE", 8);
  }
  if (normalized === "audio/ogg") {
    return startsWithAscii(bytes, "OggS");
  }
  if (normalized === "audio/webm") {
    return startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
  }
  if (normalized === "audio/aac") {
    return bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xf6) === 0xf0;
  }
  if (normalized === "audio/flac") {
    return startsWithAscii(bytes, "fLaC");
  }
  if (normalized === "audio/mp4" || normalized === "audio/x-m4a") {
    return startsWithAscii(bytes, "ftyp", 4);
  }
  if (
    normalized === "video/mp4" ||
    normalized === "video/quicktime" ||
    normalized === "video/mov" ||
    normalized === "video/3gpp"
  ) {
    return startsWithAscii(bytes, "ftyp", 4);
  }
  if (normalized === "video/webm") {
    return startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
  }
  if (normalized === "video/avi" || normalized === "video/x-msvideo") {
    return startsWithAscii(bytes, "RIFF") && startsWithAscii(bytes, "AVI ", 8);
  }
  if (normalized === "video/x-flv") {
    return startsWithAscii(bytes, "FLV");
  }
  if (normalized === "video/wmv" || normalized === "video/x-ms-wmv") {
    return startsWithBytes(
      bytes,
      [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11],
    );
  }
  if (normalized === "video/mpeg" || normalized === "video/mpg") {
    return (
      startsWithBytes(bytes, [0x00, 0x00, 0x01, 0xba]) ||
      startsWithBytes(bytes, [0x00, 0x00, 0x01, 0xb3])
    );
  }

  // Media types that reach this path must have an explicit signature rule.
  return false;
}

function assertMediaBytes(
  bytes: Uint8Array,
  mediaType: string,
  expectedSize?: number,
) {
  if (bytes.byteLength === 0) {
    throw new MediaPayloadValidationError("Media payload is empty");
  }
  if (bytes.byteLength > MAX_MULTIMODAL_MEDIA_BYTES) {
    throw new MediaPayloadValidationError("Media payload exceeds size limit");
  }
  if (expectedSize !== undefined && bytes.byteLength !== expectedSize) {
    throw new MediaPayloadValidationError(
      "Media payload size does not match attachment metadata",
    );
  }
  if (!mediaBytesMatchType(bytes, mediaType)) {
    throw new MediaPayloadValidationError(
      "Media content does not match declared type",
    );
  }
}

export function isTrustedVercelBlobHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized.length > VERCEL_BLOB_HOST_SUFFIX.length &&
    normalized.endsWith(VERCEL_BLOB_HOST_SUFFIX)
  );
}

function isPrivateOrReservedIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return true;
  }

  const [a = 0, b = 0] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

export function isPublicNetworkAddress(address: string) {
  const family = isIP(address);
  if (family === 4) {
    return !isPrivateOrReservedIpv4(address);
  }
  if (family !== 6) {
    return false;
  }

  const normalized = address.toLowerCase();
  const firstGroup = Number.parseInt(normalized.split(":")[0] || "0", 16);
  return !(
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("::ffff:") ||
    normalized.startsWith("::") ||
    normalized.startsWith("2001:0:") ||
    normalized.startsWith("2001:db8:") ||
    normalized.startsWith("2002:") ||
    normalized.startsWith("64:ff9b:1:") ||
    (firstGroup >= 0xfc00 && firstGroup <= 0xfdff) ||
    (firstGroup >= 0xfe80 && firstGroup <= 0xfebf) ||
    firstGroup >= 0xff00
  );
}

async function lookupRemoteMediaHost(hostname: string, signal: AbortSignal) {
  if (signal.aborted) {
    throw signal.reason ?? new DOMException("aborted", "AbortError");
  }

  return await new Promise<Array<{ address: string; family: number }>>(
    (resolve, reject) => {
      const onAbort = () =>
        reject(signal.reason ?? new DOMException("aborted", "AbortError"));
      signal.addEventListener("abort", onAbort, { once: true });

      lookup(hostname, { all: true, verbatim: true })
        .then((addresses) => resolve(addresses), reject)
        .finally(() => signal.removeEventListener("abort", onAbort));
    },
  );
}

async function validateRemoteMediaUrl(value: string, signal: AbortSignal) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MediaPayloadValidationError("Invalid remote media URL");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !isTrustedVercelBlobHostname(url.hostname)
  ) {
    throw new MediaPayloadValidationError("Remote media URL is not trusted");
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookupRemoteMediaHost(url.hostname, signal);
  } catch {
    if (signal.aborted) {
      throw signal.reason ?? new DOMException("aborted", "AbortError");
    }
    throw new MediaPayloadValidationError("Remote media host did not resolve");
  }

  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicNetworkAddress(address))
  ) {
    throw new MediaPayloadValidationError(
      "Remote media host resolved to a non-public address",
    );
  }

  return url;
}

async function readBoundedResponseBody(response: Response, byteLimit: number) {
  if (!response.body) {
    throw new MediaPayloadValidationError("Remote media response is empty");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      totalBytes += value.byteLength;
      if (totalBytes > byteLimit) {
        throw new MediaPayloadValidationError(
          "Remote media exceeds size limit",
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }

  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function loadTrustedRemoteMedia({
  url: initialUrl,
  mediaType,
  expectedSize,
  abortSignal,
}: {
  url: string;
  mediaType: string;
  expectedSize?: number;
  abortSignal?: AbortSignal;
}) {
  abortSignal?.throwIfAborted();
  if (
    expectedSize !== undefined &&
    (!Number.isSafeInteger(expectedSize) ||
      expectedSize < 0 ||
      expectedSize > MAX_MULTIMODAL_MEDIA_BYTES)
  ) {
    throw new MediaPayloadValidationError("Invalid attachment size metadata");
  }

  const timeoutController = new AbortController();
  const signal = abortSignal
    ? AbortSignal.any([abortSignal, timeoutController.signal])
    : timeoutController.signal;
  const timeout = setTimeout(
    () => timeoutController.abort(),
    REMOTE_MEDIA_TIMEOUT_MS,
  );
  timeout.unref?.();

  try {
    let currentUrl = initialUrl;
    for (let redirectCount = 0; ; redirectCount += 1) {
      const url = await validateRemoteMediaUrl(currentUrl, signal);
      const response = await fetch(url, {
        cache: "no-store",
        redirect: "manual",
        signal,
        headers: { Accept: normalizeMediaType(mediaType) },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirectCount >= MAX_REMOTE_REDIRECTS) {
          await response.body?.cancel().catch(() => undefined);
          throw new MediaPayloadValidationError("Too many media redirects");
        }
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        if (!location) {
          throw new MediaPayloadValidationError(
            "Remote media redirect has no location",
          );
        }
        currentUrl = new URL(location, url).toString();
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new MediaPayloadValidationError(
          `Remote media download failed with status ${response.status}`,
        );
      }

      const expectedMediaType = normalizeMediaType(mediaType);
      const responseMediaType = normalizeMediaType(
        response.headers.get("content-type") ?? "",
      );
      if (responseMediaType !== expectedMediaType) {
        await response.body?.cancel().catch(() => undefined);
        throw new MediaPayloadValidationError(
          "Remote media response type does not match attachment metadata",
        );
      }

      const contentLengthHeader = response.headers.get("content-length");
      if (contentLengthHeader && !/^\d+$/.test(contentLengthHeader)) {
        await response.body?.cancel().catch(() => undefined);
        throw new MediaPayloadValidationError(
          "Remote media response has invalid content length",
        );
      }
      const contentLength = contentLengthHeader
        ? Number(contentLengthHeader)
        : undefined;
      if (
        contentLength !== undefined &&
        (contentLength > MAX_MULTIMODAL_MEDIA_BYTES ||
          (expectedSize !== undefined && contentLength !== expectedSize))
      ) {
        await response.body?.cancel().catch(() => undefined);
        throw new MediaPayloadValidationError(
          "Remote media response size does not match attachment metadata",
        );
      }

      const bytes = await readBoundedResponseBody(
        response,
        expectedSize ?? MAX_MULTIMODAL_MEDIA_BYTES,
      );
      assertMediaBytes(bytes, expectedMediaType, expectedSize);
      return bytes;
    }
  } catch (error) {
    if (error instanceof MediaPayloadValidationError) {
      throw error;
    }
    if (abortSignal?.aborted) {
      throw abortSignal.reason ?? new DOMException("aborted", "AbortError");
    }
    if (timeoutController.signal.aborted) {
      throw new MediaPayloadValidationError("Remote media download timed out");
    }
    throw new MediaPayloadValidationError("Remote media download failed");
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeInlineMediaBase64({
  data,
  mediaType,
  expectedSize,
}: {
  data: string;
  mediaType: string;
  expectedSize?: number;
}) {
  const bytes = isDataUrl(data)
    ? parseDataUrl(data, mediaType)
    : decodeBoundedBase64(data);
  assertMediaBytes(bytes, mediaType, expectedSize);
  return Buffer.from(bytes).toString("base64");
}

export function hasSupportedOpenRouterMedia(
  messages: ModelMessage[],
  modelId: string,
) {
  return messages.some((message) => {
    if (!Array.isArray(message.content)) {
      return false;
    }

    return message.content.some((part) => {
      if (!part || typeof part !== "object") {
        return false;
      }

      const candidate = part as { type?: unknown; mediaType?: unknown };
      if (
        candidate.type !== "file" ||
        typeof candidate.mediaType !== "string"
      ) {
        return false;
      }

      const mediaKind = getMultimodalMediaKind(candidate.mediaType);
      return mediaKind
        ? modelSupportsMultimodalMediaKind(modelId, mediaKind)
        : false;
    });
  });
}

async function dataUrlFromHttpUrl(
  url: string,
  mediaType: string,
  expectedSize?: number,
  abortSignal?: AbortSignal,
) {
  const bytes = await loadTrustedRemoteMedia({
    url,
    mediaType,
    expectedSize,
    abortSignal,
  });
  return `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
}

function dataUrlFromPayload(
  data: string | Uint8Array,
  mediaType: string,
  expectedSize?: number,
) {
  let bytes: Uint8Array;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (isDataUrl(data)) {
    bytes = parseDataUrl(data, mediaType);
  } else {
    bytes = decodeBoundedBase64(data);
  }

  assertMediaBytes(bytes, mediaType, expectedSize);
  return `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function toOpenRouterFileData(
  data: string | Uint8Array,
  mediaType: string,
  expectedSize?: number,
  abortSignal?: AbortSignal,
) {
  if (typeof data === "string" && isHttpUrl(data)) {
    return dataUrlFromHttpUrl(data, mediaType, expectedSize, abortSignal);
  }

  return dataUrlFromPayload(data, mediaType, expectedSize);
}

function defaultFilename(mediaType: string) {
  const mediaKind = getMultimodalMediaKind(mediaType);
  if (mediaKind === "pdf") {
    return "document.pdf";
  }
  if (mediaKind === "video") {
    return "video";
  }
  return "attachment";
}

async function toOpenRouterContentPart(
  part: unknown,
  abortSignal?: AbortSignal,
): Promise<OpenRouterContentPart | null> {
  abortSignal?.throwIfAborted();
  if (!part || typeof part !== "object") {
    return null;
  }

  const candidate = part as {
    type?: unknown;
    text?: unknown;
    data?: unknown;
    mediaType?: unknown;
    name?: unknown;
    size?: unknown;
  };

  if (candidate.type === "text" && typeof candidate.text === "string") {
    return { type: "text", text: candidate.text };
  }

  if (
    candidate.type !== "file" ||
    typeof candidate.mediaType !== "string" ||
    !(
      typeof candidate.data === "string" || candidate.data instanceof Uint8Array
    )
  ) {
    return null;
  }

  const mediaType = normalizeMediaType(candidate.mediaType);
  const mediaKind = getMultimodalMediaKind(mediaType);
  if (
    candidate.size !== undefined &&
    (typeof candidate.size !== "number" ||
      !Number.isSafeInteger(candidate.size) ||
      candidate.size < 0 ||
      candidate.size > MAX_MULTIMODAL_MEDIA_BYTES)
  ) {
    throw new MediaPayloadValidationError("Invalid media size metadata");
  }
  const expectedSize = candidate.size as number | undefined;

  if (mediaKind === "image" && typeof candidate.data === "string") {
    if (isHttpUrl(candidate.data)) {
      const fileData = await dataUrlFromHttpUrl(
        candidate.data,
        mediaType,
        expectedSize,
        abortSignal,
      );
      return { type: "image_url", image_url: { url: fileData } };
    }
    if (isDataUrl(candidate.data) || isBase64Payload(candidate.data)) {
      const fileData = dataUrlFromPayload(
        candidate.data,
        mediaType,
        expectedSize,
      );
      return { type: "image_url", image_url: { url: fileData } };
    }
  }

  if (mediaKind === "pdf" || mediaKind === "video") {
    const fileData = await toOpenRouterFileData(
      candidate.data,
      mediaType,
      expectedSize,
      abortSignal,
    );

    return {
      type: "file",
      file: {
        filename:
          typeof candidate.name === "string" && candidate.name.trim()
            ? candidate.name
            : defaultFilename(mediaType),
        file_data: fileData,
      },
    };
  }

  return null;
}

async function toOpenRouterContent(
  content: unknown,
  abortSignal?: AbortSignal,
): Promise<string | OpenRouterContentPart[]> {
  abortSignal?.throwIfAborted();
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  const parts: OpenRouterContentPart[] = [];
  for (const part of content) {
    const transformed = await toOpenRouterContentPart(part, abortSignal);
    if (transformed) {
      parts.push(transformed);
    }
  }
  return parts;
}

export async function toOpenRouterMessages(
  systemPrompt: string,
  messages: ModelMessage[],
  abortSignal?: AbortSignal,
): Promise<OpenRouterMessage[]> {
  abortSignal?.throwIfAborted();
  const openRouterMessages: OpenRouterMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") {
      continue;
    }

    openRouterMessages.push({
      role: message.role,
      content: await toOpenRouterContent(message.content, abortSignal),
    });
  }

  return openRouterMessages;
}
