export const PERSONAL_PLAN_LABELS = ["Basic", "Basic Plus", "Pro"] as const;

export function PricingSkeleton() {
  return (
    <output
      className="absolute inset-x-0 top-0 grid gap-4 md:grid-cols-3"
      aria-label="Caricamento dei piani"
      aria-live="polite"
    >
      {PERSONAL_PLAN_LABELS.map((label) => (
        <div
          key={label}
          className="min-h-[25rem] animate-pulse rounded-2xl border border-border bg-card p-6"
        >
          <div className="h-3 w-20 rounded-full bg-muted" />
          <span className="sr-only">{label}</span>
          <div className="mt-5 h-9 w-28 rounded bg-muted" />
          <div className="mt-3 h-4 w-40 rounded bg-muted" />
          <div className="mt-8 h-px bg-border" />
          <div className="mt-8 space-y-4">
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-4 w-4/5 rounded bg-muted" />
            <div className="h-4 w-3/4 rounded bg-muted" />
          </div>
          <div className="mt-24 h-11 rounded-xl bg-muted" />
        </div>
      ))}
      <span className="sr-only">Caricamento…</span>
    </output>
  );
}
