"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useConfirm } from "@/hooks/use-confirm";
import { convertToUIMessages, extractTextFromParts } from "@/lib/chat-client";
import { getPaywallCardContent } from "@/lib/rate-limit/paywall";
import type { AttachmentData, ChatData } from "@/types/chat";
import { ChatHeader } from "../../../(chat)/components/ChatHeader";
import { ChatInput } from "../../../(chat)/components/ChatInput";
import { MessageList } from "../../../(chat)/components/MessageList";
import { SuggestedActions } from "../../../(chat)/components/SuggestedActions";
import { useChatContext } from "../layout-client";

interface DeleteSnapshot {
  cancelled: boolean;
  previousMessages: UIMessage[];
  previousChatData: ChatData;
}

export function ChatConversationClient({
  chatId,
  initialChatData,
}: {
  chatId: string;
  initialChatData: ChatData;
}) {
  const { renameChat, isGuest, getCachedChat, updateCachedChat } =
    useChatContext();
  const apiBase = isGuest ? "/api/guest" : "/api";

  const [chatData, setChatData] = useState<ChatData>(initialChatData);
  const [input, setInput] = useState("");
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(
    null,
  );
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const { confirm, isOpen, options, handleConfirm, setIsOpen } = useConfirm();

  // Audio/Voice state
  const [_audioState, setAudioState] = useState<{
    src: string;
    isPlaying: boolean;
  } | null>(null);
  const [voiceGeneratingMessageId, setVoiceGeneratingMessageId] = useState<
    string | null
  >(null);
  const [voiceMessages, setVoiceMessages] = useState<Map<string, string>>(
    () => new Map(),
  );

  // Initial messages from server data
  const initialMessages = convertToUIMessages(chatData.messages);

  async function refreshChatData() {
    try {
      const response = await fetch(`${apiBase}/chats/${chatId}`);
      if (response.ok) {
        const data = await response.json();
        setChatData(data);
        return convertToUIMessages(data.messages);
      }
    } catch (err) {
      console.error("Failed to refresh chat data:", err);
    }
    return null;
  }

  async function loadMoreMessages() {
    if (
      isLoadingMore ||
      !chatData.pagination?.hasMore ||
      !chatData.pagination.nextCursor
    ) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const response = await fetch(
        `${apiBase}/chats/${chatId}?cursor=${chatData.pagination.nextCursor}&limit=50`,
      );
      if (response.ok) {
        const data = await response.json();
        setChatData((prev) => ({
          ...prev,
          messages: [...data.messages, ...prev.messages],
          pagination: data.pagination,
        }));
      }
    } catch (err) {
      console.error("Failed to load more messages:", err);
      toast.error("Failed to load older messages");
    } finally {
      setIsLoadingMore(false);
    }
  }

  const transport = new DefaultChatTransport({
    api: isGuest ? "/api/guest/chat" : "/api/chat",
    body: { chatId },
  });

  const {
    messages: streamingMessages,
    sendMessage,
    status,
    error: chatError,
    setMessages,
    stop,
  } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    onFinish: async () => {
      const newMessages = await refreshChatData();
      if (newMessages) {
        setMessages(newMessages);

        const lastMessage = newMessages[newMessages.length - 1];
        const lastUserMessage = newMessages
          .slice(0, newMessages.length - 1)
          .reverse()
          .find((m) => m.role === "user");

        if (isGuest) return;

        if (lastMessage && lastMessage.role === "assistant") {
          // Skip voice API if quiet mode is enabled (L1) or plan doesn't include voice (L2)
          if (
            chatData.voiceEnabled === false ||
            chatData.voicePlanEnabled === false
          ) {
            return;
          }

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
                setVoiceMessages((prev) =>
                  new Map(prev).set(lastMessage.id, audioSrc),
                );
                setAudioState({
                  src: audioSrc,
                  isPlaying: true,
                });
              }
            }
          } catch (err) {
            console.error("Voice generation failed:", err);
          } finally {
            setVoiceGeneratingMessageId(null);
          }
        }
      }
    },
  });

  // Sync cached data to local state if available
  useEffect(() => {
    if (hasInitialized) return;

    const cached = getCachedChat(chatId);
    if (cached) {
      // If we have cached data, update local chatData state
      setChatData(cached);
    }
    // Mark as initialized regardless - useChat handles the initial messages
    setHasInitialized(true);
  }, [chatId, hasInitialized, getCachedChat]);

  // Sync local changes back to layout cache
  useEffect(() => {
    if (hasInitialized) {
      updateCachedChat(chatId, {
        ...chatData,
        messages: chatData.messages, // chatData already has messages
      });
    }
  }, [chatId, chatData, hasInitialized, updateCachedChat]);

  // Sync streaming messages to cache for "live" feel when switching back
  useEffect(() => {
    if (status === "streaming" && streamingMessages.length > 0) {
      updateCachedChat(chatId, {
        // We don't want to convert back and forth too much,
        // but we can store partial message lists
        // For simplicity, we'll only sync on finish in the production version
        // but let's do a partial sync for "active" chats
      });
    }
  }, [chatId, streamingMessages, status, updateCachedChat]);

  const formattedError = (() => {
    if (!chatError) return null;
    try {
      if (chatError.message.trim().startsWith("{")) {
        const parsed = JSON.parse(chatError.message);
        const paywallCard = getPaywallCardContent(parsed, isGuest);
        if (paywallCard) {
          return paywallCard;
        }
        return { message: parsed.error || chatError.message };
      }
    } catch {
      /* ignore */
    }
    return { message: chatError.message };
  })();

  const handleSubmit = (e: React.FormEvent, attachments?: AttachmentData[]) => {
    e.preventDefault();
    if (
      (input.trim() || (attachments && attachments.length > 0)) &&
      status === "ready"
    ) {
      const parts: UIMessage["parts"] = [];
      if (input.trim()) parts.push({ type: "text", text: input });
      if (attachments) {
        attachments.forEach((att: AttachmentData) => {
          const isAudio = att.contentType.startsWith("audio/");
          parts.push({
            type: "file",
            url:
              isAudio && att.base64Data
                ? `data:${att.contentType};base64,${att.base64Data}`
                : att.url,
            mimeType: att.contentType,
            name: att.name,
            size: att.size,
            attachmentId: att.id,
            // biome-ignore lint/suspicious/noExplicitAny: Extra metadata
          } as any);
        });
      }
      sendMessage({ role: "user", parts: parts as UIMessage["parts"] });
      setInput("");
    }
  };

  const deleteStateRef = useRef<DeleteSnapshot | null>(null);

  const handleDeleteMessage = async (messageId: string) => {
    const confirmed = await confirm({
      title: "Eliminare il messaggio?",
      description:
        "Questo eliminerà questo messaggio e tutti i messaggi successivi.",
      confirmText: "Elimina",
      cancelText: "Annulla",
      variant: "destructive",
    });

    if (!confirmed) return;

    deleteStateRef.current = {
      cancelled: false,
      previousMessages: [...streamingMessages],
      previousChatData: chatData,
    };

    const msgIndex = streamingMessages.findIndex((m) => m.id === messageId);
    if (msgIndex !== -1) {
      setMessages(streamingMessages.slice(0, msgIndex));
    }

    setDeletingMessageId(messageId);

    toast("Messaggio eliminato", {
      description: "Clicca per annullare",
      action: {
        label: "Annulla",
        onClick: () => {
          if (deleteStateRef.current) {
            deleteStateRef.current.cancelled = true;
            setMessages(deleteStateRef.current.previousMessages);
            setChatData(deleteStateRef.current.previousChatData);
            setDeletingMessageId(null);
            toast.success("Eliminazione annullata");
          }
        },
      },
      duration: 5000,
      onAutoClose: async () => {
        if (deleteStateRef.current?.cancelled) return;
        try {
          const response = await fetch(`/api/chat/messages?id=${messageId}`, {
            method: "DELETE",
          });
          if (response.ok) {
            await refreshChatData();
          } else {
            if (deleteStateRef.current) {
              setMessages(deleteStateRef.current.previousMessages);
              setChatData(deleteStateRef.current.previousChatData);
            }
            toast.error("Eliminazione fallita");
          }
        } catch (err) {
          console.error("Delete error:", err);
          if (deleteStateRef.current) {
            setMessages(deleteStateRef.current.previousMessages);
            setChatData(deleteStateRef.current.previousChatData);
          }
          toast.error("Eliminazione fallita");
        } finally {
          setDeletingMessageId(null);
          deleteStateRef.current = null;
        }
      },
    });
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
        setEditingMessageId(null);
        setEditContent("");
        const newMsgs = await refreshChatData();
        if (newMsgs) {
          setMessages(newMsgs);
          sendMessage({ text: newContent });
        }
      } else {
        toast.error("Failed to edit message");
      }
    } catch (err) {
      console.error("Edit error:", err);
      toast.error("Failed to edit message");
    }
  };

  const handleRegenerate = async () => {
    const lastAssistantIdx = [...streamingMessages]
      .reverse()
      .findIndex((m) => m.role === "assistant");
    if (lastAssistantIdx === -1) return;
    const assistantIdx = streamingMessages.length - 1 - lastAssistantIdx;
    const userMessage = streamingMessages
      .slice(0, assistantIdx)
      .reverse()
      .find((m) => m.role === "user");
    if (!userMessage) return;

    const userText = extractTextFromParts(userMessage.parts);
    if (!userText) return;

    try {
      const response = await fetch(`/api/chat/messages?id=${userMessage.id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        await refreshChatData();
        sendMessage({ text: userText });
      }
    } catch (err) {
      console.error("Regenerate error:", err);
      toast.error("Failed to regenerate response");
    }
  };

  const isLoading = status === "streaming" || status === "submitted";

  return (
    <div className="flex flex-1 flex-col min-h-0 relative bg-linear-to-b from-background to-muted/20">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-primary/5 via-background/0 to-background/0" />

      <ChatHeader
        chatId={chatId}
        title={chatData.title}
        onRename={async (id, newTitle) => {
          const success = await renameChat(id, newTitle);
          if (success) setChatData((prev) => ({ ...prev, title: newTitle }));
          return success;
        }}
      />

      <MessageList
        messages={streamingMessages}
        isLoading={isLoading}
        editingMessageId={editingMessageId}
        deletingMessageId={deletingMessageId}
        editContent={editContent}
        onEditStart={(id, text) => {
          setEditingMessageId(id);
          setEditContent(text);
        }}
        onEditCancel={() => {
          setEditingMessageId(null);
          setEditContent("");
        }}
        onEditSave={handleSaveEdit}
        onEditContentChange={setEditContent}
        onDelete={handleDeleteMessage}
        onRegenerate={handleRegenerate}
        hasMoreMessages={chatData.pagination?.hasMore ?? false}
        isLoadingMore={isLoadingMore}
        voiceMessages={voiceMessages}
        voiceGeneratingMessageId={voiceGeneratingMessageId}
        onLoadMore={loadMoreMessages}
      />

      {streamingMessages.length === 0 && !isLoading && (
        <div className="flex-1 flex items-center justify-center px-4">
          <SuggestedActions
            onSelect={(prompt) => setInput(prompt)}
            variant="cards"
          />
        </div>
      )}

      {formattedError && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 min-w-75 max-w-md rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400 shadow-xl backdrop-blur-sm">
          {formattedError.title && (
            <div className="mb-1 font-semibold">{formattedError.title}</div>
          )}
          <div>
            {formattedError.title ? "" : "Un errore si è verificato: "}
            {formattedError.message}
          </div>
          {"primaryCta" in formattedError && (
            <div className="mt-3 flex items-center gap-3">
              <Button
                asChild
                size="sm"
                variant="outline"
                className="w-full border-red-200 bg-white hover:bg-red-50 text-red-700 dark:bg-transparent dark:hover:bg-red-900/20"
              >
                <Link href={formattedError.primaryCta.href}>
                  {formattedError.primaryCta.label}
                </Link>
              </Button>
              {formattedError.secondaryCta && (
                <Link
                  href={formattedError.secondaryCta.href}
                  className="text-xs underline underline-offset-2 text-red-700 dark:text-red-300 whitespace-nowrap"
                >
                  {formattedError.secondaryCta.label}
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      <ChatInput
        input={input}
        setInput={setInput}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        onStop={stop}
        disableAttachments={isGuest}
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
