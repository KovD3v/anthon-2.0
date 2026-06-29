import type { UIMessage } from "ai";

export type ChatRequestStatus = "ready" | "submitted" | "streaming" | "error";

export const ASSISTANT_READING_MAX_MS = 700;

export const CHAT_REACTIVITY_COPY = {
  assistantReading: "Leggo il contesto",
  assistantPreparing: "Sto preparando la risposta",
  assistantWorkingDetail: "La risposta sta arrivando.",
  uploadTooLarge: "File troppo grande. Dimensione massima: 10MB.",
  uploadUploading: "Carico il file",
  uploadSuccess: "File caricato",
  uploadFailed: "Caricamento file fallito",
  audioRequesting: "Attivo il microfono",
  audioRecording: "Registrazione in corso",
  audioConverting: "Preparo l'audio",
  audioUploading: "Carico l'audio",
  audioReady: "Audio pronto",
  audioFailed: "Registrazione non riuscita",
  audioAutoStopped: "Registrazione terminata automaticamente",
  feedbackFailed: "Salvataggio feedback fallito",
  olderMessagesLoading: "Carico i messaggi precedenti...",
  loadOlderMessages: "Carica messaggi precedenti",
  scrollToBottom: "Vai in fondo",
} as const;

export function getMessageText(message: UIMessage | undefined) {
  return (
    message?.parts
      ?.map((part) => (part.type === "text" ? part.text : ""))
      .join("") || ""
  );
}

export function getAssistantPendingLabel({
  status,
  latestMessage,
  submittedElapsedMs = 0,
}: {
  status: ChatRequestStatus;
  latestMessage: UIMessage | undefined;
  submittedElapsedMs?: number;
}) {
  if (status === "ready" || status === "error") {
    return null;
  }

  if (
    latestMessage?.role === "assistant" &&
    getMessageText(latestMessage).trim().length > 0
  ) {
    return null;
  }

  if (status === "submitted" && submittedElapsedMs < ASSISTANT_READING_MAX_MS) {
    return CHAT_REACTIVITY_COPY.assistantReading;
  }

  return CHAT_REACTIVITY_COPY.assistantPreparing;
}

export type AssistantMessageLifecycle = "content" | "pending" | "hidden";
export type AssistantMessageDisplayState =
  | AssistantMessageLifecycle
  | "streaming";

export function getAssistantMessageLifecycle({
  message,
  isLatest,
  pendingLabel,
  hasRenderableAttachment = false,
}: {
  message: UIMessage;
  isLatest: boolean;
  pendingLabel: string | null;
  hasRenderableAttachment?: boolean;
}): AssistantMessageLifecycle {
  if (message.role !== "assistant") {
    return "content";
  }

  const hasText = getMessageText(message).trim().length > 0;
  const hasFilePart = message.parts?.some((part) => part.type === "file");
  if (hasText || hasFilePart || hasRenderableAttachment) {
    return "content";
  }

  if (isLatest && pendingLabel) {
    return "pending";
  }

  return "hidden";
}

export function getAssistantMessageDisplayState({
  message,
  lifecycle,
  status,
}: {
  message: UIMessage;
  lifecycle: AssistantMessageLifecycle;
  status: ChatRequestStatus;
}): AssistantMessageDisplayState {
  if (lifecycle !== "content" || message.role !== "assistant") {
    return lifecycle;
  }

  if (status !== "streaming") {
    return lifecycle;
  }

  return getMessageText(message).trim().length > 0 ? "streaming" : lifecycle;
}

export function shouldRenderAssistantPendingRow({
  pendingLabel,
  latestMessage,
}: {
  pendingLabel: string | null;
  latestMessage: UIMessage | undefined;
}) {
  return Boolean(pendingLabel) && latestMessage?.role !== "assistant";
}

export function getAudioRecorderStatusLabel({
  state,
  duration,
}: {
  state:
    | "idle"
    | "requesting"
    | "recording"
    | "converting"
    | "uploading"
    | "ready"
    | "error";
  duration: string;
}) {
  switch (state) {
    case "requesting":
      return CHAT_REACTIVITY_COPY.audioRequesting;
    case "recording":
      return `${CHAT_REACTIVITY_COPY.audioRecording} ${duration}`;
    case "converting":
      return CHAT_REACTIVITY_COPY.audioConverting;
    case "uploading":
      return CHAT_REACTIVITY_COPY.audioUploading;
    case "ready":
      return CHAT_REACTIVITY_COPY.audioReady;
    case "error":
      return CHAT_REACTIVITY_COPY.audioFailed;
    case "idle":
      return null;
  }
}
