"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface ChatHeaderProps {
  chatId: string;
  title: string;
  onRename?: (id: string, newTitle: string) => Promise<boolean>;
}

export function ChatHeader({ chatId, title, onRename }: ChatHeaderProps) {
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

      toast.success("Chat exported successfully");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export chat");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-white/10 bg-background/40 backdrop-blur-xl px-4 transition-all">
      <div className="flex items-center gap-2 overflow-hidden">
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
              className="w-full text-left truncate cursor-pointer hover:underline underline-offset-4 decoration-muted-foreground/50 transition-all bg-transparent border-0 p-0"
              onClick={() => {
                if (onRename) {
                  setRenameValue(title);
                  setIsRenaming(true);
                }
              }}
              title="Click to rename"
            >
              {title}
            </button>
          </h1>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={handleExport}
          disabled={isExporting}
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Export</span>
        </Button>
      </div>
    </header>
  );
}
