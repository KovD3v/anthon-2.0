import { describe, expect, it } from "vitest";
import { getTextFromParts } from "./message-parts";

describe("getTextFromParts", () => {
  it("returns text from a single text part", () => {
    const parts = [{ type: "text", text: "Hello world" }];
    expect(getTextFromParts(parts)).toBe("Hello world");
  });

  it("returns the first text part when multiple exist", () => {
    const parts = [
      { type: "text", text: "First" },
      { type: "text", text: "Second" },
    ];
    expect(getTextFromParts(parts)).toBe("First");
  });

  it("skips non-text parts and returns the first text part", () => {
    const parts = [
      { type: "image", url: "http://example.com/img.png" },
      { type: "text", text: "Caption" },
    ];
    expect(getTextFromParts(parts)).toBe("Caption");
  });

  it("returns empty string for null", () => {
    expect(getTextFromParts(null)).toBe("");
  });

  it("returns empty string for empty array", () => {
    expect(getTextFromParts([])).toBe("");
  });

  it("returns empty string for non-array", () => {
    expect(getTextFromParts("string")).toBe("");
    expect(getTextFromParts(42)).toBe("");
  });

  it("returns empty string when no text part exists", () => {
    const parts = [{ type: "image", url: "http://example.com/img.png" }];
    expect(getTextFromParts(parts)).toBe("");
  });
});
