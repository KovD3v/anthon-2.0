"use client";

import { Download, PanelLeft, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface ChatHeaderProps {
  chatId: string;
  title: string;
  onRename?: (id: string, newTitle: string) => Promise<boolean>;
  onOpenSidebar?: () => void;
  guestConversationNotice?: {
    remaining?: number;
    registrationHref: string;
  } | null;
}

export function ChatHeader({
  chatId,
  title,
  onRename,
  onOpenSidebar,
  guestConversationNotice,
}: ChatHeaderProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(title);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/chats/${chatId}/export`);
      if (!response.ok) {
        throw new Error("Export failed");
      }

      // Get filename from Content-Disposition header
      const disposition = response.headers.get("Content-Disposition");
      const filename =
        disposition?.match(/filename="(.+)"/)?.[1] || "chat-export.md";

      // Download the file
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Conversazione esportata");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Esportazione non riuscita");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <header className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-border/60 bg-background/40 px-3 backdrop-blur-xl sm:h-14 sm:px-4 dark:border-white/10">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        {onOpenSidebar && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 md:hidden"
            onClick={onOpenSidebar}
            aria-label="Apri la barra laterale"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        )}
        {isRenaming ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (onRename && renameValue.trim() && renameValue !== title) {
                await onRename(chatId, renameValue);
              }
              setIsRenaming(false);
            }}
            className="flex-1"
          >
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => {
                setIsRenaming(false);
                setRenameValue(title);
              }}
              className="w-full bg-transparent font-semibold text-foreground/90 outline-none focus:ring-0"
            />
          </form>
        ) : (
          <h1 className="flex-1 min-w-0 font-semibold text-foreground/90">
            <button
              type="button"
              className="w-full cursor-pointer truncate border-0 bg-transparent p-0 text-left decoration-muted-foreground/50 underline-offset-4 hover:underline"
              onClick={() => {
                if (onRename) {
                  setRenameValue(title);
                  setIsRenaming(true);
                }
              }}
              title="Rinomina conversazione"
              aria-label={`Rinomina conversazione: ${title}`}
            >
              {title}
            </button>
          </h1>
        )}
      </div>

      <div className="flex items-center gap-2">
        {guestConversationNotice && (
          <Button
            asChild
            size="sm"
            className="h-9 shrink-0 gap-1.5 px-2 text-xs md:hidden"
          >
            <Link
              href={guestConversationNotice.registrationHref}
              aria-label={
                guestConversationNotice.remaining === undefined
                  ? "Registrati"
                  : `Registrati: ${guestConversationNotice.remaining} ${
                      guestConversationNotice.remaining === 1
                        ? "messaggio rimasto"
                        : "messaggi rimasti"
                    }`
              }
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">
                {guestConversationNotice.remaining === undefined
                  ? "Registrati"
                  : `${guestConversationNotice.remaining} rimasti`}
              </span>
            </Link>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={handleExport}
          disabled={isExporting}
          aria-label="Esporta conversazione"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Esporta</span>
        </Button>
      </div>
    </header>
  );
}
