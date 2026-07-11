"use client";

import type { UIMessage } from "ai";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import {
  ArrowDown,
  Brain,
  Check,
  Copy,
  Loader2,
  Pencil,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { normalizeFilePartForPreview } from "@/lib/chat-client";
import { formatRelativeTime } from "@/lib/format-time";
import { defaultTransition, fadeUp, scaleIn } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  ASSISTANT_READING_MAX_MS,
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
import { useMessageVirtualizer } from "./hooks/useMessageVirtualizer";
import { MemoizedMarkdown } from "./MemoizedMarkdown";
import { VoiceResponse } from "./VoiceResponse";

// Extended UIMessage type that includes database fields
type ExtendedMessage = UIMessage & {
  createdAt?: string | Date;
  attachments?: Array<{
    contentType: string;
    blobUrl: string;
  }>;
};

interface MessageListProps {
  messages: ExtendedMessage[];
  status: ChatRequestStatus;
  isLoading: boolean;
  editingMessageId: string | null;
  deletingMessageId: string | null;
  onEditStart: (id: string, content: string) => void;
  onEditCancel: () => void;
  onEditSave: () => void;
  onEditContentChange: (content: string) => void;
  editContent: string;
  onDelete: (id: string) => void;
  onRegenerate: () => void;
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
  "prose prose-sm max-w-none prose-p:leading-relaxed prose-headings:text-black prose-p:text-black prose-strong:text-black prose-li:text-black prose-a:text-black prose-code:text-black prose-pre:bg-black/10 prose-pre:border prose-pre:border-black/10 prose-pre:rounded-xl";

const FEEDBACK_REASON_OPTIONS = [
  { value: "linguistic_error", label: "Errore linguistico" },
  { value: "wrong_fact", label: "Fatto sbagliato" },
  { value: "context_missed", label: "Non ha capito il contesto" },
  { value: "too_generic", label: "Troppo generico" },
  { value: "tool_search_problem", label: "Problema tool/search" },
  { value: "other", label: "Altro" },
] as const;

type FeedbackReason = (typeof FEEDBACK_REASON_OPTIONS)[number]["value"];

function getFeedbackReasonLabel(reason: FeedbackReason | undefined) {
  return FEEDBACK_REASON_OPTIONS.find((option) => option.value === reason)
    ?.label;
}

async function submitFeedback(
  messageId: string,
  feedback: number,
  selectedReason?: FeedbackReason,
) {
  await fetch("/api/chat/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messageId,
      feedback,
      reason: selectedReason,
    }),
  });
}

