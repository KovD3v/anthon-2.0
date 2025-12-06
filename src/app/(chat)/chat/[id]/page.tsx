"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import {
  Brain,
  Check,
  Loader2,
  Pencil,
  RefreshCw,
  Send,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useConfirm } from "@/hooks/use-confirm";
import { useChatContext } from "../layout";

interface ChatData {
  id: string;
  title: string;
  visibility: string;
  isOwner: boolean;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string | null;
    parts: unknown;
    createdAt: string;
    model?: string;
    usage?: {
      inputTokens: number;
      outputTokens: number;
      cost: number;
    };
  }>;
}

export default function ChatConversationPage() {
  const params = useParams();
  const chatId = params.id as string;
  useChatContext(); // Access context to ensure we're in provider

  const [chatData, setChatData] = useState<ChatData | null>(null);
  const [isLoadingChat, setIsLoadingChat] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(
    null,
  );
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [hasInitialized, setHasInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUpRef = useRef(false);
  const hasInitialScrolledRef = useRef(false);
  const { confirm, isOpen, options, handleConfirm, setIsOpen } = useConfirm();

  // Load chat data
  useEffect(() => {
    async function loadChat() {
      setIsLoadingChat(true);
      setError(null);
      try {
        const response = await fetch(`/api/chats/${chatId}`);
        if (response.ok) {
          const data = await response.json();
          setChatData(data);
        } else if (response.status === 404) {
          setError("Chat not found");
        } else {
          setError("Failed to load chat");
        }
      } catch (err) {
        console.error("Failed to load chat:", err);
        setError("Failed to load chat");
      } finally {
        setIsLoadingChat(false);
      }
    }

    if (chatId) {
      loadChat();
    }
  }, [chatId]);

  // Convert stored messages to useChat format - memoized to avoid recalculation
  const initialMessages: UIMessage[] = useMemo(() => {
    if (!chatData?.messages) return [];
    return chatData.messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      parts: msg.parts
        ? (msg.parts as UIMessage["parts"])
        : [{ type: "text" as const, text: msg.content || "" }],
      createdAt: new Date(msg.createdAt),
    }));
  }, [chatData?.messages]);

  // Refresh chat data to get real database IDs
  const refreshChatData = useCallback(async () => {
    try {
      const response = await fetch(`/api/chats/${chatId}`);
      if (response.ok) {
        const data = await response.json();
        setChatData(data);

        // Convert to UI messages and sync with useChat state
        const newMessages: UIMessage[] = data.messages.map(
          (msg: ChatData["messages"][0]) => ({
            id: msg.id,
            role: msg.role,
            parts: msg.parts
              ? (msg.parts as UIMessage["parts"])
              : [
                  {
                    type: "text" as const,
                    text: msg.content || "",
                  },
                ],
            createdAt: new Date(msg.createdAt),
          }),
        );

        return newMessages;
      }
    } catch (err) {
      console.error("Failed to refresh chat data:", err);
    }
    return null;
  }, [chatId]);

  const {
    messages: streamingMessages,
    sendMessage,
    status,
    error: chatError,
    setMessages,
    stop,
  } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { chatId },
    }),
    onFinish: async () => {
      // Refresh chat data to get real database IDs after streaming completes
      const newMessages = await refreshChatData();
      if (newMessages) {
        setMessages(newMessages);
      }
    },
  });

  // Load initial messages into useChat state when chat data loads (only once on initial load)
  useEffect(() => {
    if (initialMessages.length > 0 && !hasInitialized) {
      setMessages(initialMessages);
      setHasInitialized(true);
    }
  }, [initialMessages, hasInitialized, setMessages]);

  // Combine stored and streaming messages
  const displayMessages = useMemo(() => {
    if (streamingMessages.length > 0) {
      return streamingMessages;
    }
    return initialMessages;
  }, [streamingMessages, initialMessages]);

  // Auto-scroll to bottom
  // Handle scroll events to detect if user is at bottom
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    isUserScrolledUpRef.current = !isAtBottom;
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (!isUserScrolledUpRef.current) {
      messagesEndRef.current?.scrollIntoView({
        behavior: hasInitialScrolledRef.current ? "smooth" : "auto",
      });
      hasInitialScrolledRef.current = true;
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && status === "ready") {
      sendMessage({ text: input });
      setInput("");
    }
  };

  const handleStop = () => {
    stop();
  };

  // Handle message deletion
  const handleDeleteMessage = async (messageId: string) => {
    const confirmed = await confirm({
      title: "Delete message?",
      description:
        "This will delete this message and all following messages. This action cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "destructive",
    });

    if (!confirmed) {
      return;
    }

    setDeletingMessageId(messageId);
    try {
      const response = await fetch(`/api/chat/messages?id=${messageId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Reload chat data
        const reloadResponse = await fetch(`/api/chats/${chatId}`);
        if (reloadResponse.ok) {
          const data = await reloadResponse.json();
          setChatData(data);

          // Convert to UI messages and set them
          const newMessages: UIMessage[] = data.messages.map(
            (msg: ChatData["messages"][0]) => ({
              id: msg.id,
              role: msg.role,
              parts: msg.parts
                ? (msg.parts as UIMessage["parts"])
                : [
                    {
                      type: "text" as const,
                      text: msg.content || "",
                    },
                  ],
              createdAt: new Date(msg.createdAt),
            }),
          );

          setMessages(newMessages);
          toast.success("Message deleted");
        } else {
          setMessages([]);
        }
      } else {
        const data = await response.json();
        toast.error(data.error || "Failed to delete message");
      }
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Failed to delete message");
    } finally {
      setDeletingMessageId(null);
    }
  };

  // Handle message edit
  const handleStartEdit = (messageId: string, currentText: string) => {
    setEditingMessageId(messageId);
    setEditContent(currentText);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditContent("");
  };

  const handleSaveEdit = async () => {
    if (!editingMessageId || !editContent.trim()) return;

    const newContent = editContent.trim();

    try {
      const response = await fetch("/api/chat/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: editingMessageId,
          content: newContent,
        }),
      });

      if (response.ok) {
        // Clear edit state
        setEditingMessageId(null);
        setEditContent("");

        // Reload chat to get remaining messages (before the edited one)
        const reloadResponse = await fetch(`/api/chats/${chatId}`);
        if (reloadResponse.ok) {
          const data = await reloadResponse.json();
          setChatData(data);

          // Convert to UI messages and set them
          const newMessages: UIMessage[] = data.messages.map(
            (msg: ChatData["messages"][0]) => ({
              id: msg.id,
              role: msg.role,
              parts: msg.parts
                ? (msg.parts as UIMessage["parts"])
                : [
                    {
                      type: "text" as const,
                      text: msg.content || "",
                    },
                  ],
              createdAt: new Date(msg.createdAt),
            }),
          );

          // Set the messages in useChat state
          setMessages(newMessages);

          // Send the edited message after state is updated
          setTimeout(() => {
            sendMessage({ text: newContent });
          }, 100);
        }
      } else {
        const data = await response.json();
        toast.error(data.error || "Failed to edit message");
      }
    } catch (err) {
      console.error("Edit error:", err);
      toast.error("Failed to edit message");
    }
  };

  // Handle regenerate (re-send the last user message)
  const handleRegenerate = async () => {
    const messages = displayMessages;

    // Find the last assistant message
    const lastAssistantIdx = [...messages]
      .reverse()
      .findIndex((m) => m.role === "assistant");
    if (lastAssistantIdx === -1) return;

    const assistantIdx = messages.length - 1 - lastAssistantIdx;

    // Find the user message before it
    const userMessage = messages
      .slice(0, assistantIdx)
      .reverse()
      .find((m) => m.role === "user");
    if (!userMessage) return;

    const userText =
      userMessage.parts
        ?.map((part) => (part.type === "text" ? part.text : ""))
        .join("") || "";

    if (!userText) return;

    // Delete from the user message onward and re-send
    try {
      const response = await fetch(`/api/chat/messages?id=${userMessage.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Reload chat
        const reloadResponse = await fetch(`/api/chats/${chatId}`);
        if (reloadResponse.ok) {
          const data = await reloadResponse.json();
          setChatData(data);

          // Convert to UI messages and set them
          const newMessages: UIMessage[] = data.messages.map(
            (msg: ChatData["messages"][0]) => ({
              id: msg.id,
              role: msg.role,
              parts: msg.parts
                ? (msg.parts as UIMessage["parts"])
                : [
                    {
                      type: "text" as const,
                      text: msg.content || "",
                    },
                  ],
              createdAt: new Date(msg.createdAt),
            }),
          );

          setMessages(newMessages);

          // Re-send the user message after state is updated
          setTimeout(() => {
            sendMessage({ text: userText });
          }, 100);
        }
      }
    } catch (err) {
      console.error("Regenerate error:", err);
      toast.error("Failed to regenerate response");
    }
  };

  // Helper to extract text from message parts
  const getMessageText = (message: UIMessage) => {
    return (
      message.parts
        ?.map((part) => (part.type === "text" ? part.text : ""))
        .join("") || ""
    );
  };

  // Loading state
  if (isLoadingChat) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  const isLoading = status === "streaming" || status === "submitted";
  const messages = displayMessages;
  const hasAssistantMessage = messages.some((m) => m.role === "assistant");

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      {/* Chat Header */}
      <header className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <h1 className="font-semibold truncate">
            {chatData?.title || "New Chat"}
          </h1>
        </div>
        {/* Regenerate button in header when not loading */}
        {hasAssistantMessage && !isLoading && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRegenerate}
            className="text-muted-foreground"
          >
            <RefreshCw className="mr-1 h-4 w-4" />
            Regenerate
          </Button>
        )}
      </header>

      {/* Messages Container */}
      <main className="flex-1 overflow-y-auto min-h-0" onScroll={handleScroll}>
        <div className="mx-auto max-w-3xl px-4 py-8">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Brain className="h-16 w-16 text-primary/20" />
              <h2 className="mt-4 text-xl font-semibold">
                Start the conversation
              </h2>
              <p className="mt-2 text-muted-foreground">
                Send a message to begin chatting with Anthon
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((message, index) => {
                const isEditing = editingMessageId === message.id;
                const messageText = getMessageText(message);
                const isLastAssistant =
                  message.role === "assistant" && index === messages.length - 1;

                return (
                  <div
                    key={message.id}
                    className={`group flex items-start gap-2 ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {/* Action buttons for user messages */}
                    {message.role === "user" && !isEditing && (
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            handleStartEdit(message.id, messageText)
                          }
                          disabled={isLoading}
                          title="Edit message"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteMessage(message.id)}
                          disabled={
                            deletingMessageId === message.id || isLoading
                          }
                          title="Delete message and following"
                        >
                          {deletingMessageId === message.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    )}

                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {message.role === "assistant" && (
                        <div className="mb-1 flex items-center gap-1 text-xs font-medium text-primary">
                          <Brain className="h-3 w-3" />
                          Anthon
                        </div>
                      )}

                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full min-w-[200px] rounded border bg-background p-2 text-sm text-foreground"
                            rows={3}
                            ref={(el) => el?.focus()}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleCancelEdit}
                            >
                              <X className="mr-1 h-3 w-3" />
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={handleSaveEdit}
                              disabled={!editContent.trim()}
                            >
                              <Check className="mr-1 h-3 w-3" />
                              Save & Send
                            </Button>
                          </div>
                        </div>
                      ) : message.role === "assistant" ? (
                        <div className="prose max-w-none text-sm dark:prose-invert">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {messageText}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap text-sm">
                          {messageText}
                        </div>
                      )}
                    </div>

                    {/* Regenerate button for last assistant message */}
                    {isLastAssistant && !isLoading && (
                      <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={handleRegenerate}
                          title="Regenerate response"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Loading indicator */}
              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-2xl bg-muted px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Anthon is thinking...
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Error display */}
          {chatError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
              An error occurred: {chatError.message}
            </div>
          )}
        </div>
      </main>

      {/* Input Form */}
      <footer className="border-t bg-background">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Send a message..."
              className="flex-1 rounded-full border bg-muted/50 px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:bg-background"
              disabled={isLoading}
            />
            {isLoading ? (
              <Button
                type="button"
                size="icon"
                variant="destructive"
                className="h-12 w-12 shrink-0 rounded-full"
                onClick={handleStop}
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                className="h-12 w-12 shrink-0 rounded-full"
                disabled={!input.trim()}
              >
                <Send className="h-5 w-5" />
              </Button>
            )}
          </form>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Anthon can make mistakes. Verify important information.
          </p>
        </div>
      </footer>
      <ConfirmDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        onConfirm={handleConfirm}
        title={options.title}
        description={options.description}
        confirmText={options.confirmText}
        cancelText={options.cancelText}
        variant={options.variant}
      />
    </div>
  );
}
