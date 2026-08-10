import { describe, expect, it } from "vitest";
import {
  CHAT_REACTIVITY_COPY,
  getAssistantMessageDisplayState,
  getAssistantMessageLifecycle,
  getAssistantPendingLabel,
  getAssistantToolFeedback,
  shouldAnimateAssistantMessageMount,
  shouldRenderAssistantPendingRow,
} from "./chat-reactivity-ui";

describe("getAssistantPendingLabel", () => {
  it("keeps one stable pending label while a user message is submitted", () => {
    expect(
      getAssistantPendingLabel({
        status: "submitted",
        latestMessage: {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "ciao" }],
        },
      }),
    ).toBe(CHAT_REACTIVITY_COPY.assistantPreparing);
  });

  it("keeps the same pending label when the submitted wait becomes noticeable", () => {
    expect(
      getAssistantPendingLabel({
        status: "submitted",
        submittedElapsedMs: 700,
        latestMessage: {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "ciao" }],
        },
      }),
    ).toBe(CHAT_REACTIVITY_COPY.assistantPreparing);
  });

  it("keeps showing preparation feedback before assistant text is visible", () => {
    expect(
      getAssistantPendingLabel({
        status: "streaming",
        latestMessage: {
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "text", text: "" }],
        },
      }),
    ).toBe(CHAT_REACTIVITY_COPY.assistantPreparing);
  });

  it("hides pending feedback once assistant text is visible", () => {
    expect(
      getAssistantPendingLabel({
        status: "streaming",
        latestMessage: {
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "text", text: "Eccomi" }],
        },
      }),
    ).toBeNull();
  });

  it("uses the latest empty assistant message as the pending box", () => {
    const latestMessage = {
      id: "assistant-1",
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: "" }],
    };

    expect(
      getAssistantMessageLifecycle({
        message: latestMessage,
        isLatest: true,
        pendingLabel: CHAT_REACTIVITY_COPY.assistantPreparing,
      }),
    ).toBe("pending");
    expect(
      shouldRenderAssistantPendingRow({
        pendingLabel: CHAT_REACTIVITY_COPY.assistantPreparing,
        latestMessage,
      }),
    ).toBe(false);
  });

  it("hides stale empty assistant messages without pending feedback", () => {
    expect(
      getAssistantMessageLifecycle({
        message: {
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "text", text: "" }],
        },
        isLatest: false,
        pendingLabel: null,
      }),
    ).toBe("hidden");
  });

  it("keeps a persisted unresolved model comparison visible", () => {
    expect(
      getAssistantMessageLifecycle({
        message: {
          id: "comparison-1",
          role: "assistant",
          parts: [
            {
              type: "data-modelComparison",
              data: {
                pairId: "pair-1",
                noticeRequired: false,
                status: "ready",
                slots: {
                  A: { status: "completed", text: "A" },
                  B: { status: "completed", text: "B" },
                },
              },
            },
          ],
        },
        isLatest: false,
        pendingLabel: null,
      }),
    ).toBe("content");
  });

  it("marks assistant text as streaming while generation is active", () => {
    const message = {
      id: "assistant-1",
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: "Eccomi" }],
    };

    expect(
      getAssistantMessageDisplayState({
        message,
        lifecycle: "content",
        status: "streaming",
      }),
    ).toBe("streaming");
    expect(
      getAssistantMessageDisplayState({
        message,
        lifecycle: "content",
        status: "ready",
      }),
    ).toBe("content");
  });

  it("keeps assistant messages visually continuous through streaming and persistence", () => {
    const message = {
      id: "assistant-1",
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: "" }],
    };

    expect(
      shouldAnimateAssistantMessageMount({
        message,
        displayState: "pending",
      }),
    ).toBe(false);
    expect(
      shouldAnimateAssistantMessageMount({
        message: {
          ...message,
          parts: [{ type: "text" as const, text: "Eccomi" }],
        },
        displayState: "streaming",
      }),
    ).toBe(false);
    expect(
      shouldAnimateAssistantMessageMount({
        message,
        displayState: "content",
      }),
    ).toBe(false);
  });
});

describe("getAssistantToolFeedback", () => {
  it("labels active web searches generically without exposing the query", () => {
    expect(
      getAssistantToolFeedback({
        status: "streaming",
        message: {
          id: "assistant-1",
          role: "assistant",
          parts: [
            {
              type: "tool-tinyfishSearch",
              toolCallId: "call-1",
              state: "input-available",
              input: { query: "prossima partita di Messi" },
            },
          ],
        },
      }),
    ).toEqual({ kind: "web", label: "Ricerca" });
  });

  it("labels active site extraction without exposing the URL or host", () => {
    expect(
      getAssistantToolFeedback({
        status: "streaming",
        message: {
          id: "assistant-1",
          role: "assistant",
          parts: [
            {
              type: "tool-tinyfishFetch",
              toolCallId: "call-1",
              state: "input-available",
              input: { urls: ["https://www.intermiamicf.com/news/latest"] },
            },
          ],
        },
      }),
    ).toEqual({ kind: "web", label: "Ricerca" });
  });

  it("labels active memory access without exposing its category", () => {
    expect(
      getAssistantToolFeedback({
        status: "streaming",
        message: {
          id: "assistant-1",
          role: "assistant",
          parts: [
            {
              type: "tool-getMemories",
              toolCallId: "call-1",
              state: "input-available",
              input: { category: "sport" },
            },
          ],
        },
      }),
    ).toEqual({ kind: "memory", label: "Memoria" });
  });

  it.each([
    ["searchRag", "context", "Contesto"],
    ["getUserContext", "context", "Contesto"],
    ["proposeRoutine", "routine", "Routine"],
  ] as const)(
    "maps %s to a closed generic indicator",
    (toolName, kind, label) => {
      expect(
        getAssistantToolFeedback({
          status: "streaming",
          message: {
            id: "assistant-1",
            role: "assistant",
            parts: [
              {
                type: `tool-${toolName}`,
                toolCallId: "call-1",
                state: "input-available",
                input: {
                  query: "private-query",
                  key: "private-key",
                  category: "private-category",
                  value: "private-value",
                  url: "https://private.example/path",
                },
              },
            ],
          },
        }),
      ).toEqual({ kind, label });
    },
  );

  it("does not narrate unknown tool names or their inputs", () => {
    expect(
      getAssistantToolFeedback({
        status: "streaming",
        message: {
          id: "assistant-1",
          role: "assistant",
          parts: [
            {
              type: "tool-privateInternalTool",
              toolCallId: "call-1",
              state: "input-available",
              input: { query: "private-query" },
            },
          ],
        },
      }),
    ).toBeNull();
  });

  it("does not show stale tool feedback after streaming completes", () => {
    expect(
      getAssistantToolFeedback({
        status: "ready",
        message: {
          id: "assistant-1",
          role: "assistant",
          parts: [
            {
              type: "tool-tinyfishSearch",
              toolCallId: "call-1",
              state: "input-available",
              input: { query: "Monza news" },
            },
          ],
        },
      }),
    ).toBeNull();
  });
});
