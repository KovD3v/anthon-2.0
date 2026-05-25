"use client";

import { useUser } from "@clerk/nextjs";
import { Brain, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageWrapper } from "@/components/ui/page-wrapper";
import { getCreateChatButtonState } from "./create-chat-ui";
import { useChatContext } from "./layout-client";

/**
 * Chat landing page - shows when no chat is selected
 * Provides quick actions and welcome message
 * Supports both authenticated users and guests
 */
export default function ChatPage() {
  const { user } = useUser();
  const { createChat, chats, isCreatingChat, isGuest } = useChatContext();

  const handleNewChat = async () => {
    await createChat();
  };

  // Determine greeting based on auth state
  const greeting = isGuest
    ? "Benvenuto!"
    : `Ciao${user?.firstName ? `, ${user.firstName}` : ""}!`;
  const createChatButton = getCreateChatButtonState({
    isCreating: isCreatingChat,
    idleLabel: "Inizia una nuova conversazione",
  });

  return (
    <PageWrapper className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center p-8">
        <div className="max-w-2xl text-center">
          {/* Welcome */}
          <div className="mb-8">
            <Brain className="mx-auto size-16 text-primary/80" />
            <h1 className="mt-4 text-3xl font-bold">{greeting}</h1>
            <p className="mt-2 text-lg text-muted-foreground">
              Sono Anthon, il tuo coach AI personale. Come posso aiutarti oggi?
            </p>
          </div>

          {/* New Chat Button */}
          <Button
            onClick={handleNewChat}
            size="lg"
            className="gap-2"
            disabled={createChatButton.isDisabled}
            aria-busy={isCreatingChat}
          >
            {createChatButton.icon === "loading" ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Sparkles className="size-5" />
            )}
            {createChatButton.label}
          </Button>

          {/* Recent Chats Shortcut */}
          {chats.length > 0 && (
            <div className="mt-8 text-sm text-muted-foreground">
              Hai {chats.length} conversazion
              {chats.length !== 1 ? "i" : "e"}. Seleziona una dalla barra
              laterale per continuare.
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
