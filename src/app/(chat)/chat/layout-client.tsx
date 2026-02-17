"use client";

import { useUser } from "@clerk/nextjs";
import { PanelLeft, Sparkles, UserPlus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  startTransition,
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
import type { Chat, ChatData, UsageData } from "@/types/chat";
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
  isGuest: boolean;
  createChat: () => Promise<string | null>;
  deleteChat: (id: string) => Promise<boolean>;
  refreshChats: () => Promise<void>;
  preFetchChat: (id: string) => Promise<void>;
  getCachedChat: (id: string) => ChatData | null;
  navigateToChat: (id: string) => void;
  renameChat: (id: string, newTitle: string) => Promise<boolean>;
  updateCachedChat: (id: string, data: Partial<ChatData>) => void;
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
// Guest Banner Component
// -----------------------------------------------------

function GuestBanner({
  remaining,
  showToggle,
  onToggleSidebar,
}: {
  remaining?: number;
  showToggle?: boolean;
  onToggleSidebar?: () => void;
}) {
  return (
    <div className="mx-2 mt-2 md:mx-4 md:mt-4">
      <div className="flex items-center justify-between gap-3 bg-linear-to-r from-primary/10 via-primary/5 to-transparent backdrop-blur-xl border border-primary/20 px-3 py-2 sm:px-4 sm:py-2.5 rounded-2xl shadow-sm shadow-primary/5">
        <div className="flex items-center gap-3 min-w-0">
          {showToggle && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 -ml-1 shrink-0"
              onClick={onToggleSidebar}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0" />
            <span className="text-muted-foreground truncate text-sm">
              <span className="hidden xs:inline">Ospite: </span>
              {remaining !== undefined && (
                <span className="font-medium text-primary">
                  {remaining} {remaining === 1 ? "messaggio" : "messaggi"}
                </span>
              )}
            </span>
          </div>
        </div>
        <Button
          asChild
          size="sm"
          variant="default"
          className="gap-1.5 h-8 text-xs shrink-0 rounded-xl px-3"
        >
          <Link href="/sign-up">
            <UserPlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Registrati</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}

// -----------------------------------------------------
// Client Layout Component
// -----------------------------------------------------

export function LayoutClient({
  children,
  initialChats,
  initialUsageData,
  isGuest,
}: {
  children: React.ReactNode;
  initialChats: Chat[];
  initialUsageData: UsageData | null;
  isGuest: boolean;
}) {
  const { user } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [chats, setChats] = useState<Chat[]>(initialChats);
  const [isLoading, _setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth >= 768;
    }
    return true;
  });
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { confirm, isOpen, options, handleConfirm, setIsOpen } = useConfirm();

  // API base path switches based on auth mode
  const apiBase = isGuest ? "/api/guest" : "/api";

  // Usage tracking state
  const [usageData, setUsageData] = useState(initialUsageData);

  // Sync state with initial data on change (HMR support)
  useEffect(() => {
    setChats(initialChats);
  }, [initialChats]);

  useEffect(() => {
    setUsageData(initialUsageData);
  }, [initialUsageData]);

  // Keep usage monitor fresh while user is active in chat.
  useEffect(() => {
    const endpoint = isGuest ? "/api/guest/usage" : "/api/usage";
    let cancelled = false;

    const refreshUsageData = async () => {
      try {
        const res = await fetch(`${endpoint}?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as UsageData;
        if (!cancelled) {
          setUsageData(data);
        }
      } catch (error) {
        console.error("Failed to refresh usage data:", error);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshUsageData();
      }
    };

    refreshUsageData();
    const intervalId = window.setInterval(refreshUsageData, 30_000);
    window.addEventListener("focus", refreshUsageData);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshUsageData);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isGuest]);

  // Keyboard shortcuts
  useKeyboardShortcut({
    key: "n",
    modifiers: ["meta"],
    callback: () => {
      createChat();
    },
  });

  useKeyboardShortcut({
    key: "/",
    modifiers: ["meta"],
    callback: () => setIsSidebarOpen((prev) => !prev),
  });

  useKeyboardShortcut({
    key: "k",
    modifiers: ["meta"],
    callback: () => setIsSearchOpen(true),
    enabled: !!user,
  });

  // Chat data cache for avoiding redundant API calls
  const chatCacheRef = useRef<Map<string, ChatData>>(new Map());
  const preFetchingIdsRef = useRef<Set<string>>(new Set());
  const MAX_CACHE_SIZE = 20;

  // Get current chat ID from pathname
  const currentChatId = pathname?.split("/chat/")?.[1] || null;

  // Fetch chats (for refresh)
  async function refreshChats() {
    try {
      const response = await fetch(`${apiBase}/chats`);
      if (response.ok) {
        const data = await response.json();
        setChats(data.chats || []);
      }
    } catch (error) {
      console.error("Failed to fetch chats:", error);
    }
  }

  // Handle mobile scroll locking
  useEffect(() => {
    const isMobile = window.innerWidth <= 768;
    if (isMobile && isSidebarOpen) {
      document.documentElement.classList.add("no-scroll");
    } else {
      document.documentElement.classList.remove("no-scroll");
    }
  }, [isSidebarOpen]);

  // Pre-fetch chat data on hover
  async function preFetchChat(id: string) {
    console.log(`[Prefetch] Triggered for chat ${id}`);
    router.prefetch(`/chat/${id}`);

    if (chatCacheRef.current.has(id) || preFetchingIdsRef.current.has(id)) {
      console.log(`[Prefetch] Already cached or fetching for ${id}`);
      return;
    }

    preFetchingIdsRef.current.add(id);

    try {
      const response = await fetch(`${apiBase}/chats/${id}`);
      if (response.ok) {
        const data = await response.json();

        if (chatCacheRef.current.size >= MAX_CACHE_SIZE) {
          const firstKey = chatCacheRef.current.keys().next().value;
          if (firstKey) {
            chatCacheRef.current.delete(firstKey);
          }
        }

        chatCacheRef.current.set(id, data);
        console.log(`[Prefetch] Successfully cached data for ${id}`);
      }
    } catch (error) {
      console.error("[Prefetch] Failed:", error);
    } finally {
      preFetchingIdsRef.current.delete(id);
    }
  }

  function getCachedChat(id: string): ChatData | null {
    return chatCacheRef.current.get(id) || null;
  }

  function updateCachedChat(id: string, data: Partial<ChatData>) {
    const existing = chatCacheRef.current.get(id);
    if (existing) {
      chatCacheRef.current.set(id, { ...existing, ...data });
    } else if (data.messages) {
      chatCacheRef.current.set(id, data as ChatData);
    }
  }

  function navigateToChat(id: string) {
    startTransition(() => {
      router.push(`/chat/${id}`, { scroll: false });
    });
  }

  // Create chat
  const createChat = async (): Promise<string | null> => {
    try {
      const response = await fetch(`${apiBase}/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        const chat = await response.json();

        const newChat: Chat = {
          id: chat.id,
          title: chat.title ?? "Nuova Chat",
          visibility: chat.visibility,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
          messageCount: 0,
        };

        setChats((prev) => [newChat, ...prev]);
        router.push(`/chat/${chat.id}`);
        return chat.id;
      }
    } catch (error) {
      console.error("Failed to create chat:", error);
    }
    return null;
  };

  // Rename chat
  const renameChat = async (id: string, newTitle: string): Promise<boolean> => {
    try {
      setChats((prev) => {
        const chat = prev.find((c) => c.id === id);
        if (!chat) return prev;
        const filtered = prev.filter((c) => c.id !== id);
        return [{ ...chat, title: newTitle }, ...filtered];
      });

      const response = await fetch(`${apiBase}/chats/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });

      if (response.ok) {
        const cached = chatCacheRef.current.get(id);
        if (cached) {
          chatCacheRef.current.set(id, {
            ...cached,
            title: newTitle,
          });
        }
        return true;
      } else {
        await refreshChats();
        toast.error("Failed to rename chat");
        return false;
      }
    } catch (error) {
      console.error("Failed to rename chat:", error);
      await refreshChats();
      toast.error("Failed to rename chat");
      return false;
    }
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
      const response = await fetch(`${apiBase}/chats/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Optimistically remove the chat from local state immediately
        setChats((prev) => prev.filter((c) => c.id !== id));
        chatCacheRef.current.delete(id);

        // Navigate away if we just deleted the current chat
        if (currentChatId === id) {
          router.push("/chat");
        }

        toast.success("Conversazione eliminata");

        // Refresh chat list in the background (non-blocking)
        refreshChats().catch(() => {});

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

  return (
    <ChatContext.Provider
      value={{
        chats,
        isLoading,
        currentChatId,
        isGuest,
        createChat,
        deleteChat,
        refreshChats,
        preFetchChat,
        getCachedChat,
        navigateToChat,
        renameChat,
        updateCachedChat,
      }}
    >
      <div className="flex h-dvh overflow-hidden">
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
          } fixed left-0 top-0 z-50 h-full w-72 shrink-0 overflow-hidden border-r border-border/50 dark:border-white/10 bg-background/80 dark:bg-muted/40 backdrop-blur-xl transition-all duration-300 ease-in-out md:relative md:z-auto`}
        >
          <div className="flex h-full w-72 flex-col pt-[env(safe-area-inset-top)]">
            <SidebarHeader onCollapse={() => setIsSidebarOpen(false)} />

            <ChatList
              chats={chats}
              isLoading={isLoading}
              currentChatId={currentChatId}
              deletingChatId={deletingChatId}
              onDelete={deleteChat}
              onSelect={(id) => {
                navigateToChat(id);
                if (window.innerWidth < 768) {
                  setIsSidebarOpen(false);
                }
              }}
              onCreate={createChat}
              onRename={renameChat}
              onPreFetch={preFetchChat}
            />

            <SidebarBottom />
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top)]">
          {/* Integrated Header Bar */}
          {isGuest ? (
            <GuestBanner
              showToggle={!isSidebarOpen}
              onToggleSidebar={() => setIsSidebarOpen(true)}
              remaining={
                usageData
                  ? Math.max(
                      0,
                      usageData.limits.maxRequests -
                        usageData.usage.requestCount,
                    )
                  : undefined
              }
            />
          ) : usageData ? (
            <UsageBanner
              showToggle={!isSidebarOpen}
              onToggleSidebar={() => setIsSidebarOpen(true)}
              usage={usageData.usage}
              limits={usageData.limits}
              tier={usageData.tier}
              subscriptionStatus={usageData.subscriptionStatus}
              entitlements={usageData.entitlements}
            />
          ) : (
            !isSidebarOpen && (
              <div className="mx-2 mt-2 md:mx-4 md:mt-4">
                <div className="flex h-12 sm:h-14 items-center border border-border/50 dark:border-white/10 bg-background/60 backdrop-blur-xl rounded-2xl px-3 sm:px-4 shadow-sm">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setIsSidebarOpen(true)}
                  >
                    <PanelLeft className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )
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
