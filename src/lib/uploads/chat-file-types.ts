const CHAT_ATTACHMENT_EXTENSIONS = [
  // Images (HEIC/HEIF are intentionally excluded because they are not supported).
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "bmp",
  // Documents
  "pdf",
  "doc",
  "docx",
  "txt",
  // Audio
  "mp3",
  "wav",
  "ogg",
  "aac",
  "flac",
  "m4a",
  // Video
  "mp4",
  "mpeg",
  "mpg",
  "webm",
  "mov",
  "avi",
  "flv",
  "wmv",
  "3gp",
  "3gpp",
] as const;

const CHAT_ATTACHMENT_EXTENSION_SET = new Set<string>(
  CHAT_ATTACHMENT_EXTENSIONS,
);

/**
 * Explicit extensions keep unsupported formats disabled in native file pickers.
 * Do not replace the image entries with `image/*`: that also enables HEIC/HEIF.
 */
export const CHAT_ATTACHMENT_ACCEPT = CHAT_ATTACHMENT_EXTENSIONS.map(
  (extension) => `.${extension}`,
).join(",");

export function isSupportedChatAttachment(fileName: string): boolean {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return Boolean(extension && CHAT_ATTACHMENT_EXTENSION_SET.has(extension));
}
