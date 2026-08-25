import type { UIMessage } from "ai";
import { getRoutineProposalFromParts } from "@/lib/coaching/routine";

export type ChatRequestStatus = "ready" | "submitted" | "streaming" | "error";

export const CHAT_REACTIVITY_COPY = {
  assistantPreparing: "Sto preparando la risposta",
  assistantReasoning: "Sto ragionando sulla risposta",
  assistantRegenerating: "Rigenero la risposta",
  assistantRegeneratingDetail: "Sostituisco la risposta precedente.",
  assistantWorkingDetail: "La risposta sta arrivando.",
  uploadTooLarge: "File troppo grande. Dimensione massima: 10MB.",
  uploadUnsupported:
    "Formato non supportato. Per le foto iPhone usa JPG o PNG, non HEIC/HEIF.",
  uploadUploading: "Carico il file",
  uploadSuccess: "File caricato",
  uploadFailed: "Caricamento file fallito",
  uploadPaidAccessRequired: "Per allegare file serve un piano attivo.",
  audioReady: "Audio pronto",
  audioFailed: "Registrazione non riuscita",
  audioPaidAccessRequired: "Per inviare audio serve un piano attivo.",
  viewPlans: "Vedi i piani",
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
};

export type AssistantToolFeedback = {
  kind: "web" | "context" | "memory" | "routine";
  label: "Ricerca" | "Contesto" | "Memoria" | "Routine";
};

const TOOL_FEEDBACK = {
  tinyfishSearch: { kind: "web", label: "Ricerca" },
  tinyfishFetch: { kind: "web", label: "Ricerca" },
  searchRag: { kind: "context", label: "Contesto" },
  getUserContext: { kind: "context", label: "Contesto" },
  updateProfile: { kind: "context", label: "Contesto" },
  updatePreferences: { kind: "context", label: "Contesto" },
  addNotes: { kind: "context", label: "Contesto" },
  getMemories: { kind: "memory", label: "Memoria" },
  saveMemory: { kind: "memory", label: "Memoria" },
  requestMemoryApproval: { kind: "memory", label: "Memoria" },
  resolveMemoryApproval: { kind: "memory", label: "Memoria" },
  deleteMemory: { kind: "memory", label: "Memoria" },
  proposeRoutine: { kind: "routine", label: "Routine" },
} as const satisfies Record<string, AssistantToolFeedback>;

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
  return TOOL_FEEDBACK[toolName as keyof typeof TOOL_FEEDBACK] ?? null;
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
    toolPart.state === "approval-requested" ||
    toolPart.state === "output-available"
  );
}

function getToolName(part: ToolFeedbackPart) {
  if (part.type === "dynamic-tool") {
    return part.toolName ?? "";
  }

  return part.type?.replace(/^tool-/, "") ?? "";
}

export function getAssistantPendingLabel({
  status,
  latestMessage,
  isReasoning = false,
}: {
  status: ChatRequestStatus;
  latestMessage: UIMessage | undefined;
  isReasoning?: boolean;
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

  if (isReasoning) {
    return CHAT_REACTIVITY_COPY.assistantReasoning;
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
  const hasRoutineProposal =
    getRoutineProposalFromParts(message.parts) !== null;
  if (
    hasText ||
    hasFilePart ||
    hasModelComparison ||
    hasRoutineProposal ||
    hasRenderableAttachment
  ) {
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

export function shouldAnimateAssistantMessageMount(_options: {
  message: UIMessage;
  displayState: AssistantMessageDisplayState;
}) {
  // Messages can remount while navigating or while assistant ids reconcile.
  // Never replay their entrance: every bubble should remain visually stable.
  return false;
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
