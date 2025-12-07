"use client";

import { useUser } from "@clerk/nextjs";
import { Brain, Loader2, PanelLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { toast } from "sonner";
import { ChatList } from "@/components/chat/ChatList";
import { SidebarBottom } from "@/components/chat/SidebarBottom";
import { SidebarHeader } from "@/components/chat/SidebarHeader";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useConfirm } from "@/hooks/use-confirm";

// -----------------------------------------------------
// Types
// -----------------------------------------------------

interface Chat {
  id: string;
  title: string;
  visibility: "PRIVATE" | "PUBLIC";
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

interface ChatContextType {
  chats: Chat[];
  isLoading: boolean;
  currentChatId: string | null;
  createChat: () => Promise<string | null>;
  deleteChat: (id: string) => Promise<boolean>;
  refreshChats: () => Promise<void>;
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
  const { confirm, isOpen, options, handleConfirm, setIsOpen } = useConfirm();

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
          title: chat.title ?? "New Chat",
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
      title: "Delete conversation?",
      description:
        "This will permanently delete this conversation and all its messages. This action cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
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
        toast.error("Failed to delete conversation");
      }
    } catch (error) {
      console.error("Failed to delete chat:", error);
      toast.error("Failed to delete conversation");
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
          Sign in to start chatting with your personal coach
        </p>
        <Button asChild>
          <a href="/sign-in">Sign In</a>
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
      }}
    >
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`${
            isSidebarOpen ? "w-72" : "w-0"
          } shrink-0 overflow-hidden border-r border-white/10 bg-muted/40 backdrop-blur-xl transition-all duration-300 ease-in-out`}
        >
          <div className="flex h-full w-72 flex-col">
            <SidebarHeader onCollapse={() => setIsSidebarOpen(false)} />

            <ChatList
              chats={chats}
              isLoading={isLoading}
              currentChatId={currentChatId}
              deletingChatId={deletingChatId}
              onDelete={deleteChat}
              onSelect={(id) => router.push(`/chat/${id}`)}
              onCreate={createChat}
            />

            <SidebarBottom />
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
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
