"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import type { UIMessage } from "ai";
import { motion } from "framer-motion";
import {
  Brain,
  Check,
  Copy,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AttachmentPreview } from "./Attachments";

interface AttachmentData {
  id: string;
  name: string;
  contentType: string;
  size: number;
  url: string;
}

interface MessageListProps {
  messages: UIMessage[];
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
}

export function MessageList({
  messages,
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
}: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Virtualize the message list for better performance with many messages
  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 150, // Estimated message height
    overscan: 5, // Number of items to render outside of viewport
  });

  // Auto-scroll to bottom on initial load and when loading
  useEffect(() => {
    if (parentRef.current) {
      parentRef.current.scrollTop = parentRef.current.scrollHeight;
    }
  }, []);

  const getMessageText = (message: UIMessage) => {
    return (
      message.parts
        ?.map((part) => (part.type === "text" ? part.text : ""))
        .join("") || ""
    );
  };

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-linear-to-br from-primary/10 to-transparent ring-1 ring-white/10"
        >
          <Brain className="h-12 w-12 text-primary/80" />
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="mt-6 text-2xl font-bold tracking-tight text-foreground"
        >
          How can I help you today?
        </motion.h2>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto px-4 py-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
    >
      <div className="mx-auto max-w-3xl">
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const message = messages[virtualRow.index];
            const isEditing = editingMessageId === message.id;
            const messageText = getMessageText(message);
            const isLastAssistant =
              message.role === "assistant" &&
              virtualRow.index === messages.length - 1;
            const isUser = message.role === "user";

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
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`group flex items-start gap-3 mb-8 ${
                    isUser ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-xs ring-1 ring-inset ${
                      isUser
                        ? "bg-primary text-primary-foreground ring-primary/20"
                        : "bg-background text-primary ring-white/10"
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
                      </div>
                    )}

                    <div
                      className={`relative px-5 py-3.5 shadow-sm text-sm leading-relaxed ${
                        isUser
                          ? "rounded-2xl rounded-tr-sm bg-primary text-primary-foreground"
                          : "rounded-2xl rounded-tl-sm bg-background/60 backdrop-blur-sm border border-white/10 text-foreground"
                      } ${isEditing ? "w-full min-w-[300px]" : ""}`}
                    >
                      {isEditing ? (
                        <div className="space-y-3">
                          <textarea
                            value={editContent}
                            onChange={(e) =>
                              onEditContentChange(e.target.value)
                            }
                            className="w-full rounded-md border border-white/10 bg-black/20 p-3 outline-none focus:ring-1 focus:ring-primary/50"
                            rows={4}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={onEditCancel}
                            >
                              <X className="mr-1 h-3 w-3" /> Cancel
                            </Button>
                            <Button size="sm" onClick={onEditSave}>
                              <Check className="mr-1 h-3 w-3" /> Save
                            </Button>
                          </div>
                        </div>
                      ) : message.role === "assistant" ? (
                        <div className="prose prose-sm max-w-none dark:prose-invert prose-p:leading-relaxed prose-pre:bg-black/30 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-xl">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {messageText}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap">{messageText}</div>
                      )}

                      {/* Display attachments from message parts */}
                      {message.parts?.some((part) => part.type === "file") && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {message.parts
                            ?.filter((part) => part.type === "file")
                            .map((part, idx: number) => (
                              <AttachmentPreview
                                key={part.attachmentId || idx}
                                attachment={{
                                  id:
                                    part.attachmentId || `${message.id}-${idx}`,
                                  name: part.name,
                                  contentType: part.mimeType,
                                  size: part.size || 0,
                                  url: part.data,
                                }}
                                className="max-w-[200px]"
                              />
                            ))}
                        </div>
                      )}

                      {/* Display attachments from annotations (legacy) */}
                      {message.annotations &&
                        Array.isArray(message.annotations) &&
                        message.annotations.some(
                          (ann: unknown) =>
                            (ann as Record<string, unknown>)?.attachments,
                        ) && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {message.annotations
                              .filter(
                                (ann: unknown) =>
                                  (ann as Record<string, unknown>)?.attachments,
                              )
                              .flatMap(
                                (ann: unknown) =>
                                  (ann as Record<string, unknown>)
                                    .attachments as AttachmentData[],
                              )
                              .map((attachment: AttachmentData) => (
                                <AttachmentPreview
                                  key={attachment.id}
                                  attachment={attachment}
                                  className="max-w-[200px]"
                                />
                              ))}
                          </div>
                        )}
                    </div>

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
                            onClick={() => onEditStart(message.id, messageText)}
                            disabled={isLoading}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => onDelete(message.id)}
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            navigator.clipboard.writeText(messageText);
                            toast.success("Copied to clipboard");
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      )}

                      {isLastAssistant && !isLoading && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          onClick={onRegenerate}
                        >
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              </div>
            );
          })}
        </div>

        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 mt-8"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-white/10 shadow-xs">
              <Brain className="h-5 w-5 text-primary/50 animate-pulse" />
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-background/40 px-5 py-3.5 border border-white/5">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" />
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} className="h-4" />
      </div>
    </div>
  );
}
