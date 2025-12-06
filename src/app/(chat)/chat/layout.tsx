"use client";

import {
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  Brain,
  Plus,
  MessageSquare,
  Trash2,
  PanelLeftClose,
  PanelLeft,
  Loader2,
  Home,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/hooks/use-confirm";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

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
  const { confirm, isOpen, options, handleConfirm, handleCancel, setIsOpen } =
    useConfirm();

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
            isSidebarOpen ? "w-64" : "w-0"
          } shrink-0 overflow-hidden border-r bg-muted/30 transition-all duration-300`}
        >
          <div className="flex h-full w-64 flex-col">
            {/* Sidebar Header */}
            <div className="flex h-14 items-center justify-between border-b px-4">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                <span className="font-semibold">Anthon</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsSidebarOpen(false)}
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>

            {/* New Chat Button */}
            <div className="p-2">
              <Button
                onClick={createChat}
                className="w-full justify-start gap-2"
                variant="outline"
              >
                <Plus className="h-4 w-4" />
                New Chat
              </Button>
            </div>

            {/* Chat List */}
            <div className="flex-1 overflow-y-auto p-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : chats.length === 0 ? (
                <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                  No conversations yet
                </p>
              ) : (
                <ul className="space-y-1">
                  {chats.map((chat) => (
                    <ChatItem
                      key={chat.id}
                      chat={chat}
                      isActive={chat.id === currentChatId}
                      isDeleting={deletingChatId === chat.id}
                      onDelete={() => deleteChat(chat.id)}
                      onClick={() => router.push(`/chat/${chat.id}`)}
                    />
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t p-2">
              <Button
                variant="ghost"
                className="w-full justify-start gap-2"
                onClick={() => router.push("/")}
              >
                <Home className="h-4 w-4" />
                Back to Home
              </Button>
            </div>
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

// -----------------------------------------------------
// Chat Item Component
// -----------------------------------------------------

function ChatItem({
  chat,
  isActive,
  isDeleting,
  onDelete,
  onClick,
}: {
  chat: Chat;
  isActive: boolean;
  isDeleting: boolean;
  onDelete: () => void;
  onClick: () => void;
}) {
  const [showActions, setShowActions] = useState(false);

  return (
    <li
      className={`group relative flex list-none items-center rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted ${
        isActive ? "bg-muted" : ""
      }`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex flex-1 items-center gap-2 truncate text-left"
      >
        <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{chat.title}</span>
      </button>

      {/* Actions */}
      {showActions && !isDeleting && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}

      {isDeleting && (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      )}
    </li>
  );
}
