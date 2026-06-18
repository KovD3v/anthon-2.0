"use client";

import { useUser } from "@clerk/nextjs";
import { Brain } from "lucide-react";
import { PageWrapper } from "@/components/ui/page-wrapper";
import { useChatContext } from "./layout-client";

/**
 * Chat landing page - shows when no chat is selected
 * Provides quick actions and welcome message
 * Supports both authenticated users and guests
 */
export default function ChatPage() {
  const { user } = useUser();
  const { chats, isGuest } = useChatContext();

  // Determine greeting based on auth state
  const greeting = isGuest
    ? "Benvenuto!"
    : `Ciao${user?.firstName ? `, ${user.firstName}` : ""}!`;

  return (
    <PageWrapper className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center p-8">
        <div className="flex w-full max-w-3xl flex-col items-center text-center">
          {/* Welcome */}
          <div className="mb-8">
            <Brain className="mx-auto size-16 text-primary/80" />
            <h1 className="mt-4 text-3xl font-bold">{greeting}</h1>
            <p className="mt-2 text-lg text-muted-foreground">
              Sono Anthon, il tuo coach AI personale. Come posso aiutarti oggi?
            </p>
          </div>

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
