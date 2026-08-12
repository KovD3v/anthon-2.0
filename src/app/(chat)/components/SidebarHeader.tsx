"use client";

import { Brain, PanelLeftClose, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SidebarHeaderProps {
  onCollapse: () => void;
  onSearch?: () => void;
}

export function SidebarHeader({ onCollapse, onSearch }: SidebarHeaderProps) {
  return (
    <div className="flex h-14 items-center justify-between border-b border-border/50 bg-background/80 px-4 backdrop-blur-md dark:border-white/10 dark:bg-background/40">
      <div className="flex min-w-0 items-center gap-2">
        <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-primary/20 to-primary/10 shadow-sm ring-1 ring-border dark:ring-white/20">
          <Brain className="h-5 w-5 text-primary" />
        </div>
        <span className="truncate font-semibold text-foreground/90">
          AI mental coach
        </span>
      </div>
      <div className="flex items-center gap-1">
        {onSearch ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:bg-accent hover:text-foreground dark:hover:bg-white/10"
            onClick={onSearch}
            aria-label="Cerca nelle conversazioni"
          >
            <Search className="h-4 w-4" />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:bg-accent hover:text-foreground dark:hover:bg-white/10"
          onClick={onCollapse}
          aria-label="Chiudi la barra laterale"
        >
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
