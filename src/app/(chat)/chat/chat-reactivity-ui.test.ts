import { describe, expect, it } from "vitest";
import {
  CHAT_REACTIVITY_COPY,
  getAssistantMessageDisplayState,
  getAssistantMessageLifecycle,
  getAssistantPendingLabel,
  getAudioRecorderStatusLabel,
  shouldRenderAssistantPendingRow,
} from "./chat-reactivity-ui";

describe("getAssistantPendingLabel", () => {
  it("shows immediate reading feedback while a user message is submitted", () => {
    expect(
      getAssistantPendingLabel({
        status: "submitted",
        latestMessage: {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "ciao" }],
        },
      }),
    ).toBe(CHAT_REACTIVITY_COPY.assistantReading);
  });

  it("moves past reading feedback when submitted wait becomes noticeable", () => {
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
});

describe("getAudioRecorderStatusLabel", () => {
  it("exposes the full voice recording lifecycle as user-facing feedback", () => {
    expect(
      getAudioRecorderStatusLabel({ state: "requesting", duration: "0:00" }),
    ).toBe("Attivo il microfono");
    expect(
      getAudioRecorderStatusLabel({ state: "recording", duration: "0:07" }),
    ).toBe("Registrazione in corso 0:07");
    expect(
      getAudioRecorderStatusLabel({ state: "converting", duration: "0:07" }),
    ).toBe("Preparo l'audio");
    expect(
      getAudioRecorderStatusLabel({ state: "uploading", duration: "0:07" }),
    ).toBe("Carico l'audio");
  });
});
