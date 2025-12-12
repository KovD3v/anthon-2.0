"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import type { UIMessage } from "ai";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, Brain, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MessageItem } from "./MessageItem";

// Extended UIMessage type that includes database fields
type ExtendedMessage = UIMessage & {
  createdAt?: string | Date;
  role: "user" | "assistant" | "system" | "data";
};

interface MessageListProps {
  messages: ExtendedMessage[];
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
  hasMoreMessages = false,
  isLoadingMore = false,
  onLoadMore,
}: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [feedbackState, setFeedbackState] = useState<Record<string, number>>(
    {},
  );

  // Handle feedback
  const handleFeedback = useCallback(
    async (messageId: string, feedback: number) => {
      const currentFeedback = feedbackState[messageId];
      // Toggle off if same feedback
      const newFeedback = currentFeedback === feedback ? 0 : feedback;

      setFeedbackState((prev) => ({ ...prev, [messageId]: newFeedback }));

      try {
        await fetch("/api/chat/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId, feedback: newFeedback }),
        });
      } catch (error) {
        console.error("Feedback error:", error);
        toast.error("Failed to save feedback");
      }
    },
    [feedbackState],
  );

  // Virtualize the message list for better performance with many messages
  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 150, // Estimated message height
    overscan: 5, // Number of items to render outside of viewport
  });

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
  }, [messages.length]);

  // Track scroll position for scroll-to-bottom button and lazy loading
  const handleScroll = useCallback(() => {
    if (!parentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setShowScrollButton(distanceFromBottom > 200);

    // Trigger load more when scrolling near the top
    if (scrollTop < 100 && hasMoreMessages && !isLoadingMore && onLoadMore) {
      onLoadMore();
    }
  }, [hasMoreMessages, isLoadingMore, onLoadMore]);

  useEffect(() => {
    const container = parentRef.current;
    if (!container) return;
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const scrollToBottom = useCallback(() => {
    parentRef.current?.scrollTo({
      top: parentRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, []);

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
    <>
      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto px-4 py-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent relative"
      >
        <div className="mx-auto max-w-3xl">
          {/* Loading indicator for older messages */}
          {isLoadingMore && (
            <div className="flex justify-center py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading older messages...</span>
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
                Load older messages
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
              const message = messages[virtualRow.index];
              const isEditing = editingMessageId === message.id;
              const isLastAssistant =
                message.role === "assistant" &&
                virtualRow.index === messages.length - 1;

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
                  <MessageItem
                    message={message}
                    isEditing={isEditing}
                    isDeleting={deletingMessageId === message.id}
                    isLoading={isLoading}
                    isLastAssistant={isLastAssistant}
                    feedback={feedbackState[message.id] || 0}
                    editContent={isEditing ? editContent : ""}
                    onEditStart={onEditStart}
                    onEditCancel={onEditCancel}
                    onEditSave={onEditSave}
                    onEditContentChange={onEditContentChange}
                    onDelete={onDelete}
                    onRegenerate={onRegenerate}
                    onFeedback={handleFeedback}
                  />
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

      {/* Scroll to bottom button */}
      <AnimatePresence>
        {showScrollButton && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10"
          >
            <Button
              size="sm"
              variant="secondary"
              className="rounded-full shadow-lg gap-1.5"
              onClick={scrollToBottom}
            >
              <ArrowDown className="h-3 w-3" />
              Scroll to bottom
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
