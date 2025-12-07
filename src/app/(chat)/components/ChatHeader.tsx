"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatHeaderProps {
  title: string;
  showRegenerate: boolean;
  onRegenerate: () => void;
}

export function ChatHeader({
  title,
  showRegenerate,
  onRegenerate,
}: ChatHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-white/10 bg-background/40 backdrop-blur-xl px-4 transition-all">
      <div className="flex items-center gap-2">
        <h1 className="font-semibold text-foreground/90 truncate">{title}</h1>
      </div>
      {showRegenerate && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRegenerate}
          className="h-8 text-muted-foreground hover:bg-white/10 hover:text-foreground"
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Regenerate
        </Button>
      )}
    </header>
  );
}
