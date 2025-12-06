/**
 * RAG Document Parser
 * Parses PDF, DOCX, TXT, and MD files into text
 */

import mammoth from "mammoth";

export interface ParsedDocument {
  content: string;
  metadata?: {
    pageCount?: number;
    title?: string;
  };
}

/**
 * Parse a file buffer based on its MIME type
 */
export async function parseDocument(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<ParsedDocument> {
  if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
    return parsePDF(buffer);
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.endsWith(".docx")
  ) {
    return parseDOCX(buffer);
  }

  if (
    mimeType === "text/plain" ||
    mimeType === "text/markdown" ||
    fileName.endsWith(".txt") ||
    fileName.endsWith(".md")
  ) {
    return parsePlainText(buffer);
  }

  throw new Error(`Unsupported file type: ${mimeType}`);
}

/**
 * Parse PDF file using pdf-parse v1
 * Dynamic import to avoid the test file loading issue
 */
async function parsePDF(buffer: Buffer): Promise<ParsedDocument> {
  // Dynamic import to avoid pdf-parse trying to load test files at module load
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);

  return {
    content: data.text,
    metadata: {
      pageCount: data.numpages,
      title: data.info?.Title,
    },
  };
}

/**
 * Parse DOCX file
 */
async function parseDOCX(buffer: Buffer): Promise<ParsedDocument> {
  const result = await mammoth.extractRawText({ buffer });
  return {
    content: result.value,
  };
}

/**
 * Parse plain text (TXT, MD)
 */
function parsePlainText(buffer: Buffer): ParsedDocument {
  return {
    content: buffer.toString("utf-8"),
  };
}

/**
 * Split text into chunks for embedding
 */
export function chunkText(
  text: string,
  options: {
    chunkSize?: number;
    chunkOverlap?: number;
  } = {},
): string[] {
  const { chunkSize = 1000, chunkOverlap = 200 } = options;

  // Clean up text
  const cleanText = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const chunks: string[] = [];
  let start = 0;

  while (start < cleanText.length) {
    let end = start + chunkSize;

    // Try to break at paragraph or sentence boundary
    if (end < cleanText.length) {
      // Look for paragraph break
      const paragraphBreak = cleanText.lastIndexOf("\n\n", end);
      if (paragraphBreak > start + chunkSize / 2) {
        end = paragraphBreak;
      } else {
        // Look for sentence break
        const sentenceBreak = cleanText.lastIndexOf(". ", end);
        if (sentenceBreak > start + chunkSize / 2) {
          end = sentenceBreak + 1;
        }
      }
    }

    const chunk = cleanText.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    start = end - chunkOverlap;
    if (start <= chunks.length - 1 && start < 0) {
      start = end;
    }
  }

  return chunks;
}

/**
 * Get supported MIME types
 */
export const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
];

export const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];

/**
 * Validate file type
 */
export function isValidFileType(mimeType: string, fileName: string): boolean {
  if (SUPPORTED_MIME_TYPES.includes(mimeType)) {
    return true;
  }

  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  return SUPPORTED_EXTENSIONS.includes(ext);
}
