"use client";

import { Loader2, MessageSquare, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDebounce } from "@/hooks/useDebounce";

interface SearchResult {
  id: string;
  content: string;
  role: string;
  createdAt: string;
  chatId: string;
  chatTitle: string;
  snippet: string;
}

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchDialog({ isOpen, onClose }: SearchDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const debouncedQuery = useDebounce(query, 300);

  // Search when query changes
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setResults([]);
      return;
    }

    const search = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/chats/search?q=${encodeURIComponent(debouncedQuery)}`,
        );
        if (response.ok) {
          const data = await response.json();
          setResults(data.results || []);
        }
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setIsLoading(false);
      }
    };

    search();
  }, [debouncedQuery]);

  function handleResultClick(result: SearchResult) {
    router.push(`/chat/${result.chatId}`);
    onClose();
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="top-1/4 w-full max-w-xl gap-0 overflow-hidden rounded-2xl border-border/70 p-0 dark:border-white/10"
        onOpenAutoFocus={(event) => {
          returnFocusRef.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          event.preventDefault();
          inputRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnFocusRef.current?.isConnected) {
            returnFocusRef.current.focus();
          }
        }}
      >
        <DialogTitle className="sr-only">Cerca nelle conversazioni</DialogTitle>
        <DialogDescription className="sr-only">
          Cerca tra i messaggi delle tue conversazioni.
        </DialogDescription>
        {/* Search Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 dark:border-white/10">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca nei messaggi…"
            aria-label="Cerca nei messaggi"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground/50"
          />
          {isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onClose}
            aria-label="Chiudi ricerca"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {results.length === 0 && query.length >= 2 && !isLoading && (
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">
              Nessun risultato per “{query}”
            </div>
          )}

          {results.length === 0 && query.length < 2 && (
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">
              Digita almeno 2 caratteri per cercare
            </div>
          )}

          {results.map((result) => (
            <button
              type="button"
              key={result.id}
              onClick={() => handleResultClick(result)}
              className="w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b border-border/40 last:border-0 dark:border-white/5"
            >
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  {result.chatTitle}
                </span>
                <span className="text-xs text-muted-foreground/50">
                  {result.role === "USER" ? "Tu" : "Anthon"}
                </span>
              </div>
              <p className="text-sm text-foreground/80 line-clamp-2">
                {result.snippet}
              </p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
