import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/types/chat";
import { convertToUIMessages, extractTextFromParts } from "./chat-client";

describe("chat-client", () => {
  it("converts messages with explicit parts and usage metadata", () => {
    const messages: ChatMessage[] = [
      {
        id: "m1",
        role: "assistant",
        content: "fallback",
        parts: [{ type: "text", text: "Hello" }],
        createdAt: "2026-02-16T10:00:00.000Z",
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          cost: 0.01,
        },
        attachments: [
          {
            id: "a1",
            name: "file.txt",
            contentType: "text/plain",
            size: 10,
            blobUrl: "https://example.com/file.txt",
          },
        ],
      },
    ];

    const result = convertToUIMessages(messages);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("m1");
    expect(result[0]?.parts).toEqual([{ type: "text", text: "Hello" }]);
    expect(result[0]?.createdAt).toEqual(new Date("2026-02-16T10:00:00.000Z"));
    expect(result[0]?.annotations).toEqual([
      {
        inputTokens: 10,
        outputTokens: 20,
        cost: 0.01,
      },
    ]);
    expect(result[0]?.attachments).toEqual(messages[0]?.attachments);
  });

  it("falls back to content text part when parts are missing", () => {
    const messages: ChatMessage[] = [
      {
        id: "m2",
        role: "user",
        content: "Fallback text",
        parts: undefined,
        createdAt: "2026-02-16T10:05:00.000Z",
      },
      {
        id: "m3",
        role: "user",
        content: null,
        parts: undefined,
        createdAt: "2026-02-16T10:06:00.000Z",
      },
    ];

    const result = convertToUIMessages(messages);

    expect(result[0]?.parts).toEqual([{ type: "text", text: "Fallback text" }]);
    expect(result[1]?.parts).toEqual([{ type: "text", text: "" }]);
    expect(result[0]?.annotations).toBeUndefined();
  });

  it("extracts only text from parts", () => {
    const parts = [
      { type: "text", text: "Hi " },
      { type: "image", image: "ignored" },
      { type: "text", text: "there" },
    ] as unknown as UIMessage["parts"];

    expect(extractTextFromParts(parts)).toBe("Hi there");
    expect(extractTextFromParts(undefined)).toBe("");
  });
});
