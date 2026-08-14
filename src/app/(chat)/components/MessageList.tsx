"use client";

import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import {
  ArrowDown,
  Brain,
  Check,
  Copy,
  Database,
  FileSearch,
  ListChecks,
  Loader2,
  type LucideIcon,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import {
  type CapabilityUsage,
  normalizeCapabilityUsage,
} from "@/lib/ai/capability-usage";
import {
  type ChatUIMessage,
  normalizeFilePartForPreview,
} from "@/lib/chat-client";
import {
  getRoutineProposalFromParts,
  type RoutineCardData,
  type RoutineProposal,
} from "@/lib/coaching/routine";
import { formatRelativeTime } from "@/lib/format-time";
import type {
  ModelComparisonData,
  ModelComparisonSlot,
} from "@/lib/model-experiments/types";
import {
  defaultTransition,
  duration,
  ease,
  fadeUp,
  scaleIn,
} from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { MessageFeedbackReason } from "@/types/chat";
import {
  CHAT_REACTIVITY_COPY,
  type ChatRequestStatus,
  getAssistantMessageDisplayState,
  getAssistantMessageLifecycle,
  getAssistantPendingLabel,
  getAssistantToolFeedback,
  getMessageText,
  shouldAnimateAssistantMessageMount,
  shouldRenderAssistantPendingRow,
} from "../chat/chat-reactivity-ui";
import { AttachmentPreview } from "./Attachments";
import { AudioPlayer } from "./AudioPlayer";
import { MemoizedMarkdown } from "./MemoizedMarkdown";
import { ModelComparisonCard } from "./ModelComparisonCard";
import { RoutineCard } from "./RoutineCard";
import type {
  CreateRoutineAttempt,
  SaveRoutineOutcome,
} from "./RoutineCheckInForm";
import { TechnicalMetricsDetails } from "./TechnicalMetricsDetails";
import { VoiceResponse } from "./VoiceResponse";

type ExtendedMessage = ChatUIMessage;

function getMessageRenderKey(
  messages: ExtendedMessage[],
  messageIndex: number,
) {
  const message = messages[messageIndex];
  if (!message) return `message:${messageIndex}`;
  if (message.role === "user") {
    return `user:${message.clientMessageId ?? message.id}`;
  }
  if (getModelComparisonData(message.parts)) {
    return `assistant:${message.id}`;
  }
  if (message.sourceClientMessageId) {
    return `assistant:${message.sourceClientMessageId}`;
  }

  for (let index = messageIndex - 1; index >= 0; index -= 1) {
    const precedingMessage = messages[index];
    if (precedingMessage?.role === "user") {
      return `assistant:${precedingMessage.clientMessageId ?? precedingMessage.id}`;
    }
  }

  return `assistant:${message.id}`;
}

function getModelComparisonData(parts: ExtendedMessage["parts"]) {
  const part = parts?.find(
    (candidate) => candidate.type === "data-modelComparison",
  ) as { data?: ModelComparisonData } | undefined;
  return part?.data;
}

function getCapabilityUsage(parts: ExtendedMessage["parts"]) {
  const part = parts?.find(
    (candidate) => candidate.type === "data-aiCapabilities",
  ) as { data?: { capabilities?: unknown } } | undefined;
  return normalizeCapabilityUsage(part?.data?.capabilities);
}

const CAPABILITY_INDICATORS: Record<
  CapabilityUsage,
  { label: string; icon: LucideIcon }
> = {
  rag: { label: "Contesto", icon: FileSearch },
  web: { label: "Ricerca", icon: FileSearch },
  memory: { label: "Memoria", icon: Database },
  recall: { label: "Ricordo", icon: Brain },
  routine: { label: "Routine", icon: ListChecks },
  voice: { label: "Voce", icon: Volume2 },
};

const ACTIVE_TOOL_ICONS = {
  web: FileSearch,
  context: FileSearch,
  memory: Database,
  routine: ListChecks,
} as const;

export function getRoutineProposalData(
  parts: ExtendedMessage["parts"],
): RoutineProposal | null {
  return getRoutineProposalFromParts(parts);
}

interface MessageListProps {
  messages: ExtendedMessage[];
  status: ChatRequestStatus;
  isLoading: boolean;
  isAssistantReasoning?: boolean;
  isRegenerating?: boolean;
  editingMessageId: string | null;
  deletingMessageId: string | null;
  onEditStart: (id: string, content: string) => void;
  onEditCancel: () => void;
  onEditSave: () => void;
  onEditContentChange: (content: string) => void;
  editContent: string;
  onDelete: (id: string) => void;
  onRegenerate: () => void;
  feedbackEndpoint: string;
  canSubmitFeedback?: boolean;
  feedbackMessageIds?: ReadonlySet<string>;
  comparisonDeltas?: Record<
    string,
    Partial<Record<ModelComparisonSlot, string>>
  >;
  onModelComparisonResolved?: () => Promise<void>;
  routines: RoutineCardData[];
  /** Existing routine invoked from the collection, rendered without save. */
  reusedRoutine?: RoutineCardData | null;
  isGuest: boolean;
  canRenderRoutineCards: boolean;
  registrationHref: string;
  onSaveRoutine: (sourceAssistantMessageId: string) => Promise<RoutineCardData>;
  onCreateRoutineAttempt: CreateRoutineAttempt;
  onSaveRoutineOutcome: SaveRoutineOutcome;
  onArchiveRoutine: (routineId: string) => Promise<RoutineCardData>;
  /** Persist the proposal identified by its source assistant message and start it inline. */
  onTryRoutineNow: (
    sourceAssistantMessageId: string,
  ) => Promise<RoutineCardData>;
  onAdaptRoutine: (routineId: string, title: string) => void;
  openCheckInRoutineId?: string | null;
  // Lazy loading props
  hasMoreMessages?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

function hasPersistedAudioAttachment(message: ExtendedMessage) {
  return (
    message.attachments?.some((attachment) =>
      attachment.contentType.startsWith("audio/"),
    ) ?? false
  );
}

const assistantMarkdownClassName =
  "prose prose-sm max-w-none break-words prose-p:leading-relaxed prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-li:text-foreground prose-a:text-primary prose-code:text-foreground prose-pre:rounded-xl prose-pre:border prose-pre:border-border/60 prose-pre:bg-muted/60";

const FEEDBACK_REASON_OPTIONS = [
  { value: "linguistic_error", label: "Errore linguistico" },
  { value: "wrong_fact", label: "Fatto sbagliato" },
  { value: "context_missed", label: "Non ha capito il contesto" },
  { value: "too_generic", label: "Troppo generico" },
  { value: "tool_search_problem", label: "Problema tool/search" },
  { value: "other", label: "Altro" },
] as const satisfies ReadonlyArray<{
  value: MessageFeedbackReason;
  label: string;
}>;

type FeedbackReason = (typeof FEEDBACK_REASON_OPTIONS)[number]["value"];

function getFeedbackReasonLabel(reason: FeedbackReason | undefined) {
  return FEEDBACK_REASON_OPTIONS.find((option) => option.value === reason)
    ?.label;
}

async function submitFeedback(
  endpoint: string,
  messageId: string,
  feedback: number,
  selectedReason?: FeedbackReason,
) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messageId,
      feedback,
      reason: selectedReason,
    }),
  });

  if (!response.ok) {
    throw new Error(`Feedback request failed with status ${response.status}`);
  }
}

