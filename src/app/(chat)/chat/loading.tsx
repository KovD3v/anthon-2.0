export default function ChatLoading() {
  const placeholders = [
    { id: "assistant-1", role: "assistant", lines: ["w-56", "w-44"] },
    { id: "user-1", role: "user", lines: ["w-48"] },
    { id: "assistant-2", role: "assistant", lines: ["w-64", "w-52", "w-36"] },
  ] as const;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-linear-to-b from-background to-muted/20">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-primary/5 via-background/0 to-background/0" />

      <header className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-white/10 bg-background/40 px-3 backdrop-blur-xl sm:h-14 sm:px-4">
        <div className="h-4 w-40 animate-pulse rounded bg-muted/40" />
        <div className="h-8 w-20 animate-pulse rounded-md bg-muted/35" />
      </header>

      <div className="relative flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-8">
          {placeholders.map((placeholder) => {
            const isUser = placeholder.role === "user";

            return (
              <div
                key={placeholder.id}
                className={`flex items-start gap-3 ${
                  isUser ? "flex-row-reverse" : "flex-row"
                }`}
              >
                <div
                  className={`h-8 w-8 shrink-0 animate-pulse rounded-full ${
                    isUser ? "bg-primary/25" : "bg-muted/45"
                  }`}
                />
                <div
                  className={`flex max-w-[85%] flex-col gap-2 ${
                    isUser ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`h-3 animate-pulse rounded bg-muted/40 ${
                      isUser ? "w-16" : "w-24"
                    }`}
                  />
                  <div
                    className={`space-y-2 rounded-2xl px-5 py-3.5 ${
                      isUser
                        ? "rounded-tr-sm bg-primary/20"
                        : "rounded-tl-sm border border-white/10 bg-background/60"
                    }`}
                  >
                    {placeholder.lines.map((width, index) => (
                      <div
                        key={`${placeholder.id}-${width}-${index}`}
                        className={`h-3 animate-pulse rounded bg-muted/45 ${width}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          <div className="flex items-start gap-3">
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted/45" />
            <div className="rounded-2xl rounded-tl-sm border border-white/10 bg-background/55 px-4 py-3">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/35 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/35 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/35" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-3xl px-3 pb-6 pt-2 safe-area-bottom sm:px-4 sm:pb-8">
        <div className="flex items-end gap-2 rounded-4xl border border-white/10 bg-background/60 p-2 shadow-lg backdrop-blur-xl ring-1 ring-black/5 dark:bg-muted/40 dark:ring-white/10">
          <div className="h-9 w-9 animate-pulse rounded-full bg-muted/35" />
          <div className="h-9 w-9 animate-pulse rounded-full bg-muted/30" />
          <div className="h-10 flex-1 animate-pulse rounded-2xl bg-muted/30" />
          <div className="h-9 w-9 animate-pulse rounded-full bg-muted/45" />
        </div>
      </div>
    </div>
  );
}
