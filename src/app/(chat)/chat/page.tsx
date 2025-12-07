"use client";

import { useUser } from "@clerk/nextjs";
import { Brain, MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatContext } from "./layout";

/**
 * Chat landing page - shows when no chat is selected
 * Provides quick actions and welcome message
 */
export default function ChatPage() {
  const { user } = useUser();
  const { createChat, chats } = useChatContext();

  const handleNewChat = async () => {
    await createChat();
  };

  const suggestedPrompts = [
    "Crea un piano di allenamento per le mie esigenze",
    "Cosa dovrei mangiare prima di un allenamento?",
    "Aiutami ad analizzare le mie prestazioni recenti",
    "Ho bisogno di motivazione per andare avanti nella mia vita",
  ];

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        {/* Welcome */}
        <div className="mb-8">
          <Brain className="mx-auto h-16 w-16 text-primary/80" />
          <h1 className="mt-4 text-3xl font-bold">
            Ciao {user?.firstName ? `, ${user.firstName}` : ""}!
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Sono Anthon, il tuo coach AI personale. Come posso aiutarti oggi?
          </p>
        </div>

        {/* New Chat Button */}
        <Button onClick={handleNewChat} size="lg" className="gap-2">
          <Sparkles className="h-5 w-5" />
          Inizia una nuova conversazione
        </Button>

        {/* Suggested Prompts */}
        <div className="mt-12">
          <p className="mb-4 text-sm font-medium text-muted-foreground">
            Oppure prova uno di questi suggerimenti:
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {suggestedPrompts.map((prompt) => (
              <button
                type="button"
                key={prompt}
                onClick={handleNewChat}
                className="rounded-lg border bg-card p-4 text-left text-sm transition-colors hover:bg-muted"
              >
                <MessageSquare className="mb-2 h-4 w-4 text-primary" />
                {prompt}
              </button>
            ))}
          </div>
        </div>

        {/* Recent Chats Shortcut */}
        {chats.length > 0 && (
          <div className="mt-8 text-sm text-muted-foreground">
            Hai {chats.length} conversazione{chats.length !== 1 ? "i" : "e"}.
            Seleziona una dalla barra laterale per continuare.
          </div>
        )}
      </div>
    </div>
  );
}
