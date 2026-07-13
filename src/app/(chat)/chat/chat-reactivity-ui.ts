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

type ToolFeedbackPart = {
  type?: string;
  toolName?: string;
  state?: string;
  input?: unknown;
};

export function getAssistantToolFeedback({
  status,
  message,
}: {
  status: ChatRequestStatus;
  message: UIMessage | undefined;
}) {
  if (status !== "submitted" && status !== "streaming") {
    return null;
  }

  if (message?.role !== "assistant") {
    return null;
  }

  const toolPart = [...(message.parts ?? [])]
    .reverse()
    .find(isActiveToolFeedbackPart);
  if (!toolPart) {
    return null;
  }

  const toolName = getToolName(toolPart);
  const input = toolPart.input;
  const topic = getToolInputTopic(input);
  const host = getToolInputHost(input);

  if (isSearchTool(toolName)) {
    return topic ? `Sto cercando ${topic}` : "Sto cercando informazioni";
  }

  if (isFetchTool(toolName)) {
    return host
      ? `Estraggo dal sito ${host}`
      : "Estraggo informazioni dal sito";
  }

  if (isContextTool(toolName)) {
    return topic
      ? `Recupero informazioni su ${topic}`
      : "Recupero informazioni dal profilo";
  }

  return topic ? `Recupero informazioni su ${topic}` : "Recupero informazioni";
}

function isActiveToolFeedbackPart(
  part: UIMessage["parts"][number],
): part is UIMessage["parts"][number] & ToolFeedbackPart {
  const toolPart = part as ToolFeedbackPart;
  if (!toolPart.type?.startsWith("tool-") && toolPart.type !== "dynamic-tool") {
    return false;
  }

  return (
    toolPart.state === "input-streaming" ||
    toolPart.state === "input-available" ||
    toolPart.state === "approval-requested"
  );
}

function getToolName(part: ToolFeedbackPart) {
  if (part.type === "dynamic-tool") {
    return part.toolName ?? "";
  }

  return part.type?.replace(/^tool-/, "") ?? "";
}

function isSearchTool(toolName: string) {
  return /search|cerca/i.test(toolName);
}

function isFetchTool(toolName: string) {
  return /fetch|extract|crawl|scrape|readUrl/i.test(toolName);
}

function isContextTool(toolName: string) {
  return /context|memories|profile|preferences/i.test(toolName);
}

function getToolInputTopic(input: unknown): string | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const record = input as Record<string, unknown>;
  const directTopic =
    pickString(record.query) ??
    pickString(record.q) ??
    pickString(record.topic) ??
    pickString(record.category) ??
    pickString(record.key) ??
    pickString(record.url);

  if (directTopic) {
    return cleanToolFeedbackValue(directTopic);
  }

  const firstUrl = pickFirstString(record.urls);
  return firstUrl ? cleanToolFeedbackValue(firstUrl) : null;
}

function getToolInputHost(input: unknown): string | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const record = input as Record<string, unknown>;
  const rawUrl = pickString(record.url) ?? pickFirstString(record.urls);
  if (!rawUrl) {
    return null;
  }

  try {
    const url = new URL(rawUrl);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return cleanToolFeedbackValue(rawUrl);
  }
}

function pickString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function pickFirstString(value: unknown) {
  return Array.isArray(value)
    ? (value.map(pickString).find(Boolean) ?? null)
    : null;
}

function cleanToolFeedbackValue(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "");
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
  const hasModelComparison = message.parts?.some(
    (part) => part.type === "data-modelComparison",
  );
  if (hasText || hasFilePart || hasModelComparison || hasRenderableAttachment) {
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

export function shouldAnimateAssistantMessageMount({
  message,
  displayState,
}: {
  message: UIMessage;
  displayState: AssistantMessageDisplayState;
}) {
  if (message.role !== "assistant") {
    return true;
  }

  return displayState !== "pending" && displayState !== "streaming";
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
