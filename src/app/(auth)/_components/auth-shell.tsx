import { ArrowLeft, Brain } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh overflow-x-hidden bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(440px,0.95fr)]">
      <section className="relative hidden overflow-hidden border-r border-border bg-foreground text-background lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <Link
          href="/"
          className="relative z-10 inline-flex w-fit items-center gap-2 text-lg font-semibold tracking-tight transition-opacity hover:opacity-75"
        >
          <Brain className="size-6 text-brand-yellow" aria-hidden="true" />
          Anthon
        </Link>

        <div className="relative z-10 max-w-[40rem] space-y-7">
          <div className="h-1 w-16 bg-brand-yellow" aria-hidden="true" />
          <h2 className="max-w-[10ch] text-balance font-display text-[clamp(3.5rem,6.5vw,6rem)] font-extrabold leading-[0.86] tracking-[-0.035em]">
            LA TESTA GIUSTA, QUANDO CONTA.
          </h2>
          <p className="max-w-[34rem] text-pretty text-lg leading-relaxed text-background/72">
            Allenamento mentale concreto per i momenti che pesano.
          </p>
        </div>

        <p className="relative z-10 text-sm text-background/55">
          Il tuo lavoro resta privato. Il percorso resta tuo.
        </p>
      </section>

      <section className="flex min-h-dvh flex-col px-5 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8 lg:justify-center lg:px-12 lg:py-12 xl:px-20">
        <div className="mx-auto w-full max-w-[440px]">
          <div className="mb-10 flex items-center justify-between lg:hidden">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight"
            >
              <Brain className="size-6 text-primary" aria-hidden="true" />
              Anthon
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Home
            </Link>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

export function AuthFormPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card px-5 py-7 sm:px-8 sm:py-9",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AuthHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="mb-7 space-y-2">
      <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-primary">
        Accesso ad Anthon
      </p>
      <h1 className="text-balance font-display text-4xl font-extrabold leading-none tracking-[-0.025em] sm:text-5xl">
        {title}
      </h1>
      <p className="max-w-[42ch] text-pretty leading-relaxed text-muted-foreground">
        {description}
      </p>
    </header>
  );
}

export function AuthStepTransition({ children }: { children: ReactNode }) {
  return <div className="auth-step">{children}</div>;
}

export const clerkTaskAppearance = {
  variables: {
    colorPrimary: "var(--primary)",
    colorBackground: "var(--card)",
    colorForeground: "var(--card-foreground)",
    colorMutedForeground: "var(--muted-foreground)",
    colorInput: "var(--input)",
    borderRadius: "0.625rem",
    fontFamily: "var(--font-barlow)",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none",
    card: "w-full border-0 bg-transparent p-0 shadow-none",
    footer: "hidden",
  },
} as const;
