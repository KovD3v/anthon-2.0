"use client";

import type { UIMessage } from "ai";
import { motion } from "framer-motion";
import {
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
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { formatRelativeTime } from "@/lib/format-time";
import { AttachmentPreview } from "./Attachments";
import { MemoizedMarkdown } from "./MemoizedMarkdown";

// Extended UIMessage type that includes database fields
type ExtendedMessage = UIMessage & {
  createdAt?: string | Date;
  role: "user" | "assistant" | "system" | "data";
};

interface MessageItemProps {
  message: ExtendedMessage;
  isEditing: boolean;
  isDeleting: boolean;
  isLoading: boolean;
  isLastAssistant: boolean;
  feedback: number;
  editContent: string;
  onEditStart: (id: string, content: string) => void;
  onEditCancel: () => void;
  onEditSave: () => void;
  onEditContentChange: (content: string) => void;
  onDelete: (id: string) => void;
  onRegenerate: () => void;
  onFeedback: (id: string, feedback: number) => void;
}

const getMessageText = (message: UIMessage) => {
  return (
    message.parts
      ?.map((part) => (part.type === "text" ? part.text : ""))
      .join("") || ""
  );
};

const MessageItem = memo(function MessageItem({
  message,
  isEditing,
  isDeleting,
  isLoading,
  isLastAssistant,
  feedback,
  editContent,
  onEditStart,
  onEditCancel,
  onEditSave,
  onEditContentChange,
  onDelete,
  onRegenerate,
  onFeedback,
}: MessageItemProps) {
  const { copy, copied } = useCopyToClipboard();
  const messageText = getMessageText(message);
  const isUser = message.role === "user";

  return (
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
                onChange={(e) => onEditContentChange(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-black/20 p-3 outline-none focus:ring-1 focus:ring-primary/50"
                rows={4}
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={onEditCancel}>
                  <X className="mr-1 h-3 w-3" /> Cancella
                </Button>
                <Button size="sm" onClick={onEditSave}>
                  <Check className="mr-1 h-3 w-3" /> Salva
                </Button>
              </div>
            </div>
          ) : message.role === "assistant" ? (
            <MemoizedMarkdown content={messageText} />
          ) : (
            <div className="whitespace-pre-wrap">{messageText}</div>
          )}

          {/* Display attachments from message parts */}
          {message.parts?.some((part) => part.type === "file") && (
            <div className="mt-2 flex flex-wrap gap-2">
              {message.parts
                ?.filter((part) => part.type === "file")
                .map((part, idx: number) => {
                  const filePart = part as unknown as {
                    type: "file";
                    data: string;
                    mimeType: string;
                    name: string;
                    size?: number;
                    attachmentId?: string;
                  };
                  return (
                    <AttachmentPreview
                      key={filePart.attachmentId || idx}
                      attachment={{
                        id: filePart.attachmentId || `${message.id}-${idx}`,
                        name: filePart.name,
                        contentType: filePart.mimeType,
                        size: filePart.size || 0,
                        url: filePart.data,
                      }}
                      className="max-w-[200px]"
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

              if (!annotations || annotations.length === 0) return null;

              const usageAnn = annotations.find((ann: unknown) => {
                const a = ann as Record<string, unknown>;
                return (
                  a.inputTokens !== undefined || a.outputTokens !== undefined
                );
              }) as
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
                (usageAnn.inputTokens || 0) + (usageAnn.outputTokens || 0);

              return (
                <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground/60 select-none">
                  <div className="flex items-center gap-1.5">
                    <span>{totalTokens} tokens</span>
                    <span className="text-muted-foreground/30">•</span>
                    <span>{usageAnn.inputTokens || 0} in</span>
                    <span className="text-muted-foreground/30">/</span>
                    <span>{usageAnn.outputTokens || 0} out</span>
                  </div>
                  {timeInSeconds && (
                    <>
                      <span className="text-muted-foreground/30">•</span>
                      <div className="flex items-center gap-1.5">
                        <span>{timeInSeconds}s</span>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
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
                {isDeleting ? (
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
                  feedback === 1
                    ? "text-green-500"
                    : "text-muted-foreground hover:text-green-500"
                }`}
                onClick={() => onFeedback(message.id, 1)}
              >
                <ThumbsUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={`h-6 w-6 ${
                  feedback === -1
                    ? "text-red-500"
                    : "text-muted-foreground hover:text-red-500"
                }`}
                onClick={() => onFeedback(message.id, -1)}
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
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
});

export { MessageItem };
