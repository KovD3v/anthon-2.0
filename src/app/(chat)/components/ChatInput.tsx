"use client";

import { Send, Square } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDebouncedCallback } from "@/hooks/useDebounce";
import type { AttachmentData } from "@/types/chat";
import { CHAT_REACTIVITY_COPY } from "../chat/chat-reactivity-ui";
import { AttachmentButton, AttachmentPreview } from "./Attachments";
import { AudioRecorder } from "./AudioRecorder";

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  disableAttachments?: boolean;
  onInputWarmup?: (value: string) => void;
  setInput: (value: string) => void;
  onSubmit: (e: React.FormEvent, attachments?: AttachmentData[]) => void;
  onStop: () => void;
}

export function ChatInput({
  input,
  isLoading,
  disableAttachments = false,
  onInputWarmup,
  setInput,
  onSubmit,
  onStop,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<AttachmentData[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(
    null,
  );
  const cannotSubmit =
    isUploading || isLoading || (!input.trim() && attachments.length === 0);

  const adjustHeight = useDebouncedCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, 16); // ~60fps debounce

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (cannotSubmit) {
        return;
      }

      const form = e.currentTarget.closest("form");
      if (form) {
        const submitEvent = new Event("submit", {
          bubbles: true,
          cancelable: true,
        });
        form.dispatchEvent(submitEvent);
      }
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cannotSubmit) {
      return;
    }

    onSubmit(e, attachments.length > 0 ? attachments : undefined);
    setAttachments([]); // Clear attachments after submit
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (file.size > maxSize) {
      toast.error(CHAT_REACTIVITY_COPY.uploadTooLarge);
      return;
    }

    setIsUploading(true);
    setUploadingFileName(file.name);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(CHAT_REACTIVITY_COPY.uploadFailed);
      }

      const data = await response.json();
      setAttachments([
        ...attachments,
        {
          id: data.id,
          name: data.name,
          contentType: data.contentType,
          size: data.size,
          url: data.url,
        },
      ]);
      toast.success(CHAT_REACTIVITY_COPY.uploadSuccess);
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(CHAT_REACTIVITY_COPY.uploadFailed);
    } finally {
      setIsUploading(false);
      setUploadingFileName(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(attachments.filter((a) => a.id !== id));
  };

  const handleRecordingComplete = (attachment: AttachmentData) => {
    setAttachments([...attachments, attachment]);
  };

  const uploadStatus = uploadingFileName
    ? `${CHAT_REACTIVITY_COPY.uploadUploading}: ${uploadingFileName}`
    : `${CHAT_REACTIVITY_COPY.uploadUploading}...`;

  return (
    <div className="relative mx-auto w-full min-w-0 shrink-0 max-w-3xl px-3 sm:px-4 pb-6 sm:pb-8 pt-2 safe-area-bottom">
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
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

      <form
        onSubmit={handleFormSubmit}
        className="relative flex items-end gap-2 rounded-4xl border border-border/70 bg-background/60 p-2 shadow-lg backdrop-blur-xl ring-1 ring-black/5 dark:border-white/10 dark:bg-muted/40 dark:ring-white/10 transition-all focus-within:ring-2 focus-within:ring-primary/20"
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="sr-only"
          aria-label="Seleziona file"
          onChange={(e) => handleFileSelect(e.target.files)}
          disabled={isUploading || isLoading}
          accept="image/*,.pdf,.doc,.docx,.txt,audio/*,.mp3,.wav,.ogg,.aac,.flac,.m4a"
        />

        {/* Attachment button - hidden for guests */}
        {!disableAttachments && (
          <div className="pb-1 pl-1">
            <AttachmentButton
              onClick={() => fileInputRef.current?.click()}
              hasAttachment={attachments.length > 0}
              className="h-9 w-9"
            />
          </div>
        )}

        {/* Microphone button for voice recording - hidden for guests */}
        {!disableAttachments && (
          <div className="pb-1">
            <AudioRecorder
              onRecordingComplete={handleRecordingComplete}
              disabled={isLoading || isUploading}
            />
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            const nextInput = e.target.value;
            setInput(nextInput);
            onInputWarmup?.(nextInput);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Scrivi un messaggio..."
          rows={1}
          className="min-w-0 flex-1 resize-none bg-transparent px-2 py-3 text-sm outline-none placeholder:text-muted-foreground/50 max-h-[200px] overflow-y-auto scrollbar-none"
          disabled={isLoading || isUploading}
        />
        <div className="pb-1 pr-1">
          {isLoading ? (
            <Button
              type="button"
              size="icon"
              variant="destructive"
              className="h-9 w-9 rounded-full shadow-sm transition-all hover:shadow-md"
              onClick={onStop}
              aria-label="Interrompi risposta"
            >
              <Square className="h-4 w-4 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className={`h-9 w-9 rounded-full transition-all duration-200 ${
                input.trim() || attachments.length > 0
                  ? "bg-primary text-primary-foreground shadow-md hover:shadow-lg hover:scale-105"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
              disabled={cannotSubmit}
              aria-label="Invia messaggio"
            >
              <Send className="h-4 w-4 ml-0.5" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
