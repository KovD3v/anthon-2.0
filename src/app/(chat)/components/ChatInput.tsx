"use client";

import { AnimatePresence, m } from "framer-motion";
import { Send, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { duration, ease } from "@/lib/motion";
import {
  CHAT_ATTACHMENT_ACCEPT,
  isSupportedChatAttachment,
} from "@/lib/uploads/chat-file-types";
import type { AttachmentData } from "@/types/chat";
import { CHAT_REACTIVITY_COPY } from "../chat/chat-reactivity-ui";
import { AttachmentButton, AttachmentPreview } from "./Attachments";
import { AudioPlayer } from "./AudioPlayer";
import { AudioRecorder } from "./AudioRecorder";

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  disableAttachments?: boolean;
  disabledReason?: string;
  focusRequestId?: number;
  onInputWarmup?: (value: string) => void;
  setInput: (value: string) => void;
  onSubmit: (e: React.FormEvent, attachments?: AttachmentData[]) => void;
  onStop: () => void;
}

export function ChatInput({
  input,
  isLoading,
  disableAttachments = false,
  disabledReason,
  focusRequestId,
  onInputWarmup,
  setInput,
  onSubmit,
  onStop,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previousFocusRequestIdRef = useRef(focusRequestId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<AttachmentData[]>([]);
  const [isRecorderBusy, setIsRecorderBusy] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(
    null,
  );
  const externallyDisabled = Boolean(disabledReason);
  const audioAttachment = attachments.find((attachment) =>
    attachment.contentType.startsWith("audio/"),
  );
  const documentAttachments = attachments.filter(
    (attachment) => !attachment.contentType.startsWith("audio/"),
  );
  const isTextareaAvailable = !audioAttachment;
  const isTextareaEnabled =
    isTextareaAvailable &&
    !isRecorderBusy &&
    !externallyDisabled &&
    !isUploading &&
    !isLoading;
  const cannotSubmit =
    externallyDisabled ||
    isRecorderBusy ||
    isUploading ||
    isLoading ||
    (!input.trim() && attachments.length === 0);

  useEffect(() => {
    if (!isTextareaAvailable) return;
    const textarea = textareaRef.current;
    if (!textarea || textarea.value !== input) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [input, isTextareaAvailable]);

  useEffect(() => {
    if (
      !isTextareaEnabled ||
      focusRequestId === undefined ||
      focusRequestId === previousFocusRequestIdRef.current
    ) {
      return;
    }
    const textarea = textareaRef.current;
    if (!textarea) return;
    previousFocusRequestIdRef.current = focusRequestId;
    textarea.focus();
  }, [focusRequestId, isTextareaEnabled]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || window.innerWidth < 768) {
      return;
    }

    e.preventDefault();
    if (cannotSubmit) {
      return;
    }

    e.currentTarget.form?.requestSubmit();
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cannotSubmit) {
      return;
    }

    onSubmit(e, attachments.length > 0 ? attachments : undefined);
    setAttachments([]); // Clear attachments after submit
  };

  const resetFileUploadState = () => {
    setIsUploading(false);
    setUploadingFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!isSupportedChatAttachment(file.name)) {
      toast.error(CHAT_REACTIVITY_COPY.uploadUnsupported);
      resetFileUploadState();
      return;
    }

    if (file.size > maxSize) {
      toast.error(CHAT_REACTIVITY_COPY.uploadTooLarge);
      resetFileUploadState();
      return;
    }

    setIsUploading(true);
    setUploadingFileName(file.name);

    const formData = new FormData();
    formData.append("file", file);

    let response: Response;
    try {
      response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(CHAT_REACTIVITY_COPY.uploadFailed);
      resetFileUploadState();
      return;
    }

    if (!response.ok) {
      toast.error(CHAT_REACTIVITY_COPY.uploadFailed);
      resetFileUploadState();
      return;
    }

    let data: AttachmentData;
    try {
      data = (await response.json()) as AttachmentData;
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(CHAT_REACTIVITY_COPY.uploadFailed);
      resetFileUploadState();
      return;
    }

    const attachment = {
      id: data.id,
      name: data.name,
      contentType: data.contentType,
      size: data.size,
      url: data.url,
    };

    if (attachment.contentType.startsWith("audio/")) {
      setInput("");
      setAttachments([attachment]);
    } else {
      setAttachments((current) => [...current, attachment]);
    }
    toast.success(CHAT_REACTIVITY_COPY.uploadSuccess);
    resetFileUploadState();
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((current) => current.filter((a) => a.id !== id));
  };

  const handleRecordingComplete = (attachment: AttachmentData) => {
    setInput("");
    setAttachments([attachment]);
  };

  const uploadStatus = uploadingFileName
    ? `${CHAT_REACTIVITY_COPY.uploadUploading}: ${uploadingFileName}`
    : `${CHAT_REACTIVITY_COPY.uploadUploading}...`;

  return (
    <div className="relative mx-auto w-full min-w-0 shrink-0 max-w-full px-2 pb-3 pt-2 safe-area-bottom sm:max-w-3xl sm:px-4 sm:pb-8">
      {/* Attachment previews */}
      {documentAttachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {documentAttachments.map((attachment) => (
            <AttachmentPreview
              key={attachment.id}
              attachment={attachment}
              onRemove={() => handleRemoveAttachment(attachment.id)}
              className="max-w-xs"
            />
          ))}
        </div>
      )}

      {isUploading && (
        <output
          className="mb-2 flex items-center gap-2 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-muted-foreground"
          aria-live="polite"
        >
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" />
          <span className="min-w-0 truncate">{uploadStatus}</span>
        </output>
      )}

      {disabledReason && (
        <p
          className="mb-2 text-center text-xs font-medium text-muted-foreground"
          aria-live="polite"
        >
          {disabledReason}
        </p>
      )}
      <form
        onSubmit={handleFormSubmit}
        className="relative flex min-w-0 max-w-full items-end gap-1 rounded-4xl border border-border/70 bg-background/60 p-1.5 shadow-lg backdrop-blur-xl ring-1 ring-black/5 transition-[border-color,box-shadow] focus-within:ring-2 focus-within:ring-primary/20 dark:border-white/10 dark:bg-muted/40 dark:ring-white/10 sm:gap-2 sm:p-2"
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="sr-only"
          aria-label="Scegli un file da allegare"
          onChange={(e) => handleFileSelect(e.target.files)}
          disabled={externallyDisabled || isUploading || isLoading}
          accept={CHAT_ATTACHMENT_ACCEPT}
        />

        {/* Attachment button - hidden for guests */}
        {!disableAttachments && !audioAttachment && !isRecorderBusy && (
          <div className="pb-0.5 pl-0.5">
            <AttachmentButton
              onClick={() => fileInputRef.current?.click()}
              hasAttachment={attachments.length > 0}
              className="h-10 w-10"
            />
          </div>
        )}

        {/* Microphone button for voice recording - hidden for guests */}
        {!disableAttachments && !audioAttachment && (
          <div className="pb-0.5">
            <AudioRecorder
              onRecordingComplete={handleRecordingComplete}
              onRecordingStateChange={setIsRecorderBusy}
              disabled={externallyDisabled || isLoading || isUploading}
            />
          </div>
        )}

        {audioAttachment ? (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <AudioPlayer
              src={audioAttachment.url}
              name={audioAttachment.name}
              mimeType={audioAttachment.contentType}
              className="min-w-0 flex-1"
              variant="composer"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 rounded-full text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => handleRemoveAttachment(audioAttachment.id)}
              disabled={externallyDisabled || isLoading}
              aria-label={`Rimuovi ${audioAttachment.name}`}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : isRecorderBusy ? (
          <div className="min-w-0 flex-1" />
        ) : (
          <textarea
            id="messaggio-chat"
            ref={textareaRef}
            value={input}
            aria-label="Scrivi un messaggio"
            onChange={(e) => {
              const nextInput = e.target.value;
              setInput(nextInput);
              onInputWarmup?.(nextInput);
            }}
            onKeyDown={handleKeyDown}
            placeholder={disabledReason ?? "Scrivi un messaggio…"}
            rows={1}
            className="min-w-0 flex-1 max-w-full resize-none overflow-y-auto bg-transparent px-2 py-2.5 text-base outline-none placeholder:text-muted-foreground/50 scrollbar-none max-h-[132px] sm:max-h-[200px] sm:py-3 sm:text-sm"
            disabled={externallyDisabled || isLoading || isUploading}
          />
        )}
        {!isRecorderBusy && (
          <div className="grid shrink-0 pb-0.5 pr-0.5">
            <AnimatePresence initial={false} mode="popLayout">
              <m.div
                key={isLoading ? "stop" : "send"}
                className="col-start-1 row-start-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: duration.fast, ease: ease.out }}
              >
                {isLoading ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="destructive"
                    className="h-11 w-11 rounded-full shadow-sm transition-shadow hover:shadow-md"
                    onClick={onStop}
                    aria-label="Interrompi risposta"
                  >
                    <Square className="h-4 w-4 fill-current" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    size="icon"
                    className={`h-11 w-11 rounded-full transition-[background-color,color,box-shadow,transform] duration-200 ${
                      input.trim() || attachments.length > 0
                        ? "bg-primary text-primary-foreground shadow-md hover:shadow-lg [@media(hover:hover)_and_(pointer:fine)_and_(prefers-reduced-motion:no-preference)]:hover:scale-105"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                    disabled={cannotSubmit}
                    aria-label="Invia messaggio"
                  >
                    <Send className="ml-0.5 h-4 w-4" />
                  </Button>
                )}
              </m.div>
            </AnimatePresence>
          </div>
        )}
      </form>
    </div>
  );
}