export function MessageList({
  messages,
  status,
  isLoading,
  isAssistantReasoning = false,
  isRegenerating = false,
  editingMessageId,
  deletingMessageId,
  onEditStart,
  onEditCancel,
  onEditSave,
  onEditContentChange,
  editContent,
  onDelete,
  onRegenerate,
  feedbackEndpoint,
  canSubmitFeedback = true,
  feedbackMessageIds,
  comparisonDeltas = {},
  onModelComparisonResolved,
  routines,
  reusedRoutine = null,
  isGuest,
  canRenderRoutineCards,
  registrationHref,
  onSaveRoutine,
  onCreateRoutineAttempt,
  onSaveRoutineOutcome,
  onArchiveRoutine,
  onTryRoutineNow,
  onAdaptRoutine,
  openCheckInRoutineId,
  hasMoreMessages = false,
  isLoadingMore = false,
  onLoadMore,
}: MessageListProps) {
  const shouldReduceMotion = useReducedMotion();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const { copy, copied } = useCopyToClipboard();
  const [feedbackState, setFeedbackState] = useState<Record<string, number>>(
    {},
  );
  const [feedbackReasonState, setFeedbackReasonState] = useState<
    Record<string, FeedbackReason | undefined>
  >({});
  const [feedbackReasonMenuMessageId, setFeedbackReasonMenuMessageId] =
    useState<string | null>(null);
  const [feedbackSavingState, setFeedbackSavingState] = useState<
    Record<string, boolean>
  >({});
  const latestMessage = messages[messages.length - 1];
  const assistantPendingLabel = getAssistantPendingLabel({
    status,
    latestMessage,
    isReasoning: isAssistantReasoning,
  });
  const pendingAssistantLabel = isRegenerating
    ? CHAT_REACTIVITY_COPY.assistantRegenerating
    : assistantPendingLabel;
  const visibleMessages = useMemo(
    () =>
      messages.filter(
        (message, index) =>
          getAssistantMessageLifecycle({
            message,
            isLatest: index === messages.length - 1,
            pendingLabel: pendingAssistantLabel,
            hasRenderableAttachment: hasPersistedAudioAttachment(message),
          }) !== "hidden",
      ),
    [messages, pendingAssistantLabel],
  );
  const shouldShowPendingRow =
    isRegenerating ||
    shouldRenderAssistantPendingRow({
      pendingLabel: pendingAssistantLabel,
      latestMessage,
    });
  const pendingAssistantMessage = useMemo<ExtendedMessage | null>(() => {
    if (
      !shouldShowPendingRow ||
      isRegenerating ||
      latestMessage?.role !== "user"
    ) {
      return null;
    }

    return {
      id: `pending-assistant:${latestMessage.clientMessageId ?? latestMessage.id}`,
      role: "assistant",
      parts: [],
    };
  }, [isRegenerating, latestMessage, shouldShowPendingRow]);
  const displayedMessages = useMemo(
    () =>
      pendingAssistantMessage
        ? [...visibleMessages, pendingAssistantMessage]
        : visibleMessages,
    [pendingAssistantMessage, visibleMessages],
  );
  const parentRef = useRef<HTMLDivElement>(null);
  const routineBySourceMessageId = useMemo(() => {
    const byMessageId = new Map<string, RoutineCardData>();
    for (const routine of routines) {
      if (routine.sourceAssistantMessageId) {
        byMessageId.set(routine.sourceAssistantMessageId, routine);
      }
    }
    return byMessageId;
  }, [routines]);
  const reusedRoutineMessageId = useMemo(() => {
    if (!canRenderRoutineCards || !reusedRoutine) return null;

    return (
      visibleMessages.find((message) => {
        if (message.role !== "assistant") return false;
        if (getModelComparisonData(message.parts)) return false;
        return !hasPersistedAudioAttachment(message);
      })?.id ?? null
    );
  }, [canRenderRoutineCards, reusedRoutine, visibleMessages]);

  useEffect(() => {
    setFeedbackState((current) => {
      let changed = false;
      const next = { ...current };

      for (const message of messages) {
        if (
          current[message.id] === undefined &&
          message.feedback !== undefined &&
          message.feedback !== null
        ) {
          next[message.id] = message.feedback;
          changed = true;
        }
      }

      return changed ? next : current;
    });

    setFeedbackReasonState((current) => {
      let changed = false;
      const next = { ...current };

      for (const message of messages) {
        if (
          current[message.id] === undefined &&
          message.feedbackReason !== undefined
        ) {
          next[message.id] = message.feedbackReason;
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [messages]);

  async function handleFeedback(messageId: string, feedback: number) {
    const currentFeedback = feedbackState[messageId] ?? 0;
    const currentReason = feedbackReasonState[messageId];
    // Toggle off if same feedback
    const newFeedback = currentFeedback === feedback ? 0 : feedback;

    setFeedbackState((prev) => ({ ...prev, [messageId]: newFeedback }));
    if (newFeedback === -1) {
      setFeedbackReasonMenuMessageId(messageId);
    } else {
      setFeedbackReasonMenuMessageId(null);
      setFeedbackReasonState((prev) => ({ ...prev, [messageId]: undefined }));
    }

    setFeedbackSavingState((prev) => ({ ...prev, [messageId]: true }));
    try {
      await submitFeedback(feedbackEndpoint, messageId, newFeedback);
    } catch {
      setFeedbackState((prev) => ({
        ...prev,
        [messageId]: currentFeedback,
      }));
      setFeedbackReasonState((prev) => ({
        ...prev,
        [messageId]: currentReason,
      }));
      setFeedbackReasonMenuMessageId(null);
      toast.error(CHAT_REACTIVITY_COPY.feedbackFailed);
    } finally {
      setFeedbackSavingState((prev) => ({ ...prev, [messageId]: false }));
    }
  }

  async function handleFeedbackReason(
    messageId: string,
    selectedReason: FeedbackReason,
  ) {
    const currentReason = feedbackReasonState[messageId];
    setFeedbackState((prev) => ({ ...prev, [messageId]: -1 }));
    setFeedbackReasonState((prev) => ({
      ...prev,
      [messageId]: selectedReason,
    }));
    setFeedbackReasonMenuMessageId(null);

    setFeedbackSavingState((prev) => ({ ...prev, [messageId]: true }));
    try {
      await submitFeedback(feedbackEndpoint, messageId, -1, selectedReason);
    } catch {
      setFeedbackReasonState((prev) => ({
        ...prev,
        [messageId]: currentReason,
      }));
      setFeedbackReasonMenuMessageId(messageId);
      toast.error(CHAT_REACTIVITY_COPY.feedbackFailed);
    } finally {
      setFeedbackSavingState((prev) => ({ ...prev, [messageId]: false }));
    }
  }

  async function handleFeedbackRemoval(messageId: string) {
    const currentFeedback = feedbackState[messageId] ?? 0;
    const currentReason = feedbackReasonState[messageId];
    setFeedbackState((prev) => ({ ...prev, [messageId]: 0 }));
    setFeedbackReasonState((prev) => ({ ...prev, [messageId]: undefined }));
    setFeedbackReasonMenuMessageId(null);

    setFeedbackSavingState((prev) => ({ ...prev, [messageId]: true }));
    try {
      await submitFeedback(feedbackEndpoint, messageId, 0);
    } catch {
      setFeedbackState((prev) => ({
        ...prev,
        [messageId]: currentFeedback,
      }));
      setFeedbackReasonState((prev) => ({
        ...prev,
        [messageId]: currentReason,
      }));
      toast.error(CHAT_REACTIVITY_COPY.feedbackFailed);
    } finally {
      setFeedbackSavingState((prev) => ({ ...prev, [messageId]: false }));
    }
  }

  // Auto-scroll to bottom when messages load or new message arrives
  useEffect(() => {
    // Scroll to bottom on initial load or when new messages are added
    if (messages.length > 0 && parentRef.current) {
      // Let the newly rendered message finish layout before scrolling.
      const timeoutId = setTimeout(() => {
        if (parentRef.current) {
          parentRef.current.scrollTop = parentRef.current.scrollHeight;
        }
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [messages.length]);

  const handleScroll = useCallback(() => {
    if (!parentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setShowScrollButton(distanceFromBottom > 200);

    if (scrollTop < 100 && hasMoreMessages && !isLoadingMore && onLoadMore) {
      onLoadMore();
    }
  }, [hasMoreMessages, isLoadingMore, onLoadMore]);

  useEffect(() => {
    const container = parentRef.current;
    if (!container) return;
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  function scrollToBottom() {
    parentRef.current?.scrollTo({
      top: parentRef.current.scrollHeight,
      behavior: "smooth",
    });
  }

  if (messages.length === 0) {
    if (reusedRoutine && canRenderRoutineCards) {
      return (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-none px-4 py-8">
          <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center gap-5">
            <div className="px-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Routine pronta
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                {reusedRoutine.proposal.title}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Questa è la routine che hai già salvato. Puoi avviarla qui,
                registrare come è andata oppure adattarla in una nuova chat.
              </p>
            </div>
            <RoutineCard
              proposal={reusedRoutine.proposal}
              routine={reusedRoutine}
              sourceAssistantMessageId={
                reusedRoutine.sourceAssistantMessageId ?? reusedRoutine.id
              }
              isGuest={isGuest}
              registrationHref={registrationHref}
              onSave={onSaveRoutine}
              onCreateAttempt={onCreateRoutineAttempt}
              onSaveOutcome={onSaveRoutineOutcome}
              onArchive={onArchiveRoutine}
              onTryNow={() =>
                onTryRoutineNow(
                  reusedRoutine.sourceAssistantMessageId ?? reusedRoutine.id,
                )
              }
              onAdapt={() =>
                onAdaptRoutine(reusedRoutine.id, reusedRoutine.proposal.title)
              }
              isReused
              openCheckIn={openCheckInRoutineId === reusedRoutine.id}
            />
          </div>
        </div>
      );
    }
    return <EmptyChatWelcome className="flex-1 justify-center p-8" />;
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={parentRef}
        className="min-w-0 flex-1 overflow-y-auto overscroll-y-none px-4 pt-6 pb-20 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
      >
        <div className="mx-auto w-full min-w-0 max-w-3xl">
          {/* Loading indicator for older messages */}
          {isLoadingMore && (
            <div className="flex justify-center py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{CHAT_REACTIVITY_COPY.olderMessagesLoading}</span>
              </div>
            </div>
          )}

          {/* Load more button when at the top */}
          {hasMoreMessages && !isLoadingMore && (
            <div className="flex justify-center py-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={onLoadMore}
                className="text-muted-foreground hover:text-foreground"
              >
                {CHAT_REACTIVITY_COPY.loadOlderMessages}
              </Button>
            </div>
          )}
          <div>
            {displayedMessages.map((message, messageIndex) => {
              const isPendingAssistant = message === pendingAssistantMessage;
              const isEditing = editingMessageId === message.id;
              const messageText = getMessageText(message);
              const relativeTimestamp = message.createdAt
                ? formatRelativeTime(message.createdAt)
                : "Just now";
              const comparisonData = getModelComparisonData(message.parts);
              const isLastAssistant =
                message.role === "assistant" &&
                message.id ===
                  displayedMessages[displayedMessages.length - 1]?.id;
              const isUser = message.role === "user";
              const assistantLifecycle = isPendingAssistant
                ? "pending"
                : getAssistantMessageLifecycle({
                    message,
                    isLatest: message.id === latestMessage?.id,
                    pendingLabel: assistantPendingLabel,
                    hasRenderableAttachment:
                      hasPersistedAudioAttachment(message),
                  });
              const assistantDisplayState = getAssistantMessageDisplayState({
                message,
                lifecycle: assistantLifecycle,
                status,
              });
              const assistantToolFeedback = getAssistantToolFeedback({
                status,
                message,
              });
              const capabilitiesUsed =
                message.role === "assistant"
                  ? getCapabilityUsage(message.parts)
                  : [];
              const shouldAnimateMount = shouldAnimateAssistantMessageMount({
                message,
                displayState: assistantDisplayState,
              });

              const hasAttachments = message.parts?.some(
                (part) => part.type === "file",
              );
              const hasText = messageText.trim().length > 0;
              const isAttachmentOnly = hasAttachments && !hasText;
              const hasAudioFilePart =
                message.parts?.some((part) =>
                  normalizeFilePartForPreview(part)?.mimeType.startsWith(
                    "audio/",
                  ),
                ) ?? false;
              const feedbackReasonLabel = getFeedbackReasonLabel(
                feedbackReasonState[message.id],
              );
              const feedbackValue = feedbackState[message.id] ?? 0;
              const isFeedbackSaving = feedbackSavingState[message.id] === true;
              const isPersistedMessage =
                !feedbackMessageIds || feedbackMessageIds.has(message.id);
              const areMessageActionsVisible = isUser || isPersistedMessage;
              const canSubmitFeedbackForMessage =
                canSubmitFeedback && isPersistedMessage;

              // Voice message state from persisted DB attachments.
              const dbVoiceAttachment = message.attachments?.find((a) =>
                a.contentType.startsWith("audio/"),
              );

              const isVoiceMessage = !!dbVoiceAttachment;
              const voiceAudioSrc = dbVoiceAttachment?.blobUrl;
              const isExplicitVoiceRequest =
                message.voice?.isExplicitRequest === true;
              const isVoiceGenerationPending =
                isExplicitVoiceRequest &&
                !isVoiceMessage &&
                (message.voice?.status === "PENDING" ||
                  message.voice?.status === "PROCESSING");
              const isVoiceGenerationUnavailable =
                isExplicitVoiceRequest &&
                !isVoiceMessage &&
                (message.voice?.status === "FAILED" ||
                  message.voice?.status === "CANCELLED");
              const hasAudioPayload = isVoiceMessage || hasAudioFilePart;
              const persistedRoutineProposal =
                canRenderRoutineCards &&
                message.role === "assistant" &&
                !comparisonData &&
                !hasAudioPayload
                  ? getRoutineProposalData(message.parts)
                  : null;
              const isReusedRoutineMessage =
                reusedRoutineMessageId === message.id;
              // A repeated chat is an invocation of the saved routine, not a
              // new proposal. Always prefer the persisted snapshot so a model
              // response that happens to emit a routine part cannot replace
              // the card (or turn it into a saveable proposal).
              const routineProposal = isReusedRoutineMessage
                ? (reusedRoutine?.proposal ?? null)
                : persistedRoutineProposal;
              const routine = isReusedRoutineMessage
                ? reusedRoutine
                : persistedRoutineProposal
                  ? (routineBySourceMessageId.get(message.id) ?? null)
                  : null;
              // The structured card is the detailed response. Keep the
              // persisted prose for history/source hydration, but do not
              // make the user read the same routine twice.
              const isRoutineProposalOnly =
                !isUser &&
                routineProposal !== null &&
                !comparisonData &&
                !isVoiceMessage &&
                !hasAttachments &&
                !isEditing;

              return (
                <div
                  key={getMessageRenderKey(displayedMessages, messageIndex)}
                  data-index={messageIndex}
                  data-message-role={message.role}
                >
                  <m.div
                    initial={
                      shouldAnimateMount
                        ? {
                            opacity: 0,
                            transform: shouldReduceMotion
                              ? "translateY(0)"
                              : "translateY(12px)",
                          }
                        : false
                    }
                    animate={{ opacity: 1, transform: "translateY(0)" }}
                    transition={defaultTransition}
                    className={`group flex min-w-0 max-w-full items-start gap-2 mb-8 ${
                      isUser ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    {/* Avatar */}
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-xs ring-1 ring-inset ${
                        isUser
                          ? "bg-primary text-primary-foreground ring-primary/20"
                          : "bg-background text-primary ring-border/70 dark:ring-white/10"
                      }`}
                    >
                      {isUser ? (
                        <div className="h-4 w-4 rounded-full bg-current" />
                      ) : (
                        <Brain className="h-5 w-5" />
                      )}
                    </div>

                    {/* Content Bubble */}
                    <div
                      className={`flex min-w-0 w-full max-w-full flex-1 flex-col gap-2 sm:max-w-[85%] ${
                        isUser ? "items-end" : "items-start"
                      }`}
                    >
                      {/* Name & Meta (Optional, mostly for assistant) */}
                      {!isUser && (
                        <div className="flex items-center gap-2 px-1">
                          <span className="text-xs font-semibold text-foreground/80">
                            Anthon
                          </span>
                          <span className="text-xs text-muted-foreground/50">
                            {relativeTimestamp}
                          </span>
                        </div>
                      )}
                      {isUser && (
                        <div className="flex items-center gap-2 px-1 justify-end">
                          <span className="text-xs text-muted-foreground/50">
                            {relativeTimestamp}
                          </span>
                        </div>
                      )}

                      <div
                        className={`${
                          isRoutineProposalOnly ? "hidden " : ""
                        }relative min-w-0 max-w-full break-words text-sm leading-relaxed ${
                          /* Only apply bubble styling if there's text or we are editing */
                          comparisonData
                            ? "w-full bg-transparent p-0"
                            : !isAttachmentOnly || isEditing
                              ? `px-4 py-3 shadow-sm sm:px-5 sm:py-3.5 ${
                                  isUser
                                    ? "rounded-2xl rounded-tr-sm border border-primary/15 bg-primary/10 text-foreground"
                                    : "rounded-2xl rounded-tl-sm border border-border/60 bg-card text-foreground"
                                }`
                              : "p-0 bg-transparent" /* Transparent for standalone attachments */
                        } ${
                          assistantDisplayState === "streaming"
                            ? "min-h-[3.5rem] min-w-40 transition-[min-height] duration-150 ease-out"
                            : ""
                        } ${isEditing ? "w-full" : ""}`}
                      >
                        {isEditing ? (
                          <div className="space-y-3">
                            <textarea
                              value={editContent}
                              aria-label="Modifica messaggio"
                              onChange={(e) =>
                                onEditContentChange(e.target.value)
                              }
                              className="w-full rounded-md border border-border/70 bg-background/70 p-3 outline-none focus:ring-1 focus:ring-primary/50 dark:border-white/10 dark:bg-black/20"
                              rows={4}
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={onEditCancel}
                              >
                                <X className="mr-1 h-3 w-3" /> Cancella
                              </Button>
                              <Button size="sm" onClick={onEditSave}>
                                <Check className="mr-1 h-3 w-3" /> Salva
                              </Button>
                            </div>
                          </div>
                        ) : message.role === "assistant" ? (
                          comparisonData ? (
                            <ModelComparisonCard
                              data={comparisonData}
                              streamedText={
                                comparisonDeltas[comparisonData.pairId]
                              }
                              onResolved={
                                onModelComparisonResolved ??
                                (async () => undefined)
                              }
                            />
                          ) : isVoiceMessage ? (
                            <VoiceResponse
                              audioSrc={voiceAudioSrc}
                              transcript={messageText}
                              messageId={message.id}
                            />
                          ) : assistantDisplayState === "pending" ? (
                            <div
                              className="flex items-center gap-2 text-foreground"
                              aria-live="polite"
                            >
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                              <span className="font-medium text-foreground">
                                {assistantPendingLabel}
                              </span>
                            </div>
                          ) : (
                            /* Text message: show markdown */
                            <>
                              {assistantToolFeedback && (
                                <div
                                  className={`mb-3 flex items-center gap-2 text-foreground ${
                                    hasText
                                      ? "border-border/60 border-b pb-3"
                                      : ""
                                  }`}
                                  aria-live="polite"
                                >
                                  {(() => {
                                    const ToolIcon =
                                      ACTIVE_TOOL_ICONS[
                                        assistantToolFeedback.kind
                                      ];
                                    return (
                                      <ToolIcon
                                        className="h-3.5 w-3.5 text-muted-foreground"
                                        aria-hidden="true"
                                      />
                                    );
                                  })()}
                                  <span className="font-medium text-foreground">
                                    {assistantToolFeedback.label}
                                  </span>
                                </div>
                              )}
                              <MemoizedMarkdown
                                className={assistantMarkdownClassName}
                                content={messageText}
                              />
                              {message.voice?.reasonCode ===
                                "PLAN_NOT_ELIGIBLE" && (
                                <Link
                                  href="/pricing"
                                  className="mt-3 inline-flex border-border/60 border-t pt-3 text-xs font-semibold text-foreground underline underline-offset-4"
                                >
                                  Scopri i piani
                                </Link>
                              )}
                              {isVoiceGenerationPending && (
                                <output
                                  className="mt-3 flex items-center gap-2 border-border/60 border-t pt-3 text-xs text-muted-foreground"
                                  aria-live="polite"
                                >
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  <span>Sto preparando l&apos;audio…</span>
                                </output>
                              )}
                              {isVoiceGenerationUnavailable && (
                                <output className="mt-3 border-border/60 border-t pt-3 text-xs text-muted-foreground">
                                  L&apos;audio non è disponibile; puoi leggere
                                  la risposta qui sopra.
                                </output>
                              )}
                            </>
                          )
                        ) : (
                          <div className="whitespace-pre-wrap">
                            {messageText}
                          </div>
                        )}

                        {/* Display attachments from message parts */}
                        {hasAttachments && (
                          <div
                            className={`${
                              hasText ? "mt-2" : ""
                            } flex flex-wrap gap-2`}
                          >
                            {message.parts
                              ?.filter((part) => part.type === "file")
                              .map((part, idx: number) => {
                                const filePart =
                                  normalizeFilePartForPreview(part);
                                if (!filePart) return null;

                                // Use AudioPlayer for audio files
                                if (filePart.mimeType?.startsWith("audio/")) {
                                  return (
                                    <AudioPlayer
                                      key={filePart.attachmentId || idx}
                                      src={filePart.src}
                                      name={filePart.name}
                                      mimeType={filePart.mimeType}
                                    />
                                  );
                                }

                                return (
                                  <AttachmentPreview
                                    key={filePart.attachmentId || idx}
                                    attachment={{
                                      id:
                                        filePart.attachmentId ||
                                        `${message.id}-${idx}`,
                                      name: filePart.name,
                                      contentType: filePart.mimeType,
                                      size: filePart.size,
                                      url: filePart.src,
                                    }}
                                  />
                                );
                              })}
                          </div>
                        )}

                        {!isUser && isPersistedMessage && (
                          <TechnicalMetricsDetails
                            usage={getUsageFromAnnotations(message)}
                          />
                        )}
                      </div>

                      {capabilitiesUsed.length > 0 && (
                        <ul
                          aria-label="Capacità usate"
                          className="flex list-none flex-wrap items-center gap-1.5 px-1 text-[11px] text-muted-foreground"
                        >
                          {capabilitiesUsed.map((capability) => {
                            const indicator = CAPABILITY_INDICATORS[capability];
                            const IndicatorIcon = indicator.icon;
                            return (
                              <li
                                key={capability}
                                className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/35 px-2 py-1"
                              >
                                <IndicatorIcon
                                  className="h-3 w-3"
                                  aria-hidden="true"
                                />
                                <span>{indicator.label}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {routineProposal && (
                        <RoutineCard
                          proposal={routineProposal}
                          routine={routine}
                          sourceAssistantMessageId={message.id}
                          isGuest={isGuest}
                          registrationHref={registrationHref}
                          onSave={onSaveRoutine}
                          onCreateAttempt={onCreateRoutineAttempt}
                          onSaveOutcome={onSaveRoutineOutcome}
                          onArchive={onArchiveRoutine}
                          onTryNow={() => onTryRoutineNow(message.id)}
                          onAdapt={() => {
                            if (!routine) return;
                            onAdaptRoutine(routine.id, routine.proposal.title);
                          }}
                          isReused={isReusedRoutineMessage}
                          openCheckIn={openCheckInRoutineId === routine?.id}
                        />
                      )}

                      {isRoutineProposalOnly && (
                        <TechnicalMetricsDetails
                          usage={getUsageFromAnnotations(message)}
                        />
                      )}

                      {/* Actions Row */}
                      {!comparisonData && (
                        <m.div
                          initial={false}
                          animate={{
                            opacity: areMessageActionsVisible ? 1 : 0,
                          }}
                          transition={{
                            duration: duration.fast,
                            ease: ease.out,
                          }}
                          aria-hidden={
                            areMessageActionsVisible ? undefined : true
                          }
                          inert={areMessageActionsVisible ? undefined : true}
                          data-message-actions-slot
                          className={`flex min-h-8 min-w-0 max-w-full flex-wrap items-center gap-0.5 px-1 transition-opacity ${
                            isUser
                              ? "flex-row-reverse opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                              : areMessageActionsVisible
                                ? "opacity-100"
                                : "pointer-events-none opacity-0"
                          }`}
                        >
                          {!isEditing && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                  aria-label="Altre azioni sul messaggio"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align={isUser ? "end" : "start"}
                              >
                                {isUser ? (
                                  <>
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        onEditStart(message.id, messageText)
                                      }
                                      disabled={isLoading}
                                    >
                                      <Pencil /> Modifica messaggio
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      variant="destructive"
                                      onSelect={() => onDelete(message.id)}
                                    >
                                      {deletingMessageId === message.id ? (
                                        <Loader2 className="animate-spin" />
                                      ) : (
                                        <Trash2 />
                                      )}
                                      Elimina messaggio
                                    </DropdownMenuItem>
                                  </>
                                ) : (
                                  <>
                                    {!isRoutineProposalOnly && (
                                      <DropdownMenuItem
                                        onSelect={() => copy(messageText)}
                                      >
                                        {copied ? <Check /> : <Copy />}
                                        Copia messaggio
                                      </DropdownMenuItem>
                                    )}
                                    {isLastAssistant && !isLoading && (
                                      <DropdownMenuItem onSelect={onRegenerate}>
                                        <RefreshCw /> Rigenera risposta
                                      </DropdownMenuItem>
                                    )}
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}

                          {!isUser && canSubmitFeedbackForMessage && (
                            <>
                              <span className="ml-1 max-w-[10rem] truncate text-[11px] text-muted-foreground">
                                {isFeedbackSaving
                                  ? "Salvataggio…"
                                  : feedbackValue === 0
                                    ? "Ti è stata utile?"
                                    : "Feedback inviato"}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "h-8 w-8 rounded-md",
                                  feedbackValue === 1
                                    ? "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                                    : "text-muted-foreground hover:text-foreground",
                                )}
                                onClick={() => handleFeedback(message.id, 1)}
                                disabled={isFeedbackSaving}
                                aria-label="Pollice su: risposta utile"
                                aria-pressed={feedbackValue === 1}
                              >
                                {isFeedbackSaving && feedbackValue === 1 ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <ThumbsUp className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "h-8 w-8 rounded-md",
                                  feedbackValue === -1
                                    ? "bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive"
                                    : "text-muted-foreground hover:text-foreground",
                                )}
                                onClick={() => handleFeedback(message.id, -1)}
                                disabled={isFeedbackSaving}
                                aria-label="Pollice giù: risposta non utile"
                                aria-pressed={feedbackValue === -1}
                              >
                                {isFeedbackSaving && feedbackValue === -1 ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <ThumbsDown className="h-4 w-4" />
                                )}
                              </Button>
                            </>
                          )}
                        </m.div>
                      )}

                      {!isUser &&
                        canSubmitFeedbackForMessage &&
                        feedbackValue === -1 &&
                        feedbackReasonMenuMessageId === message.id && (
                          <fieldset className="max-w-full px-1">
                            <legend className="mb-1.5 text-xs font-medium text-foreground">
                              Cosa non ha funzionato?{" "}
                              <span className="font-normal text-muted-foreground">
                                Facoltativo
                              </span>
                            </legend>
                            <div className="flex max-w-96 flex-wrap gap-1">
                              {FEEDBACK_REASON_OPTIONS.map((option) => {
                                const isSelected =
                                  feedbackReasonState[message.id] ===
                                  option.value;

                                return (
                                  <Button
                                    key={option.value}
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className={cn(
                                      "h-7 rounded-md px-2 text-xs",
                                      isSelected
                                        ? "bg-destructive/10 text-destructive"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                    )}
                                    onClick={() =>
                                      handleFeedbackReason(
                                        message.id,
                                        option.value,
                                      )
                                    }
                                    disabled={isFeedbackSaving}
                                  >
                                    {option.label}
                                  </Button>
                                );
                              })}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                                onClick={() =>
                                  setFeedbackReasonMenuMessageId(null)
                                }
                                disabled={isFeedbackSaving}
                              >
                                Non ora
                              </Button>
                            </div>
                          </fieldset>
                        )}
                      {!isUser &&
                        canSubmitFeedbackForMessage &&
                        feedbackValue !== 0 &&
                        feedbackReasonMenuMessageId !== message.id && (
                          <output
                            className="flex max-w-full flex-wrap items-center gap-1 px-1 text-xs text-muted-foreground"
                            aria-live="polite"
                          >
                            <Check className="h-3 w-3 text-emerald-700 dark:text-emerald-400" />
                            <span>Grazie, ci aiuta a migliorare.</span>
                            {feedbackValue === -1 && feedbackReasonLabel && (
                              <span className="rounded-md bg-destructive/10 px-2 py-1 font-medium text-destructive">
                                {feedbackReasonLabel}
                              </span>
                            )}
                            {feedbackValue === -1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                                onClick={() =>
                                  setFeedbackReasonMenuMessageId(message.id)
                                }
                                disabled={isFeedbackSaving}
                              >
                                {feedbackReasonLabel
                                  ? "Modifica motivo"
                                  : "Aggiungi motivo"}
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                              onClick={() => handleFeedbackRemoval(message.id)}
                              disabled={isFeedbackSaving}
                            >
                              <X className="mr-1 h-3 w-3" />
                              Rimuovi feedback
                            </Button>
                          </output>
                        )}
                    </div>
                  </m.div>
                </div>
              );
            })}
          </div>

          {shouldShowPendingRow && isRegenerating && (
            <m.output
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={defaultTransition}
              className="group mt-8 mb-2 flex items-start gap-2"
              aria-live="polite"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-primary shadow-xs ring-1 ring-inset ring-border/70 dark:ring-white/10">
                {isRegenerating ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Brain className="h-5 w-5 animate-pulse" />
                )}
              </div>
              <div className="flex max-w-[85%] flex-col gap-2">
                <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm border border-border/60 bg-card px-4 py-3 text-sm text-foreground shadow-sm">
                  {!isRegenerating && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">
                      {pendingAssistantLabel}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {isRegenerating
                        ? CHAT_REACTIVITY_COPY.assistantRegeneratingDetail
                        : CHAT_REACTIVITY_COPY.assistantWorkingDetail}
                    </span>
                  </div>
                </div>
              </div>
            </m.output>
          )}
          <div ref={messagesEndRef} className="h-4" />
        </div>
      </div>

      {/* Scroll to bottom button */}
      <AnimatePresence>
        {showScrollButton && (
          <m.div
            initial={{
              opacity: 0,
              transform: shouldReduceMotion
                ? "translateX(-50%) scale(1)"
                : "translateX(-50%) scale(0.95)",
            }}
            animate={{
              opacity: 1,
              transform: "translateX(-50%) scale(1)",
            }}
            exit={{
              opacity: 0,
              transform: shouldReduceMotion
                ? "translateX(-50%) scale(1)"
                : "translateX(-50%) scale(0.95)",
            }}
            transition={defaultTransition}
            className="absolute bottom-4 left-1/2 z-10"
          >
            <Button
              size="icon"
              variant="secondary"
              className="rounded-full shadow-lg"
              onClick={scrollToBottom}
              aria-label={CHAT_REACTIVITY_COPY.scrollToBottom}
              title={CHAT_REACTIVITY_COPY.scrollToBottom}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function EmptyChatWelcome({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      <m.div
        variants={scaleIn}
        initial="hidden"
        animate="show"
        transition={defaultTransition}
        className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-linear-to-br from-primary/10 to-transparent ring-1 ring-border/70 dark:ring-white/10 md:h-24 md:w-24"
      >
        <Brain className="h-10 w-10 text-primary/80 md:h-12 md:w-12" />
      </m.div>
      <m.h2
        variants={fadeUp}
        initial="hidden"
        animate="show"
        transition={{ ...defaultTransition, delay: 0.15 }}
        className="mt-4 text-2xl font-semibold tracking-tight text-foreground md:mt-6 md:text-3xl"
      >
        Come posso aiutarti oggi?
      </m.h2>
    </div>
  );
}

function getUsageFromAnnotations(message: ExtendedMessage) {
  const annotations = (message as { annotations?: unknown[] }).annotations;
  return annotations?.find(hasUsageMetadata);
}

function hasUsageMetadata(value: unknown): value is {
  inputTokens: number;
  outputTokens: number;
  cost: number;
  generationTimeMs?: number;
  reasoningTimeMs?: number;
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const usage = value as Record<string, unknown>;
  return (
    typeof usage.inputTokens === "number" &&
    typeof usage.outputTokens === "number" &&
    typeof usage.cost === "number"
  );
}
