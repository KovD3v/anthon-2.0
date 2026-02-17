import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mammothExtractRawText: vi.fn(),
  pdfParse: vi.fn(),
}));

vi.mock("mammoth", () => ({
  default: {
    extractRawText: mocks.mammothExtractRawText,
  },
}));

vi.mock("pdf-parse", () => ({
  default: mocks.pdfParse,
}));

import { chunkText, parseDocument } from "./parser";

describe("rag/parser advanced", () => {
  beforeEach(() => {
    mocks.mammothExtractRawText.mockReset();
    mocks.pdfParse.mockReset();
  });

  it("parses DOCX by MIME type", async () => {
    mocks.mammothExtractRawText.mockResolvedValue({ value: "docx body" });

    const result = await parseDocument(
      Buffer.from("fake-docx"),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "file.bin",
    );

    expect(mocks.mammothExtractRawText).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ content: "docx body" });
  });

  it("parses PDF by extension and extracts metadata/headings", async () => {
    mocks.pdfParse.mockResolvedValue({
      text: "INTRODUCTION\n1. Scope\nNotes:",
      numpages: 3,
      info: { Title: "Spec", Author: "Team" },
    });

    const result = await parseDocument(
      Buffer.from("fake-pdf"),
      "application/octet-stream",
      "spec.pdf",
    );

    expect(mocks.pdfParse).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      content: "INTRODUCTION\n1. Scope\nNotes:",
      metadata: {
        pageCount: 3,
        title: "Spec",
        author: "Team",
        headings: ["INTRODUCTION", "1. Scope", "Notes"],
      },
    });
  });

  it("chunkText returns one chunk for small input", () => {
    const chunks = chunkText("short text", { chunkSize: 100 });

    expect(chunks).toEqual(["short text"]);
  });

  it("chunkText prefers sentence boundaries when splitting", () => {
    const text = "First sentence. Second sentence? Third sentence! Fourth one.";
    const chunks = chunkText(text, {
      chunkSize: 24,
      chunkOverlap: 0,
      deduplicate: false,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toContain("First sentence");
  });

  it("chunkText deduplicates repeated chunks", () => {
    const repeated = "AAA BBB CCC.\n\nAAA BBB CCC.\n\nAAA BBB CCC.";

    const deduped = chunkText(repeated, {
      chunkSize: 20,
      chunkOverlap: 0,
      deduplicate: true,
    });
    const raw = chunkText(repeated, {
      chunkSize: 20,
      chunkOverlap: 0,
      deduplicate: false,
    });

    expect(raw.length).toBeGreaterThan(1);
    expect(deduped).toEqual(["AAA BBB CCC."]);
  });
});
