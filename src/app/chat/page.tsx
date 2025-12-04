"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useUser } from "@clerk/nextjs";
import { Brain, Send, Loader2, Trash2 } from "lucide-react";
import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export default function ChatPage() {
  const { user, isLoaded } = useUser();
  const [input, setInput] = useState("");
  const [initialMessages, setInitialMessages] = useState<StoredMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(
    null
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load existing chat history on mount
  useEffect(() => {
    async function loadMessages() {
      try {
        const response = await fetch("/api/chat/messages");
        if (response.ok) {
          const data = await response.json();
          setInitialMessages(data.messages || []);
        }
      } catch (error) {
        console.error("Failed to load chat history:", error);
      } finally {
        setIsLoadingHistory(false);
      }
    }

    if (isLoaded && user) {
      loadMessages();
    } else if (isLoaded && !user) {
      setIsLoadingHistory(false);
    }
  }, [isLoaded, user]);

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  });

  // Handle message deletion with cascade
  const handleDeleteMessage = async (messageId: string) => {
    if (
      !confirm("Vuoi eliminare questo messaggio e tutti quelli successivi?")
    ) {
      return;
    }

    setDeletingMessageId(messageId);
    try {
      const response = await fetch(`/api/chat/messages?id=${messageId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Find the message index and remove it and all subsequent messages
        const messageIndex = initialMessages.findIndex(
          (m) => m.id === messageId
        );
        if (messageIndex !== -1) {
          setInitialMessages((prev) => prev.slice(0, messageIndex));
        }
        // Also clear any streaming messages
        setMessages([]);
      } else {
        const data = await response.json();
        alert(data.error || "Errore durante l'eliminazione");
      }
    } catch (error) {
      console.error("Delete error:", error);
      alert("Errore durante l'eliminazione");
    } finally {
      setDeletingMessageId(null);
    }
  };

  // Combine initial messages with new messages
  const allMessages = useCallback(() => {
    // Convert initial messages to the format used by useChat
    const historyMessages = initialMessages.map((msg) => ({
      id: msg.id,
      role: msg.role as "user" | "assistant",
      parts: [{ type: "text" as const, text: msg.content }],
      createdAt: new Date(msg.createdAt),
    }));

    // If we have new messages from the current session, show them after history
    if (messages.length > 0) {
      return [...historyMessages, ...messages];
    }

    return historyMessages;
  }, [initialMessages, messages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && status === "ready") {
      sendMessage({ text: input });
      setInput("");
    }
  };

  // Show loading state while Clerk or chat history loads
  if (!isLoaded || (user && isLoadingHistory)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Redirect to sign in if not authenticated
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <Brain className="h-16 w-16 text-primary" />
        <h1 className="text-2xl font-bold">Anthon</h1>
        <p className="text-muted-foreground">
          Accedi per iniziare a chattare con il tuo coach personale
        </p>
        <Button asChild>
          <a href="/sign-in">Accedi</a>
        </Button>
      </div>
    );
  }

  const isLoading = status === "streaming" || status === "submitted";
  const displayMessages = allMessages();

  // Helper to extract text from message parts
  const getMessageText = (message: (typeof displayMessages)[0]) => {
    return (
      message.parts
        ?.map((part) => (part.type === "text" ? part.text : ""))
        .join("") || ""
    );
  };

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="container mx-auto flex h-16 items-center gap-2 px-4">
          <Brain className="h-6 w-6 text-primary" />
          <span className="font-bold">Anthon</span>
          <span className="text-sm text-muted-foreground">
            Il tuo coach personale
          </span>
        </div>
      </header>

      {/* Messages Container */}
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-3xl px-4 py-8">
          {displayMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Brain className="h-16 w-16 text-primary/20" />
              <h2 className="mt-4 text-xl font-semibold">
                Ciao{user.firstName ? `, ${user.firstName}` : ""}! 👋
              </h2>
              <p className="mt-2 text-muted-foreground">
                Sono Anthon, il tuo coach personale. Come posso aiutarti oggi?
              </p>
              <div className="mt-6 grid gap-2 text-sm text-muted-foreground">
                <p>Puoi chiedermi di:</p>
                <ul className="list-inside list-disc text-left">
                  <li>Creare un piano di allenamento personalizzato</li>
                  <li>Consigli sulla nutrizione sportiva</li>
                  <li>Analizzare le tue performance</li>
                  <li>Motivarti nei momenti difficili</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {displayMessages.map((message) => (
                <div
                  key={message.id}
                  className={`group flex items-start gap-2 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {/* Delete button for user messages (left side) */}
                  {message.role === "user" && (
                    <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteMessage(message.id)}
                        disabled={deletingMessageId === message.id || isLoading}
                        title="Elimina messaggio e successivi"
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
                    <div className="whitespace-pre-wrap text-sm">
                      {getMessageText(message)}
                    </div>
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {isLoading &&
                displayMessages[displayMessages.length - 1]?.role ===
                  "user" && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-2xl bg-muted px-4 py-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Anthon sta pensando...
                      </div>
                    </div>
                  </div>
                )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              Si è verificato un errore: {error.message}
            </div>
          )}
        </div>
      </main>

      {/* Input Form */}
      <footer className="border-t bg-background">
        <div className="container mx-auto max-w-3xl px-4 py-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Scrivi un messaggio..."
              className="flex-1 rounded-full border bg-muted/50 px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:bg-background"
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="icon"
              className="h-12 w-12 shrink-0 rounded-full"
              disabled={isLoading || !input.trim()}
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </form>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Anthon può fare errori. Verifica le informazioni importanti.
          </p>
        </div>
      </footer>
    </div>
  );
}
