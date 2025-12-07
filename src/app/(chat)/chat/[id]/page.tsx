"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useConfirm } from "@/hooks/use-confirm";
import type { ChatData } from "@/types/chat";
import { ChatHeader } from "../../../(chat)/components/ChatHeader";
import { ChatInput } from "../../../(chat)/components/ChatInput";
import { MessageList } from "../../../(chat)/components/MessageList";
import { SuggestedActions } from "../../../(chat)/components/SuggestedActions";
import { useChatContext } from "../layout";

export default function ChatConversationPage() {
  const params = useParams();
  const chatId = params.id as string;
  const { getCachedChat } = useChatContext(); // Access context to get cached data

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
  const { confirm, isOpen, options, handleConfirm, setIsOpen } = useConfirm();

  // Load chat data with cache support
  useEffect(() => {
    async function loadChat() {
      // Try to get from cache first
      const cached = getCachedChat(chatId);
      if (cached) {
        setChatData(cached);
        setIsLoadingChat(false);
        setError(null);
        return;
      }

      // If not in cache, fetch from API
      setIsLoadingChat(true);
      setError(null);
      try {
        const response = await fetch(`/api/chats/${chatId}`);
        if (response.ok) {
          const data = await response.json();
          setChatData(data);
        } else if (response.status === 404) {
          setError("Chat non trovata");
        } else {
          setError("Caricamento chat fallito");
        }
      } catch (err) {
        console.error("Load chat error:", err);
        setError("Caricamento chat fallito");
      } finally {
        setIsLoadingChat(false);
      }
    }

    if (chatId) {
      loadChat();
    }
  }, [chatId, getCachedChat]);

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
      annotations: msg.usage ? [msg.usage] : undefined,
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
            annotations: msg.usage ? [msg.usage] : undefined,
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

  const handleSubmit = (
    e: React.FormEvent,
    attachments?: Array<{
      id: string;
      name: string;
      contentType: string;
      size: number;
      url: string;
    }>,
  ) => {
    e.preventDefault();
    if (input.trim() && status === "ready") {
      // Create message with text and file parts if attachments exist
      const parts: Array<
        | { type: "text"; text: string }
        | {
            type: "file";
            data: string;
            mimeType: string;
            name: string;
            size: number;
            attachmentId: string;
          }
      > = [{ type: "text", text: input }];

      // Add file parts for attachments
      if (attachments && attachments.length > 0) {
        attachments.forEach((att) => {
          parts.push({
            type: "file",
            data: att.url,
            mimeType: att.contentType,
            name: att.name,
            size: att.size,
            attachmentId: att.id,
          });
        });
      }

      sendMessage({
        role: "user",
        parts: parts as UIMessage["parts"],
      });
      setInput("");
    }
  };

  const handleStop = () => {
    stop();
  };

  // Handle message deletion
  const handleDeleteMessage = async (messageId: string) => {
    const confirmed = await confirm({
      title: "Eliminare il messaggio?",
      description:
        "Questo eliminerà questo messaggio e tutti i messaggi successivi. Questa azione non può essere annullata.",
      confirmText: "Elimina",
      cancelText: "Annulla",
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
          toast.success("Messaggio eliminato con successo");
        } else {
          setMessages([]);
        }
      } else {
        const data = await response.json();
        toast.error(data.error || "Eliminazione messaggio fallita");
      }
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Eliminazione messaggio fallita");
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
        <Button onClick={() => window.location.reload()}>Riprova</Button>
      </div>
    );
  }

  const isLoading = status === "streaming" || status === "submitted";
  const messages = displayMessages;

  return (
    <div className="flex flex-1 flex-col min-h-0 relative bg-linear-to-b from-background to-muted/20">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-primary/5 via-background/0 to-background/0" />

      <ChatHeader title={chatData?.title || "New Chat"} />

      <MessageList
        messages={messages}
        isLoading={isLoading}
        editingMessageId={editingMessageId}
        deletingMessageId={deletingMessageId}
        editContent={editContent}
        onEditStart={handleStartEdit}
        onEditCancel={handleCancelEdit}
        onEditSave={handleSaveEdit}
        onEditContentChange={setEditContent}
        onDelete={handleDeleteMessage}
        onRegenerate={handleRegenerate}
      />

      {/* Suggested Actions for empty chat */}
      {messages.length === 0 && !isLoading && (
        <div className="flex-1 flex items-center justify-center px-4">
          <SuggestedActions
            onSelect={(prompt) => {
              setInput(prompt);
            }}
            variant="cards"
          />
        </div>
      )}

      {/* Error display inline */}
      {chatError && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400 shadow-xl">
          Un errore si è verificato: {chatError.message}
        </div>
      )}

      <ChatInput
        input={input}
        setInput={setInput}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        onStop={handleStop}
      />

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
