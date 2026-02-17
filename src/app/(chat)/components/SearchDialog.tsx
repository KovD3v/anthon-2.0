"use client";

import { Loader2, MessageSquare, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useDebounce } from "@/hooks/useDebounce";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";

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

  const debouncedQuery = useDebounce(query, 300);

  // Close on Escape
  useKeyboardShortcut({
    key: "Escape",
    callback: onClose,
    enabled: isOpen,
  });

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm">
      <div className="fixed left-1/2 top-1/4 -translate-x-1/2 w-full max-w-xl">
        <div className="mx-4 rounded-2xl bg-background border border-white/10 shadow-2xl overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
            <Search className="h-5 w-5 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search messages..."
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
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Results */}
          <div className="max-h-96 overflow-y-auto">
            {results.length === 0 && query.length >= 2 && !isLoading && (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                No results found for "{query}"
              </div>
            )}

            {results.length === 0 && query.length < 2 && (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                Type at least 2 characters to search
              </div>
            )}

            {results.map((result) => (
              <button
                type="button"
                key={result.id}
                onClick={() => handleResultClick(result)}
                className="w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b border-white/5 last:border-0"
              >
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">
                    {result.chatTitle}
                  </span>
                  <span className="text-xs text-muted-foreground/50">
                    {result.role === "USER" ? "You" : "Anthon"}
                  </span>
                </div>
                <p className="text-sm text-foreground/80 line-clamp-2">
                  {result.snippet}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
