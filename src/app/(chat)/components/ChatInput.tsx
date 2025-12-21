"use client";

import { Send, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDebouncedCallback } from "@/hooks/useDebounce";
import type { AttachmentData } from "@/types/chat";
import { AttachmentButton, AttachmentPreview } from "./Attachments";
import { AudioRecorder } from "./AudioRecorder";

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  disableAttachments?: boolean;
  setInput: (value: string) => void;
  onSubmit: (e: React.FormEvent, attachments?: AttachmentData[]) => void;
  onStop: () => void;
}

export function ChatInput({
  input,
  isLoading,
  disableAttachments = false,
  setInput,
  onSubmit,
  onStop,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<AttachmentData[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const adjustHeight = useDebouncedCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, 16); // ~60fps debounce

  useEffect(() => {
    adjustHeight();
  }, [adjustHeight]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
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
    onSubmit(e, attachments.length > 0 ? attachments : undefined);
    setAttachments([]); // Clear attachments after submit
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (file.size > maxSize) {
      toast.error("File too large. Maximum size is 10MB.");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
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
      toast.success("File uploaded successfully");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload file");
    } finally {
      setIsUploading(false);
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

  return (
    <div className="relative mx-auto w-full max-w-3xl px-3 sm:px-4 pb-4 sm:pb-6 pt-2 safe-area-bottom">
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

      <form
        onSubmit={handleFormSubmit}
        className="relative flex items-end gap-2 rounded-4xl border border-white/10 bg-background/60 p-2 shadow-lg backdrop-blur-xl ring-1 ring-black/5 dark:bg-muted/40 dark:ring-white/10 transition-all focus-within:ring-2 focus-within:ring-primary/20"
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="sr-only"
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
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          rows={1}
          className="flex-1 resize-none bg-transparent px-2 py-3 text-sm outline-none placeholder:text-muted-foreground/50 max-h-[200px] overflow-y-auto scrollbar-none"
          disabled={isLoading}
        />
        <div className="pb-1 pr-1">
          {isLoading ? (
            <Button
              type="button"
              size="icon"
              variant="destructive"
              className="h-9 w-9 rounded-full shadow-sm transition-all hover:shadow-md"
              onClick={onStop}
              aria-label="Stop generating"
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
              disabled={!input.trim() && attachments.length === 0}
              aria-label="Send message"
            >
              <Send className="h-4 w-4 ml-0.5" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
