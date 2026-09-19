import { DefaultChatTransport, type UIMessage } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/types/chat";
import {
  convertToUIMessages,
  extractTextFromParts,
  hasPendingVoiceGeneration,
  hasPersistedAssistantResponseForClientMessage,
  normalizeFilePartForPreview,
  prepareChatRequest,
} from "./chat-client";

describe("chat-client", () => {
  it.each(["submit-message", "regenerate-message"] as const)(
    "sends only the current turn for %s, preserving retry identity and attachments",
    async (trigger) => {
      const fetch = vi.fn().mockResolvedValue(new Response("data: [DONE]\n\n"));
      const transport = new DefaultChatTransport({
        api: "/api/chat",
        body: { chatId: "chat-1" },
        prepareSendMessagesRequest: prepareChatRequest,
        fetch,
      });
      const latest = {
        id: "current-user",
        role: "user" as const,
        parts: [
          { type: "text" as const, text: "New prompt" },
          {
            type: "file" as const,
            attachmentId: "owned-file",
            mediaType: "image/png",
            url: "/api/attachments/owned-file",
          },
        ],
      };
      const history = Array.from({ length: 1000 }, (_, index) => ({
        id: `old-${index}`,
        role: "assistant" as const,
        parts: [
          { type: "text" as const, text: "Never upload this old answer" },
        ],
      }));
      await transport.sendMessages({
        trigger,
        chatId: "chat-1",
        messageId: latest.id,
        messages: [...history, latest],
        abortSignal: undefined,
        body: { retry: true },
      });
      const payload = JSON.parse(fetch.mock.calls[0][1].body);
      expect(payload).toEqual({
        chatId: "chat-1",
        id: "chat-1",
        trigger,
        messageId: latest.id,
        retry: true,
        messages: [latest],
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      expect(fetch.mock.calls[0][1].body).not.toContain("old answer");
    },
  );

  it("converts messages with explicit parts and usage metadata", () => {
    const messages: ChatMessage[] = [
      {
        id: "m1",
        sourceClientMessageId: "client-turn-1",
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
        feedback: -1,
        feedbackReason: "wrong_fact",
      },
    ];

    const result = convertToUIMessages(messages);

    type ExtMsg = UIMessage & {
      createdAt?: Date;
      annotations?: unknown[];
      attachments?: unknown[];
    };
    const msg0 = result[0] as ExtMsg | undefined;
    expect(result).toHaveLength(1);
    expect(msg0?.id).toBe("m1");
    expect(result[0]?.sourceClientMessageId).toBe("client-turn-1");
    expect(msg0?.parts).toEqual([{ type: "text", text: "Hello" }]);
    expect(msg0?.createdAt).toEqual(new Date("2026-02-16T10:00:00.000Z"));
    expect(msg0?.annotations).toEqual([
      {
        inputTokens: 10,
        outputTokens: 20,
        cost: 0.01,
      },
    ]);
    expect(msg0?.attachments).toEqual(messages[0]?.attachments);
    expect(result[0]?.feedback).toBe(-1);
    expect(result[0]?.feedbackReason).toBe("wrong_fact");
  });

  it("detects persisted pending and processing voice jobs after reconnect", () => {
    expect(
      hasPendingVoiceGeneration([
        { voice: { status: "READY" } },
        { voice: { status: "PENDING" } },
      ]),
    ).toBe(true);
    expect(
      hasPendingVoiceGeneration([{ voice: { status: "PROCESSING" } }]),
    ).toBe(true);
    expect(
      hasPendingVoiceGeneration([
        { voice: { status: "READY" } },
        { voice: { status: "FAILED", errorCode: "EXPIRED" } },
      ]),
    ).toBe(false);
  });

  it("recognizes an assistant response persisted for a failed client turn", () => {
    const messages = convertToUIMessages([
      {
        id: "persisted-user",
        clientMessageId: "client-turn-1",
        role: "user",
        content: "Domanda",
        parts: [{ type: "text", text: "Domanda" }],
        createdAt: "2026-02-16T10:02:00.000Z",
      },
      {
        id: "persisted-assistant",
        sourceClientMessageId: "client-turn-1",
        role: "assistant",
        content: "Risposta già salvata",
        parts: [{ type: "text", text: "Risposta già salvata" }],
        createdAt: "2026-02-16T10:02:01.000Z",
      },
    ]);

    expect(
      hasPersistedAssistantResponseForClientMessage(messages, "client-turn-1"),
    ).toBe(true);
    expect(
      hasPersistedAssistantResponseForClientMessage(messages, "client-turn-2"),
    ).toBe(false);
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

    type ExtMsg = UIMessage & { annotations?: unknown[] };
    expect(result[0]?.parts).toEqual([{ type: "text", text: "Fallback text" }]);
    expect(result[1]?.parts).toEqual([{ type: "text", text: "" }]);
    expect((result[0] as ExtMsg | undefined)?.annotations).toBeUndefined();
  });

  it("extracts only text from parts", () => {
    const parts = [
      { type: "text", text: "Hi " },
      {
        type: "file",
        data: "ignored",
        mediaType: "image",
      },
      { type: "text", text: "there" },
    ] as unknown as UIMessage["parts"];

    expect(extractTextFromParts(parts)).toBe("Hi there");
    expect(extractTextFromParts(undefined)).toBe("");
  });

  it("normalizes uploaded and streamed file parts for previews", () => {
    expect(
      normalizeFilePartForPreview({
        type: "file",
        data: "data:audio",
        mimeType: "audio/mpeg",
        name: "voice.mp3",
        size: 12,
        attachmentId: "att-1",
      }),
    ).toEqual({
      src: "data:audio",
      mimeType: "audio/mpeg",
      name: "voice.mp3",
      size: 12,
      attachmentId: "att-1",
    });

    expect(
      normalizeFilePartForPreview({
        type: "file",
        url: "https://blob.example/voice.mp3",
        mediaType: "audio/mpeg",
      }),
    ).toEqual({
      src: "https://blob.example/voice.mp3",
      mimeType: "audio/mpeg",
      name: "Allegato",
      size: 0,
      attachmentId: undefined,
    });

    expect(normalizeFilePartForPreview({ type: "text", text: "nope" })).toBe(
      null,
    );
  });
});
