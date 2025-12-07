"use client";

interface ChatHeaderProps {
  title: string;
}

export function ChatHeader({ title }: ChatHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-white/10 bg-background/40 backdrop-blur-xl px-4 transition-all">
      <div className="flex items-center gap-2">
        <h1 className="font-semibold text-foreground/90 truncate">{title}</h1>
      </div>
    </header>
  );
}
