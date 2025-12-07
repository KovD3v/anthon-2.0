"use client";

import { Send, Square } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  setInput: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onStop: () => void;
}

export function ChatInput({
  input,
  isLoading,
  setInput,
  onSubmit,
  onStop,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [adjustHeight]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e);
    }
  };

  return (
    <div className="relative mx-auto w-full max-w-3xl px-4 pb-6 pt-2">
      <form
        onSubmit={onSubmit}
        className="relative flex items-end gap-2 rounded-4xl border border-white/10 bg-background/60 p-2 shadow-lg backdrop-blur-xl ring-1 ring-black/5 dark:bg-muted/40 dark:ring-white/10 transition-all focus-within:ring-2 focus-within:ring-primary/20"
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          rows={1}
          className="flex-1 resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/50 max-h-[200px] overflow-y-auto scrollbar-none"
          disabled={isLoading}
        />
        <div className="pb-1 pr-1">
          {isLoading ? (
            <Button
              type="button"
              size="icon"
              variant="destructive"
              className="h-9 w-9 rounded-full shadow-sm transition-all hover:shadow-md"
              onClick={onStop}
            >
              <Square className="h-4 w-4 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className={`h-9 w-9 rounded-full transition-all duration-200 ${
                input.trim()
                  ? "bg-primary text-primary-foreground shadow-md hover:shadow-lg hover:scale-105"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
              disabled={!input.trim()}
            >
              <Send className="h-4 w-4 ml-0.5" />
            </Button>
          )}
        </div>
      </form>
      <div className="mt-2 text-center text-[10px] text-muted-foreground/40 font-medium select-none">
        Anthon AI • v2.0
      </div>
    </div>
  );
}