export function MessageList({
  messages,
  status,
  isLoading,
  editingMessageId,
  deletingMessageId,
  onEditStart,
  onEditCancel,
  onEditSave,
  onEditContentChange,
  editContent,
  onDelete,
  onRegenerate,
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
  const [submittedElapsedMs, setSubmittedElapsedMs] = useState(0);
  const latestMessage = messages[messages.length - 1];
  const assistantPendingLabel = getAssistantPendingLabel({
    status,
    latestMessage,
    submittedElapsedMs,
  });
  const visibleMessages = useMemo(
    () =>
      messages.filter(
        (message, index) =>
          getAssistantMessageLifecycle({
            message,
            isLatest: index === messages.length - 1,
            pendingLabel: assistantPendingLabel,
            hasRenderableAttachment: hasPersistedAudioAttachment(message),
          }) !== "hidden",
      ),
    [messages, assistantPendingLabel],
  );
  const shouldShowPendingRow = shouldRenderAssistantPendingRow({
    pendingLabel: assistantPendingLabel,
    latestMessage,
  });
  const { parentRef, rowVirtualizer } = useMessageVirtualizer(
    visibleMessages.length,
  );

  useEffect(() => {
    if (status !== "submitted") {
      setSubmittedElapsedMs(0);
      return;
    }

    setSubmittedElapsedMs(0);
    const timeoutId = window.setTimeout(() => {
      setSubmittedElapsedMs(ASSISTANT_READING_MAX_MS);
    }, ASSISTANT_READING_MAX_MS);

    return () => window.clearTimeout(timeoutId);
  }, [status]);

  async function handleFeedback(messageId: string, feedback: number) {
    const currentFeedback = feedbackState[messageId];
    // Toggle off if same feedback
    const newFeedback = currentFeedback === feedback ? 0 : feedback;

    setFeedbackState((prev) => ({ ...prev, [messageId]: newFeedback }));
    if (newFeedback === -1) {
      setFeedbackReasonMenuMessageId(messageId);
    } else {
      setFeedbackReasonMenuMessageId(null);
      setFeedbackReasonState((prev) => ({ ...prev, [messageId]: undefined }));
    }

    try {
      await submitFeedback(messageId, newFeedback);
    } catch (error) {
      console.error("Feedback error:", error);
      toast.error(CHAT_REACTIVITY_COPY.feedbackFailed);
    }
  }

  async function handleFeedbackReason(
    messageId: string,
    selectedReason: FeedbackReason,
  ) {
    setFeedbackState((prev) => ({ ...prev, [messageId]: -1 }));
    setFeedbackReasonState((prev) => ({
      ...prev,
      [messageId]: selectedReason,
    }));
    setFeedbackReasonMenuMessageId(null);

    try {
      await submitFeedback(messageId, -1, selectedReason);
    } catch (error) {
      console.error("Feedback reason error:", error);
      toast.error(CHAT_REACTIVITY_COPY.feedbackFailed);
    }
  }

  async function handleFeedbackRemoval(messageId: string) {
    setFeedbackState((prev) => ({ ...prev, [messageId]: 0 }));
    setFeedbackReasonState((prev) => ({ ...prev, [messageId]: undefined }));
    setFeedbackReasonMenuMessageId(null);

    try {
      await submitFeedback(messageId, 0);
    } catch (error) {
      console.error("Feedback removal error:", error);
      toast.error(CHAT_REACTIVITY_COPY.feedbackFailed);
    }
  }

  // Virtualize the message list for better performance with many messages
  // (useVirtualizer is encapsulated in useMessageVirtualizer hook)

  // Auto-scroll to bottom when messages load or new message arrives
  useEffect(() => {
    // Scroll to bottom on initial load or when new messages are added
    if (messages.length > 0 && parentRef.current) {
      // Use setTimeout to ensure virtualizer has calculated heights
      const timeoutId = setTimeout(() => {
        if (parentRef.current) {
          parentRef.current.scrollTop = parentRef.current.scrollHeight;
        }
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [messages.length, parentRef.current]);

  const handleScroll = useCallback(() => {
    if (!parentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setShowScrollButton(distanceFromBottom > 200);

    if (scrollTop < 100 && hasMoreMessages && !isLoadingMore && onLoadMore) {
      onLoadMore();
    }
  }, [parentRef, hasMoreMessages, isLoadingMore, onLoadMore]);

  useEffect(() => {
    const container = parentRef.current;
    if (!container) return;
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [handleScroll, parentRef.current]);

  function scrollToBottom() {
    parentRef.current?.scrollTo({
      top: parentRef.current.scrollHeight,
      behavior: "smooth",
    });
  }

  if (messages.length === 0) {
    return <EmptyChatWelcome className="flex-1 justify-center p-8" />;
  }

  return (
    <>
      <div
        ref={parentRef}
        className="flex-1 min-w-0 overflow-y-auto px-4 py-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent relative"
      >
        <div className="mx-auto max-w-3xl">
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
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const message = visibleMessages[virtualRow.index];
              const isEditing = editingMessageId === message.id;
              const messageText = getMessageText(message);
              const isLastAssistant =
                message.role === "assistant" &&
                message.id === visibleMessages[visibleMessages.length - 1]?.id;
              const isUser = message.role === "user";
              const assistantLifecycle = getAssistantMessageLifecycle({
                message,
                isLatest: message.id === latestMessage?.id,
                pendingLabel: assistantPendingLabel,
                hasRenderableAttachment: hasPersistedAudioAttachment(message),
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
              const shouldAnimateMount = shouldAnimateAssistantMessageMount({
                message,
                displayState: assistantDisplayState,
              });

              const hasAttachments = message.parts?.some(
                (part) => part.type === "file",
              );
              const hasText = messageText.trim().length > 0;
              const isAttachmentOnly = hasAttachments && !hasText;
              const feedbackReasonLabel = getFeedbackReasonLabel(
                feedbackReasonState[message.id],
              );

              // Voice message state from persisted DB attachments.
              const dbVoiceAttachment = message.attachments?.find((a) =>
                a.contentType.startsWith("audio/"),
              );

              const isVoiceMessage = !!dbVoiceAttachment;
              const voiceAudioSrc = dbVoiceAttachment?.blobUrl;

              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
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
                    className={`group flex items-start gap-2 mb-8 ${
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
                      className={`flex max-w-[85%] flex-col gap-2 ${
                        isUser ? "items-end" : "items-start"
                      }`}
                    >
                      {/* Name & Meta (Optional, mostly for assistant) */}
                      {!isUser && (
                        <div className="flex items-center gap-2 px-1">
                          <span className="text-xs font-semibold text-foreground/80">
                            Anthon
                          </span>
                          {message.createdAt && (
                            <span className="text-xs text-muted-foreground/50">
                              {formatRelativeTime(message.createdAt)}
                            </span>
                          )}
                        </div>
                      )}
                      {isUser && message.createdAt && (
                        <div className="flex items-center gap-2 px-1 justify-end">
                          <span className="text-xs text-muted-foreground/50">
                            {formatRelativeTime(message.createdAt)}
                          </span>
                        </div>
                      )}

                      <m.div
                        layout={!shouldReduceMotion}
                        transition={{
                          layout: {
                            duration: 0.18,
                            ease: [0.77, 0, 0.175, 1],
                          },
                        }}
                        className={`relative text-sm leading-relaxed ${
                          /* Only apply bubble styling if there's text or we are editing */
                          !isAttachmentOnly || isEditing
                            ? `px-5 py-3.5 shadow-sm ${
                                isUser
                                  ? "rounded-2xl rounded-tr-sm bg-primary text-primary-foreground"
                                  : "rounded-2xl rounded-tl-sm bg-[#c4cd4c] text-black"
                              }`
                            : "p-0 bg-transparent" /* Transparent for standalone attachments */
                        } ${
                          assistantDisplayState === "streaming"
                            ? "min-h-[3.5rem] min-w-40 transition-[min-height,width] duration-150 ease-out"
                            : ""
                        } ${isEditing ? "w-full min-w-75" : ""}`}
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
                          isVoiceMessage ? (
                            <VoiceResponse
                              audioSrc={voiceAudioSrc}
                              transcript={messageText}
                              messageId={message.id}
                            />
                          ) : assistantDisplayState === "pending" ? (
                            <div
                              className="flex items-center gap-2 text-black"
                              aria-live="polite"
                            >
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-black" />
                              <div className="flex flex-col">
                                <span className="font-medium text-black">
                                  {assistantPendingLabel}
                                </span>
                                <span className="text-xs text-black/70">
                                  {CHAT_REACTIVITY_COPY.assistantWorkingDetail}
                                </span>
                              </div>
                            </div>
                          ) : (
                            /* Text message: show markdown */
                            <>
                              {assistantToolFeedback && (
                                <div
                                  className={`mb-3 flex items-center gap-2 text-black ${
                                    hasText
                                      ? "border-black/10 border-b pb-3"
                                      : ""
                                  }`}
                                  aria-live="polite"
                                >
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-black" />
                                  <span className="font-medium text-black">
                                    {assistantToolFeedback}
                                  </span>
                                </div>
                              )}
                              <MemoizedMarkdown
                                className={assistantMarkdownClassName}
                                content={messageText}
                              />
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

                        {/* Message Metrics (Assistant only) */}
                        {!isUser &&
                          (() => {
                            const annotations = (
                              message as {
                                annotations?: unknown[];
                              }
                            ).annotations;
                            const metadata = (
                              message as {
                                metadata?: unknown;
                              }
                            ).metadata;

                            const metadataUsage = hasUsageMetadata(metadata)
                              ? metadata
                              : undefined;
                            const annotationUsage =
                              annotations?.find(hasUsageMetadata);
                            const usageAnn = (metadataUsage ??
                              annotationUsage) as
                              | {
                                  inputTokens?: number;
                                  outputTokens?: number;
                                  generationTimeMs?: number;
                                  reasoningTimeMs?: number;
                                }
                              | undefined;

                            if (!usageAnn) return null;

                            const timeInSeconds = usageAnn.generationTimeMs
                              ? (usageAnn.generationTimeMs / 1000).toFixed(2)
                              : null;

                            const totalTokens =
                              (usageAnn.inputTokens || 0) +
                              (usageAnn.outputTokens || 0);

                            return (
                              <div className="mt-3 flex items-center gap-4 text-xs text-zinc-700 select-none">
                                <div className="flex items-center gap-1.5">
                                  <span>{totalTokens} tokens</span>
                                  <span className="text-zinc-600">•</span>
                                  <span>{usageAnn.inputTokens || 0} in</span>
                                  <span className="text-zinc-600">/</span>
                                  <span>{usageAnn.outputTokens || 0} out</span>
                                </div>
                                {timeInSeconds && (
                                  <>
                                    <span className="text-zinc-600">•</span>
                                    <div className="flex items-center gap-1.5">
                                      <span>{timeInSeconds}s</span>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })()}
                      </m.div>

                      {/* Actions Row */}
                      <div
                        className={`flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 px-1 ${
                          isUser ? "flex-row-reverse" : ""
                        }`}
                      >
                        {isUser && !isEditing && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                onEditStart(message.id, messageText)
                              }
                              disabled={isLoading}
                              aria-label="Modifica messaggio"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => onDelete(message.id)}
                              aria-label="Elimina messaggio"
                            >
                              {deletingMessageId === message.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </Button>
                          </>
                        )}

                        {!isUser && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-foreground"
                              onClick={() => copy(messageText)}
                              aria-label={
                                copied ? "Messaggio copiato" : "Copia messaggio"
                              }
                            >
                              {copied ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-6 w-6 ${
                                feedbackState[message.id] === 1
                                  ? "text-green-500"
                                  : "text-muted-foreground hover:text-green-500"
                              }`}
                              onClick={() => handleFeedback(message.id, 1)}
                              aria-label="Risposta utile"
                            >
                              <ThumbsUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-6 w-6 ${
                                feedbackState[message.id] === -1
                                  ? "text-red-500"
                                  : "text-muted-foreground hover:text-red-500"
                              }`}
                              onClick={() => handleFeedback(message.id, -1)}
                              aria-label="Risposta non utile"
                            >
                              <ThumbsDown className="h-3 w-3" />
                            </Button>
                          </>
                        )}

                        {isLastAssistant && !isLoading && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={onRegenerate}
                            aria-label="Rigenera risposta"
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                        )}
                      </div>

                      {!isUser &&
                        feedbackState[message.id] === -1 &&
                        feedbackReasonMenuMessageId === message.id && (
                          <fieldset className="flex max-w-80 flex-wrap gap-1 px-1">
                            <legend className="sr-only">
                              Motivo feedback negativo
                            </legend>
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
                                  className={`h-7 rounded-md px-2 text-xs ${
                                    isSelected
                                      ? "bg-red-500/10 text-red-600"
                                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                  }`}
                                  onClick={() =>
                                    handleFeedbackReason(
                                      message.id,
                                      option.value,
                                    )
                                  }
                                >
                                  {option.label}
                                </Button>
                              );
                            })}
                          </fieldset>
                        )}
                      {!isUser && feedbackState[message.id] === -1 && (
                        <div className="flex max-w-full flex-wrap items-center gap-1 px-1">
                          {feedbackReasonLabel && (
                            <span className="rounded-md bg-red-500/10 px-2 py-1 text-xs font-medium text-red-600">
                              {feedbackReasonLabel}
                            </span>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={() => handleFeedbackRemoval(message.id)}
                          >
                            <X className="mr-1 h-3 w-3" />
                            Rimuovi feedback
                          </Button>
                        </div>
                      )}
                    </div>
                  </m.div>
                </div>
              );
            })}
          </div>

          {shouldShowPendingRow && (
            <m.output
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={defaultTransition}
              className="group mt-8 mb-2 flex items-start gap-2"
              aria-live="polite"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-primary shadow-xs ring-1 ring-inset ring-border/70 dark:ring-white/10">
                <Brain className="h-5 w-5 animate-pulse" />
              </div>
              <div className="flex max-w-[85%] flex-col gap-2">
                <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm bg-[#c4cd4c] px-4 py-3 text-sm text-black shadow-sm">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-black" />
                  <div className="flex flex-col">
                    <span className="font-medium text-black">
                      {assistantPendingLabel}
                    </span>
                    <span className="text-xs text-black/70">
                      {CHAT_REACTIVITY_COPY.assistantWorkingDetail}
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
            className="absolute bottom-28 left-1/2 z-10"
          >
            <Button
              size="sm"
              variant="secondary"
              className="rounded-full shadow-lg gap-1.5"
              onClick={scrollToBottom}
            >
              <ArrowDown className="h-3 w-3" />
              {CHAT_REACTIVITY_COPY.scrollToBottom}
            </Button>
          </m.div>
        )}
      </AnimatePresence>
    </>
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
        className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-linear-to-br from-primary/10 to-transparent ring-1 ring-border/70 dark:ring-white/10"
      >
        <Brain className="h-12 w-12 text-primary/80" />
      </m.div>
      <m.h2
        variants={fadeUp}
        initial="hidden"
        animate="show"
        transition={{ ...defaultTransition, delay: 0.15 }}
        className="mt-6 text-3xl font-semibold tracking-tight text-foreground"
      >
        Come posso aiutarti oggi?
      </m.h2>
    </div>
  );
}

function hasUsageMetadata(value: unknown): value is {
  inputTokens?: number;
  outputTokens?: number;
  generationTimeMs?: number;
  reasoningTimeMs?: number;
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const usage = value as Record<string, unknown>;
  return usage.inputTokens !== undefined || usage.outputTokens !== undefined;
}
