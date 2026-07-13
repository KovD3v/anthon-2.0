import { del, get, put } from "@vercel/blob";

const PRIVATE_BLOB_HOST_SUFFIX = ".private.blob.vercel-storage.com";
const VOICE_PATH_PREFIX = "voice/";

export class VoiceBlobConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceBlobConfigurationError";
  }
}

function getPrivateVoiceBlobToken(): string {
  const token = process.env.VOICE_BLOB_READ_WRITE_TOKEN?.trim();

  if (!token) {
    throw new VoiceBlobConfigurationError(
      "VOICE_BLOB_READ_WRITE_TOKEN must point to the dedicated private voice Blob store",
    );
  }

  return token;
}

function assertVoicePathname(pathname: string): void {
  if (!pathname.startsWith(VOICE_PATH_PREFIX)) {
    throw new VoiceBlobConfigurationError(
      "Private voice blobs must use the voice/ pathname prefix",
    );
  }
}

/**
 * Returns whether a persisted URL belongs to a private Vercel Blob store.
 *
 * The application stores raw URLs only server-side. This validation also keeps
 * the dedicated voice-store token from ever being sent to a non-Vercel host.
 */
export function isPrivateVoiceBlobUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.protocol === "https:" &&
      parsedUrl.hostname.endsWith(PRIVATE_BLOB_HOST_SUFFIX) &&
      parsedUrl.pathname.startsWith(`/${VOICE_PATH_PREFIX}`)
    );
  } catch {
    return false;
  }
}

function assertPrivateVoiceBlobUrl(url: string): void {
  if (!isPrivateVoiceBlobUrl(url)) {
    throw new VoiceBlobConfigurationError(
      "Voice blob URL must belong to the configured private Vercel Blob store",
    );
  }
}

function getPrivateVoiceBlobPathname(url: string): string {
  assertPrivateVoiceBlobUrl(url);
  return new URL(url).pathname.slice(1);
}

export async function putPrivateVoiceBlob(
  pathname: string,
  body: Parameters<typeof put>[1],
) {
  assertVoicePathname(pathname);

  return put(pathname, body, {
    access: "private",
    token: getPrivateVoiceBlobToken(),
    contentType: "audio/mpeg",
    addRandomSuffix: true,
    // Keep the server-side private-store cache short. Browser responses are
    // separately marked no-store by the authorized delivery route.
    cacheControlMaxAge: 60,
  });
}

export async function getPrivateVoiceBlob(
  url: string,
  options?: {
    range?: string | null;
    ifNoneMatch?: string | null;
  },
) {
  const pathname = getPrivateVoiceBlobPathname(url);

  // Resolve the URL again from the dedicated token instead of fetching the
  // persisted host directly. This keeps a database value from directing the
  // voice credential to another store, even within Vercel's Blob domain.
  return get(pathname, {
    access: "private",
    token: getPrivateVoiceBlobToken(),
    ifNoneMatch: options?.ifNoneMatch ?? undefined,
    // @vercel/blob forwards these SDK headers to the authenticated store. It
    // has no dedicated Range option, so this preserves media seek semantics.
    headers: options?.range ? { Range: options.range } : undefined,
  });
}

/**
 * Delete a private voice object with the dedicated voice-store credential.
 * Callers intentionally receive the provider error but never log the URL or
 * token; cleanup can retain the database row for a later retry.
 */
export async function deletePrivateVoiceBlob(url: string): Promise<void> {
  await del(getPrivateVoiceBlobPathname(url), {
    token: getPrivateVoiceBlobToken(),
  });
}
