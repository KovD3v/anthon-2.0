import { PageWrapper } from "@/components/ui/page-wrapper";

export default function ChatConversationLoading() {
  return (
    <PageWrapper className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-linear-to-b from-background to-muted/20">
        <div className="border-b border-border/50 bg-background/60 px-4 py-3 backdrop-blur-xl">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="size-8 animate-pulse rounded-full bg-muted/45" />
            <div className="h-4 w-32 animate-pulse rounded bg-muted/35" />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center gap-6 py-4">
            <div className="mx-auto size-12 animate-pulse rounded-full bg-primary/20" />
            <div className="space-y-3 text-center">
              <div className="mx-auto h-5 w-48 animate-pulse rounded bg-muted/35" />
              <div className="mx-auto h-3 w-72 max-w-full animate-pulse rounded bg-muted/30" />
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-3xl px-3 pb-6 pt-2 sm:px-4 sm:pb-8">
          <div className="flex items-end gap-2 rounded-4xl border border-white/10 bg-background/60 p-2 shadow-lg ring-1 ring-black/5 backdrop-blur-xl dark:bg-muted/40 dark:ring-white/10">
            <div className="size-9 animate-pulse rounded-full bg-muted/35" />
            <div className="h-10 flex-1 animate-pulse rounded-2xl bg-muted/30" />
            <div className="size-9 animate-pulse rounded-full bg-muted/45" />
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
