"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
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
  onRename: (id: string, newTitle: string) => Promise<boolean>;
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
  onRename,
  onPreFetch,
}: ChatListProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="p-3">
        <Button
          onClick={onCreate}
          className="group w-full justify-start gap-2 bg-background/50 text-foreground/80 shadow-sm backdrop-blur-sm transition-all hover:bg-background/80 hover:shadow-md active:scale-[0.98] border border-border/50 dark:border-white/10"
          variant="outline"
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
            <Plus className="h-3.5 w-3.5" />
          </div>
          Nuova Chat
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
            Nessuna conversazione ancora. Clicca su "Nuova Chat" per iniziare!
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
                  onRename={(newTitle) => onRename(chat.id, newTitle)}
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
  onRename,
}: {
  chat: Chat;
  isActive: boolean;
  isDeleting: boolean;
  onDelete: () => void;
  onClick: () => void;
  onPreFetch: () => void;
  onRename: (newTitle: string) => Promise<boolean>;
}) {
  const [showActions, setShowActions] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(chat.title);
  const [isSavingRename, setIsSavingRename] = useState(false);

  const handleMouseEnter = () => {
    setShowActions(true);
    // Pre-fetch chat data on hover
    onPreFetch();
  };

  const handleRename = async () => {
    if (!renameValue.trim() || renameValue === chat.title) {
      setIsRenaming(false);
      return;
    }

    setIsSavingRename(true);
    const success = await onRename(renameValue);
    setIsSavingRename(false);
    if (success) {
      setIsRenaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRename();
    } else if (e.key === "Escape") {
      setIsRenaming(false);
      setRenameValue(chat.title);
    }
    e.stopPropagation();
  };

  // Toggle actions on tap for mobile
  const handleTouchEnd = (e: React.TouchEvent) => {
    // Only toggle if not clicking on action buttons
    const target = e.target as HTMLElement;
    if (!target.closest("button")) {
      setShowActions((prev) => !prev);
    }
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10, transition: { duration: 0.2 } }}
      className="group relative list-none"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShowActions(false)}
      onTouchEnd={handleTouchEnd}
    >
      {/* Full area clickable link */}
      <Link
        href={`/chat/${chat.id}`}
        prefetch={true}
        onClick={onClick}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 sm:py-2.5 text-sm transition-all active:scale-[0.98] ${
          isActive
            ? "bg-accent dark:bg-white/10 font-medium text-foreground shadow-sm ring-1 ring-border dark:ring-white/10"
            : "text-muted-foreground hover:text-foreground hover:bg-accent dark:hover:bg-white/5"
        }`}
      >
        <MessageSquare
          className={`h-4 w-4 shrink-0 transition-colors ${
            isActive
              ? "text-primary"
              : "text-muted-foreground/50 group-hover:text-muted-foreground"
          }`}
        />
        <span className={`truncate ${showActions ? "pr-16" : "pr-2"}`}>
          {isRenaming ? (
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.preventDefault()}
              className="w-full bg-transparent outline-none ring-0 p-0 text-foreground placeholder:text-muted-foreground/50"
              onBlur={() => {
                setIsRenaming(false);
                setRenameValue(chat.title);
              }}
              // biome-ignore lint/a11y/noAutofocus: Needed for rename UX
              autoFocus
            />
          ) : (
            chat.title
          )}
        </span>
      </Link>

      {/* Actions - visible on hover/touch */}
      <AnimatePresence>
        {showActions && !isDeleting && !isRenaming && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.15 }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 z-10 bg-background/90 dark:bg-muted/90 backdrop-blur-sm rounded-lg p-0.5 shadow-sm border border-border/50 dark:border-white/10"
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 sm:h-6 sm:w-6 shrink-0 text-muted-foreground hover:bg-primary/10 hover:text-primary rounded-md"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsRenaming(true);
                setShowActions(false);
              }}
            >
              <Pencil className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 sm:h-6 sm:w-6 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-md"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rename Actions */}
      <AnimatePresence>
        {isRenaming && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 z-10 bg-background/95 dark:bg-muted/95 backdrop-blur-sm rounded-lg p-0.5 shadow-md border border-border/50 dark:border-white/10"
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 sm:h-6 sm:w-6 shrink-0 text-green-500 hover:bg-green-500/10 hover:text-green-600 rounded-md"
              disabled={isSavingRename}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleRename();
              }}
            >
              {isSavingRename ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 sm:h-6 sm:w-6 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-md"
              disabled={isSavingRename}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsRenaming(false);
                setRenameValue(chat.title);
              }}
            >
              <X className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {isDeleting && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </motion.li>
  );
}
