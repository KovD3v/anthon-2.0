"use client";

import { useUser } from "@clerk/nextjs";
import { Brain, Loader2, PanelLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useConfirm } from "@/hooks/use-confirm";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import type { Chat, ChatData } from "@/types/chat";
import { ChatList } from "../../(chat)/components/ChatList";
import { SearchDialog } from "../../(chat)/components/SearchDialog";
import { SidebarBottom } from "../../(chat)/components/SidebarBottom";
import { SidebarHeader } from "../../(chat)/components/SidebarHeader";
import { UsageBanner } from "../../(chat)/components/UsageBanner";

// -----------------------------------------------------
// Types
// -----------------------------------------------------

interface ChatContextType {
  chats: Chat[];
  isLoading: boolean;
  currentChatId: string | null;
  createChat: () => Promise<string | null>;
  deleteChat: (id: string) => Promise<boolean>;
  refreshChats: () => Promise<void>;
  preFetchChat: (id: string) => Promise<void>;
  getCachedChat: (id: string) => ChatData | null;
  navigateToChat: (id: string) => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within ChatLayout");
  }
  return context;
}

// -----------------------------------------------------
// Layout Component
// -----------------------------------------------------

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { confirm, isOpen, options, handleConfirm, setIsOpen } = useConfirm();

  // Usage tracking state
  const [usageData, setUsageData] = useState<{
    usage: {
      requestCount: number;
      inputTokens: number;
      outputTokens: number;
      totalCostUsd: number;
    };
    limits: {
      maxRequests: number;
      maxInputTokens: number;
      maxOutputTokens: number;
      maxCostUsd: number;
    };
    subscriptionStatus: "TRIAL" | "ACTIVE" | "CANCELLED" | "EXPIRED" | null;
  } | null>(null);

  // Keyboard shortcuts
  useKeyboardShortcut({
    key: "n",
    modifiers: ["meta"],
    callback: () => {
      if (user) createChat();
    },
    enabled: !!user,
  });

  useKeyboardShortcut({
    key: "/",
    modifiers: ["meta"],
    callback: () => setIsSidebarOpen((prev) => !prev),
  });

  // Cmd+K for search
  useKeyboardShortcut({
    key: "k",
    modifiers: ["meta"],
    callback: () => setIsSearchOpen(true),
    enabled: !!user,
  });

  // Chat data cache for avoiding redundant API calls (using refs to avoid stale closures)
  const chatCacheRef = useRef<Map<string, ChatData>>(new Map());
  const preFetchingIdsRef = useRef<Set<string>>(new Set());
  const MAX_CACHE_SIZE = 20; // LRU cache limit

  // Get current chat ID from pathname
  const currentChatId = pathname?.split("/chat/")?.[1] || null;

  // Fetch chats
  const refreshChats = useCallback(async () => {
    try {
      const response = await fetch("/api/chats");
      if (response.ok) {
        const data = await response.json();
        setChats(data.chats || []);
      }
    } catch (error) {
      console.error("Failed to fetch chats:", error);
    }
  }, []);

  // Load chats on mount
  useEffect(() => {
    async function loadChats() {
      if (isLoaded && user) {
        await refreshChats();
        setIsLoading(false);
      } else if (isLoaded && !user) {
        setIsLoading(false);
      }
    }
    loadChats();
  }, [isLoaded, user, refreshChats]);

  // Fetch usage data on mount
  useEffect(() => {
    async function loadUsage() {
      if (!user) return;
      try {
        const response = await fetch("/api/usage");
        if (response.ok) {
          const data = await response.json();
          setUsageData(data);
        }
      } catch (error) {
        console.error("Failed to fetch usage:", error);
      }
    }
    loadUsage();
  }, [user]);

  // Pre-fetch chat data on hover with LRU cache eviction
  const preFetchChat = useCallback(async (id: string) => {
    // Skip if already cached or currently pre-fetching
    if (chatCacheRef.current.has(id) || preFetchingIdsRef.current.has(id)) {
      return;
    }

    preFetchingIdsRef.current.add(id);

    try {
      const response = await fetch(`/api/chats/${id}`);
      if (response.ok) {
        const data = await response.json();

        // LRU eviction: remove oldest entry if cache is full
        if (chatCacheRef.current.size >= MAX_CACHE_SIZE) {
          const firstKey = chatCacheRef.current.keys().next().value;
          if (firstKey) {
            chatCacheRef.current.delete(firstKey);
          }
        }

        chatCacheRef.current.set(id, data);
      }
    } catch (error) {
      console.error("Failed to pre-fetch chat:", error);
    } finally {
      preFetchingIdsRef.current.delete(id);
    }
  }, []);

  // Get cached chat data
  const getCachedChat = useCallback((id: string): ChatData | null => {
    return chatCacheRef.current.get(id) || null;
  }, []);

  // Navigate to chat with client-side state management
  const navigateToChat = useCallback(
    (id: string) => {
      // Use startTransition for non-blocking navigation
      startTransition(() => {
        router.push(`/chat/${id}`, { scroll: false });
      });
    },
    [router],
  );

  // Create new chat
  const createChat = async (): Promise<string | null> => {
    try {
      const response = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        const chat = await response.json();

        // Optimistically add the new chat to the list (avoid re-fetch)
        const newChat: Chat = {
          id: chat.id,
          title: chat.title ?? "Nuova Chat",
          visibility: chat.visibility,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
          messageCount: 0,
        };

        // Add to the beginning of the list
        setChats((prev) => [newChat, ...prev]);

        // Navigate to the new chat
        router.push(`/chat/${chat.id}`);
        return chat.id;
      }
    } catch (error) {
      console.error("Failed to create chat:", error);
    }
    return null;
  };

  // Delete chat
  const deleteChat = async (id: string): Promise<boolean> => {
    const confirmed = await confirm({
      title: "Eliminare la conversazione?",
      description:
        "Questo eliminerà permanentemente questa conversazione e tutti i suoi messaggi. Questa azione non può essere annullata.",
      confirmText: "Elimina",
      cancelText: "Annulla",
      variant: "destructive",
    });

    if (!confirmed) {
      return false;
    }

    setDeletingChatId(id);
    try {
      const response = await fetch(`/api/chats/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await refreshChats();
        // If we deleted the current chat, navigate to /chat
        if (currentChatId === id) {
          router.push("/chat");
        }
        toast.success("Conversation deleted");
        return true;
      } else {
        toast.error("Eliminazione conversazione fallita");
      }
    } catch (error) {
      console.error("Failed to delete chat:", error);
      toast.error("Eliminazione conversazione fallita");
    } finally {
      setDeletingChatId(null);
    }
    return false;
  };

  // Show loading state
  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show sign in prompt if not authenticated
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <Brain className="h-16 w-16 text-primary" />
        <h1 className="text-2xl font-bold">Anthon</h1>
        <p className="text-muted-foreground">
          Accedi per iniziare a chattare con Anthon
        </p>
        <Button asChild>
          <a href="/sign-in">Accedi</a>
        </Button>
      </div>
    );
  }

  return (
    <ChatContext.Provider
      value={{
        chats,
        isLoading,
        currentChatId,
        createChat,
        deleteChat,
        refreshChats,
        preFetchChat,
        getCachedChat,
        navigateToChat,
      }}
    >
      <div className="flex h-screen overflow-hidden">
        {/* Mobile Backdrop */}
        {isSidebarOpen && (
          <button
            type="button"
            aria-label="Close sidebar"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden cursor-default"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`${
            isSidebarOpen
              ? "translate-x-0"
              : "-translate-x-full md:translate-x-0"
          } ${
            isSidebarOpen ? "md:w-72" : "md:w-0"
          } fixed left-0 top-0 z-50 h-full w-72 shrink-0 overflow-hidden border-r border-white/10 bg-muted/40 backdrop-blur-xl transition-all duration-300 ease-in-out md:relative md:z-auto`}
        >
          <div className="flex h-full w-72 flex-col">
            <SidebarHeader onCollapse={() => setIsSidebarOpen(false)} />

            <ChatList
              chats={chats}
              isLoading={isLoading}
              currentChatId={currentChatId}
              deletingChatId={deletingChatId}
              onDelete={deleteChat}
              onSelect={(id) => {
                navigateToChat(id);
                // Close sidebar on mobile after selecting
                if (window.innerWidth < 768) {
                  setIsSidebarOpen(false);
                }
              }}
              onCreate={createChat}
              onPreFetch={preFetchChat}
            />

            <SidebarBottom />
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Usage Banner */}
          {usageData && (
            <UsageBanner
              usage={usageData.usage}
              limits={usageData.limits}
              subscriptionStatus={usageData.subscriptionStatus}
            />
          )}

          {/* Header with sidebar toggle */}
          {!isSidebarOpen && (
            <div className="flex h-14 items-center border-b px-4">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsSidebarOpen(true)}
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            </div>
          )}
          {children}
        </div>
      </div>
      <SearchDialog
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
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
    </ChatContext.Provider>
  );
}
