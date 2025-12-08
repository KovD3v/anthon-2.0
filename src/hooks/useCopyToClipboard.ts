import { useCallback, useState } from "react";
import { toast } from "sonner";

interface CopyResult {
  copied: boolean;
  copy: (text: string) => Promise<void>;
  reset: () => void;
}

/**
 * Hook to copy text to clipboard with feedback.
 * Shows success/error toasts and tracks copied state.
 */
export function useCopyToClipboard(): CopyResult {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");

      // Reset after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
      setCopied(false);
    }
  }, []);

  const reset = useCallback(() => setCopied(false), []);

  return { copied, copy, reset };
}
