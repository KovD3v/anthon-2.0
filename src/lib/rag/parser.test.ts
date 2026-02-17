import { describe, expect, it } from "vitest";
import { isValidFileType, parseDocument } from "./parser";

describe("rag/parser", () => {
  describe("isValidFileType", () => {
    it("accepts supported MIME types", () => {
      expect(isValidFileType("application/pdf", "any.bin")).toBe(true);
      expect(isValidFileType("text/plain", "any.bin")).toBe(true);
      expect(isValidFileType("text/markdown", "any.bin")).toBe(true);
    });

    it("accepts supported extensions case-insensitively", () => {
      expect(isValidFileType("application/octet-stream", "file.PDF")).toBe(
        true,
      );
      expect(isValidFileType("application/octet-stream", "file.Docx")).toBe(
        true,
      );
      expect(isValidFileType("application/octet-stream", "file.MD")).toBe(true);
    });

    it("rejects unsupported MIME type and extension", () => {
      expect(isValidFileType("application/octet-stream", "archive.zip")).toBe(
        false,
      );
    });
  });

  describe("parseDocument", () => {
    it("parses plain text by MIME type", async () => {
      const result = await parseDocument(
        Buffer.from("hello world"),
        "text/plain",
        "notes.bin",
      );

      expect(result).toEqual({
        content: "hello world",
      });
    });

    it("parses markdown/txt by file extension", async () => {
      const result = await parseDocument(
        Buffer.from("# title"),
        "application/octet-stream",
        "guide.md",
      );

      expect(result).toEqual({
        content: "# title",
      });
    });

    it("throws for unsupported file type", async () => {
      await expect(
        parseDocument(
          Buffer.from("data"),
          "application/octet-stream",
          "archive.zip",
        ),
      ).rejects.toThrow("Unsupported file type: application/octet-stream");
    });
  });
});
