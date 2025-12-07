"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2, MessageSquare, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Chat {
  id: string;
  title: string;
  messageCount: number;
}

interface ChatListProps {
  chats: Chat[];
  isLoading: boolean;
  currentChatId: string | null;
  deletingChatId: string | null;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onPreFetch: (id: string) => void;
}

export function ChatList({
  chats,
  isLoading,
  currentChatId,
  deletingChatId,
  onDelete,
  onSelect,
  onCreate,
  onPreFetch,
}: ChatListProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="p-3">
        <Button
          onClick={onCreate}
          className="group w-full justify-start gap-2 bg-background/50 text-foreground/80 shadow-sm backdrop-blur-sm transition-all hover:bg-background/80 hover:shadow-md active:scale-[0.98] border border-white/10"
          variant="outline"
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
            <Plus className="h-3.5 w-3.5" />
          </div>
          New Chat
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 pt-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : chats.length === 0 ? (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="px-2 py-8 text-center text-sm text-muted-foreground"
          >
            No conversations yet
          </motion.p>
        ) : (
          <ul className="space-y-1">
            <AnimatePresence mode="popLayout">
              {chats.map((chat) => (
                <ChatItem
                  key={chat.id}
                  chat={chat}
                  isActive={chat.id === currentChatId}
                  isDeleting={deletingChatId === chat.id}
                  onDelete={() => onDelete(chat.id)}
                  onClick={() => onSelect(chat.id)}
                  onPreFetch={() => onPreFetch(chat.id)}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}

function ChatItem({
  chat,
  isActive,
  isDeleting,
  onDelete,
  onClick,
  onPreFetch,
}: {
  chat: Chat;
  isActive: boolean;
  isDeleting: boolean;
  onDelete: () => void;
  onClick: () => void;
  onPreFetch: () => void;
}) {
  const [showActions, setShowActions] = useState(false);

  const handleMouseEnter = () => {
    setShowActions(true);
    // Pre-fetch chat data on hover
    onPreFetch();
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10, transition: { duration: 0.2 } }}
      className={`group relative flex list-none items-center rounded-xl px-3 py-2.5 text-sm transition-all hover:bg-white/5 ${
        isActive
          ? "bg-white/10 font-medium text-foreground shadow-sm ring-1 ring-white/10"
          : "text-muted-foreground"
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShowActions(false)}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex flex-1 items-center gap-3 truncate text-left"
      >
        <MessageSquare
          className={`h-4 w-4 shrink-0 transition-colors ${
            isActive
              ? "text-primary"
              : "text-muted-foreground/50 group-hover:text-muted-foreground"
          }`}
        />
        <span className="truncate">{chat.title}</span>
      </button>

      {/* Actions */}
      {showActions && !isDeleting && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 h-6 w-6 shrink-0 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}

      {isDeleting && (
        <div className="absolute right-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </motion.li>
  );
}
