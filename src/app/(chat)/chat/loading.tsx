import { Loader2 } from "lucide-react";

export default function ChatLoading() {
  return (
    <div className="flex flex-1 flex-col h-full bg-linear-to-b from-background to-muted/20">
      {/* Header Skeleton */}
      <div className="flex h-12 sm:h-14 items-center justify-between border-b border-border/50 px-4 sm:px-6">
        <div className="h-4 w-32 animate-pulse rounded-md bg-muted" />
        <div className="flex gap-2">
          <div className="h-8 w-8 animate-pulse rounded-md bg-muted" />
          <div className="h-8 w-8 animate-pulse rounded-md bg-muted" />
        </div>
      </div>

      {/* Content Skeleton */}
      <div className="flex flex-1 flex-col items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
        <p className="mt-4 text-sm text-muted-foreground animate-pulse">
          Caricamento conversazione...
        </p>
      </div>

      {/* Input Skeleton */}
      <div className="p-4 sm:p-6 space-y-4">
        <div className="mx-auto max-w-3xl h-24 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
