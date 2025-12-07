"use client";

import { Brain, PanelLeftClose } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SidebarHeaderProps {
  onCollapse: () => void;
}

export function SidebarHeader({ onCollapse }: SidebarHeaderProps) {
  return (
    <div className="flex h-14 items-center justify-between border-b border-white/10 bg-background/40 backdrop-blur-md px-4 transition-all">
      <div className="flex items-center gap-2">
        <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-primary/20 to-primary/10 shadow-sm ring-1 ring-white/20">
          <Brain className="h-5 w-5 text-primary" />
        </div>
        <span className="font-semibold text-foreground/90">Anthon</span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:bg-white/10 hover:text-foreground"
        onClick={onCollapse}
      >
        <PanelLeftClose className="h-4 w-4" />
      </Button>
    </div>
  );
}
