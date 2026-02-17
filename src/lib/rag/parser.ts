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
    author?: string;
    headings?: string[];
  };
}

/**
 * Simple hash function for deduplication.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

/**
 * Extract headings from text content.
 * Detects lines that look like headers (ALL CAPS, ending with colon, or short lines followed by content).
 */
function extractHeadings(text: string): string[] {
  const lines = text.split("\n");
  const headings: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 100) continue;

    // Check for ALL CAPS lines (likely headings)
    if (
      trimmed === trimmed.toUpperCase() &&
      /[A-Z]/.test(trimmed) &&
      trimmed.length > 3
    ) {
      headings.push(trimmed);
      continue;
    }

    // Check for lines ending with colon (section headers)
    if (trimmed.endsWith(":") && trimmed.length < 60) {
      headings.push(trimmed.slice(0, -1));
      continue;
    }

    // Check for numbered sections (e.g., "1. Introduction", "Chapter 2")
    if (
      /^(\d+\.?|Chapter\s+\d+|Section\s+\d+)/i.test(trimmed) &&
      trimmed.length < 80
    ) {
      headings.push(trimmed);
    }
  }

  return headings.slice(0, 20); // Limit to 20 headings
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

  // Extract headings from content
  const headings = extractHeadings(data.text);

  return {
    content: data.text,
    metadata: {
      pageCount: data.numpages,
      title: data.info?.Title,
      author: data.info?.Author,
      headings: headings.length > 0 ? headings : undefined,
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

export function chunkText(
  text: string,
  options: {
    chunkSize?: number;
    chunkOverlap?: number;
    deduplicate?: boolean;
  } = {},
): string[] {
  const { chunkSize = 1000, chunkOverlap = 200, deduplicate = true } = options;

  // Clean up text
  const cleanText = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Small files: return as single chunk
  if (cleanText.length <= chunkSize) {
    return cleanText.length > 0 ? [cleanText] : [];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < cleanText.length) {
    let end = start + chunkSize;

    // Try to break at natural boundaries (priority: paragraph > sentence > word)
    if (end < cleanText.length) {
      // Look for paragraph break
      const paragraphBreak = cleanText.lastIndexOf("\n\n", end);
      if (paragraphBreak > start + chunkSize / 2) {
        end = paragraphBreak;
      } else {
        // Look for sentence break (. or ? or !)
        let sentenceBreak = cleanText.lastIndexOf(". ", end);
        const questionBreak = cleanText.lastIndexOf("? ", end);
        const exclamationBreak = cleanText.lastIndexOf("! ", end);

        // Find the latest sentence boundary
        sentenceBreak = Math.max(
          sentenceBreak,
          questionBreak,
          exclamationBreak,
        );

        if (sentenceBreak > start + chunkSize / 2) {
          end = sentenceBreak + 1;
        } else {
          // Fall back to word boundary
          const wordBreak = cleanText.lastIndexOf(" ", end);
          if (wordBreak > start + chunkSize / 2) {
            end = wordBreak;
          }
        }
      }
    }

    const chunk = cleanText.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    start = end - chunkOverlap;
    // Prevent infinite loop
    if (start <= 0 || start >= cleanText.length) {
      start = end;
    }
  }

  // Deduplication: remove near-duplicate chunks using hash
  if (deduplicate && chunks.length > 1) {
    const seen = new Set<string>();
    return chunks.filter((chunk) => {
      const normalized = chunk.toLowerCase().replace(/\s+/g, " ").trim();
      const hash = simpleHash(normalized);
      if (seen.has(hash)) {
        return false;
      }
      seen.add(hash);
      return true;
    });
  }

  return chunks;
}

/**
 * Get supported MIME types
 */
const SUPPORTED_MIME_TYPES = [
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
