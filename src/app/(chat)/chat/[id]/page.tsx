"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useConfirm } from "@/hooks/use-confirm";
import { convertToUIMessages, extractTextFromParts } from "@/lib/chat";
import type { ChatData } from "@/types/chat";
import { ChatHeader } from "../../../(chat)/components/ChatHeader";
import { ChatInput } from "../../../(chat)/components/ChatInput";
import { MessageList } from "../../../(chat)/components/MessageList";
import { SuggestedActions } from "../../../(chat)/components/SuggestedActions";
import { useChatContext } from "../layout";

export default function ChatConversationPage() {
  const params = useParams();
  const chatId = params.id as string;
  const { getCachedChat, renameChat } = useChatContext(); // Access context to get cached data

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
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const { confirm, isOpen, options, handleConfirm, setIsOpen } = useConfirm();

  // Audio player state
  const [_audioState, setAudioState] = useState<{
    src: string;
    isPlaying: boolean;
  } | null>(null);

  // Voice generation state
  const [voiceGeneratingMessageId, setVoiceGeneratingMessageId] = useState<
    string | null
  >(null);
  // Map of messageId -> audio source for voice messages
  const [voiceMessages, setVoiceMessages] = useState<Map<string, string>>(
    () => new Map(),
  );

  // Reset state when chatId changes for faster switching
  useEffect(() => {
    setHasInitialized(false);
    setChatData(null);
    setIsLoadingChat(true);
  }, []);

  // Load chat data with cache support
  useEffect(() => {
    const controller = new AbortController();

    async function loadChat() {
      // Try to get from cache first - instant display
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
        const response = await fetch(`/api/chats/${chatId}`, {
          signal: controller.signal,
        });
        if (response.ok) {
          const data = await response.json();
          setChatData(data);
        } else if (response.status === 404) {
          setError("Chat non trovata");
        } else {
          setError("Caricamento chat fallito");
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return; // Ignore abort errors
        }
        console.error("Load chat error:", err);
        setError("Caricamento chat fallito");
      } finally {
        setIsLoadingChat(false);
      }
    }

    if (chatId) {
      loadChat();
    }

    return () => controller.abort();
  }, [chatId, getCachedChat]);

  // Convert stored messages to useChat format - memoized to avoid recalculation
  const initialMessages: UIMessage[] = useMemo(() => {
    if (!chatData?.messages) return [];
    return convertToUIMessages(chatData.messages);
  }, [chatData?.messages]);

  // Refresh chat data to get real database IDs
  const refreshChatData = useCallback(async () => {
    try {
      const response = await fetch(`/api/chats/${chatId}`);
      if (response.ok) {
        const data = await response.json();
        setChatData(data);
        return convertToUIMessages(data.messages);
      }
    } catch (err) {
      console.error("Failed to refresh chat data:", err);
    }
    return null;
  }, [chatId]);

  // Load more (older) messages
  const loadMoreMessages = useCallback(async () => {
    if (
      isLoadingMore ||
      !chatData?.pagination?.hasMore ||
      !chatData.pagination.nextCursor
    ) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const response = await fetch(
        `/api/chats/${chatId}?cursor=${chatData.pagination.nextCursor}&limit=50`,
      );
      if (response.ok) {
        const data = await response.json();
        // Prepend older messages to existing ones
        setChatData((prev) =>
          prev
            ? {
                ...prev,
                messages: [...data.messages, ...prev.messages],
                pagination: data.pagination,
              }
            : null,
        );
      }
    } catch (err) {
      console.error("Failed to load more messages:", err);
      toast.error("Failed to load older messages");
    } finally {
      setIsLoadingMore(false);
    }
  }, [chatId, chatData?.pagination, isLoadingMore]);

  // Memoize transport to prevent useChat re-initialization on every render
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { chatId },
      }),
    [chatId],
  );

  const {
    messages: streamingMessages,
    sendMessage,
    status,
    error: chatError,
    setMessages,
    stop,
  } = useChat({
    transport,
    onFinish: async (_message) => {
      // Refresh chat data to get real database IDs after streaming completes
      const newMessages = await refreshChatData();
      if (newMessages) {
        setMessages(newMessages);

        // TRIGGER VOICE GENERATION
        // Find the last assistant message (which should be the one just finished)
        // We filter for assistant because newMessages might include optimistic updates or other things?
        // Actually newMessages is the full list from DB. The last one should be the assistant's.
        const lastMessage = newMessages[newMessages.length - 1];

        // Find the user message before it for context
        const lastUserMessage = newMessages
          .slice(0, newMessages.length - 1)
          .reverse()
          .find((m) => m.role === "user");

        if (lastMessage && lastMessage.role === "assistant") {
          // Start voice generation indicator
          setVoiceGeneratingMessageId(lastMessage.id);

          try {
            const userText = extractTextFromParts(lastUserMessage?.parts);
            const res = await fetch("/api/voice/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messageId: lastMessage.id,
                userMessage: userText,
              }),
            });

            if (res.ok) {
              const data = await res.json();
              if (data.shouldGenerateVoice && data.audio) {
                const audioSrc = `data:${data.mimeType};base64,${data.audio}`;

                // Store voice message (to hide text)
                setVoiceMessages((prev) => {
                  const newMap = new Map(prev);
                  newMap.set(lastMessage.id, audioSrc);
                  return newMap;
                });

                // Also set audioState for floating player
                setAudioState({
                  src: audioSrc,
                  isPlaying: true,
                });
              }
            }
          } catch (err) {
            console.error("Voice generation request failed:", err);
          } finally {
            setVoiceGeneratingMessageId(null);
          }
        }
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
      base64Data?: string;
    }>,
  ) => {
    e.preventDefault();
    if (
      (input.trim() || (attachments && attachments.length > 0)) &&
      status === "ready"
    ) {
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
      > = [];

      // Add text part only if there's input
      if (input.trim()) {
        parts.push({ type: "text", text: input });
      }

      // Add file parts for attachments
      if (attachments && attachments.length > 0) {
        attachments.forEach((att) => {
          // For audio files, use base64Data if available
          // This allows the AI model to process the audio directly
          const isAudio = att.contentType.startsWith("audio/");
          parts.push({
            type: "file",
            data: isAudio && att.base64Data ? att.base64Data : att.url,
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

  // Handle message deletion with undo
  const deleteStateRef = useRef<{
    cancelled: boolean;
    previousMessages: UIMessage[];
    previousChatData: ChatData | null;
  } | null>(null);

  const handleDeleteMessage = async (messageId: string) => {
    const confirmed = await confirm({
      title: "Eliminare il messaggio?",
      description:
        "Questo eliminerà questo messaggio e tutti i messaggi successivi.",
      confirmText: "Elimina",
      cancelText: "Annulla",
      variant: "destructive",
    });

    if (!confirmed) {
      return;
    }

    // Store current messages for potential undo using ref to avoid stale closure
    deleteStateRef.current = {
      cancelled: false,
      previousMessages: [...displayMessages],
      previousChatData: chatData,
    };

    // Optimistically remove messages (find index and remove from there)
    const msgIndex = displayMessages.findIndex((m) => m.id === messageId);
    if (msgIndex !== -1) {
      setMessages(displayMessages.slice(0, msgIndex));
    }

    setDeletingMessageId(messageId);

    // Show undo toast
    toast("Messaggio eliminato", {
      description: "Clicca per annullare",
      action: {
        label: "Annulla",
        onClick: () => {
          // Mark as cancelled
          if (deleteStateRef.current) {
            deleteStateRef.current.cancelled = true;
            // Restore previous messages
            setMessages(deleteStateRef.current.previousMessages);
            if (deleteStateRef.current.previousChatData) {
              setChatData(deleteStateRef.current.previousChatData);
            }
            setDeletingMessageId(null);
            toast.success("Eliminazione annullata");
          }
        },
      },
      duration: 5000,
      onAutoClose: async () => {
        // Check if cancelled before performing deletion
        if (deleteStateRef.current?.cancelled) {
          return;
        }

        // Perform actual deletion after toast closes
        try {
          const response = await fetch(`/api/chat/messages?id=${messageId}`, {
            method: "DELETE",
          });

          if (response.ok) {
            // Reload chat data to sync with server
            const reloadResponse = await fetch(`/api/chats/${chatId}`);
            if (reloadResponse.ok) {
              const data = await reloadResponse.json();
              setChatData(data);
              setMessages(convertToUIMessages(data.messages));
            }
          } else {
            // Restore on error
            if (deleteStateRef.current) {
              setMessages(deleteStateRef.current.previousMessages);
              if (deleteStateRef.current.previousChatData) {
                setChatData(deleteStateRef.current.previousChatData);
              }
            }
            toast.error("Eliminazione fallita");
          }
        } catch (err) {
          console.error("Delete error:", err);
          if (deleteStateRef.current) {
            setMessages(deleteStateRef.current.previousMessages);
            if (deleteStateRef.current.previousChatData) {
              setChatData(deleteStateRef.current.previousChatData);
            }
          }
          toast.error("Eliminazione fallita");
        } finally {
          setDeletingMessageId(null);
          deleteStateRef.current = null;
        }
      },
    });
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
          setMessages(convertToUIMessages(data.messages));

          // Send the edited message - React batches state updates so this is safe
          sendMessage({ text: newContent });
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
          setMessages(convertToUIMessages(data.messages));

          // Re-send the user message - React batches state updates so this is safe
          sendMessage({ text: userText });
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

      <ChatHeader
        chatId={chatId}
        title={chatData?.title || "New Chat"}
        onRename={async (id, newTitle) => {
          const success = await renameChat(id, newTitle);
          if (success) {
            setChatData((prev) => (prev ? { ...prev, title: newTitle } : null));
          }
          return success;
        }}
      />

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
        hasMoreMessages={chatData?.pagination?.hasMore ?? false}
        isLoadingMore={isLoadingMore}
        voiceMessages={voiceMessages}
        voiceGeneratingMessageId={voiceGeneratingMessageId}
        onLoadMore={loadMoreMessages}
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
