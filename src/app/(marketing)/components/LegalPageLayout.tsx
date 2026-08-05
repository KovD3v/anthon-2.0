import { ArrowLeft, FileText, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Footer } from "./Footer";

export type LegalPageSection = {
  id: string;
  label: string;
};

type LegalPageLayoutProps = {
  kind: "terms" | "privacy";
  eyebrow: string;
  title: string;
  description: string;
  updatedAt: string;
  sections: LegalPageSection[];
  children: React.ReactNode;
};

export function LegalPageLayout({
  kind,
  eyebrow,
  title,
  description,
  updatedAt,
  sections,
  children,
}: LegalPageLayoutProps) {
  const Icon = kind === "privacy" ? ShieldCheck : FileText;

  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden border-b border-border/80">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-32 -top-40 h-[34rem] w-[34rem] rounded-full bg-brand-yellow/10 blur-[110px]" />
          <div className="absolute -bottom-48 left-[20%] h-96 w-96 rounded-full bg-primary/5 blur-[100px]" />
        </div>

        <div className="container relative mx-auto px-4 pb-14 pt-10 md:px-6 md:pb-20 md:pt-14">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-background/70 px-4 text-sm font-semibold text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Torna alla home
          </Link>

          <div className="mt-12 grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="max-w-4xl">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-yellow text-[#171714]">
                  <Icon className="h-5 w-5" />
                </span>
                <p className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-primary">
                  {eyebrow}
                </p>
              </div>
              <h1 className="font-display max-w-4xl text-5xl font-extrabold uppercase leading-[0.9] tracking-[-0.03em] text-foreground sm:text-7xl">
                {title}
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                {description}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-sm backdrop-blur-sm">
              <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Documento
              </p>
              <p className="mt-3 text-lg font-semibold text-foreground">
                Ultimo aggiornamento
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{updatedAt}</p>
              <div className="mt-5 border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground">
                Leggilo con calma. Se qualcosa non è chiaro, scrivici prima di
                usare il servizio.
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto grid max-w-7xl gap-12 px-4 py-12 md:px-6 md:py-16 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16">
        <aside className="lg:sticky lg:top-28 lg:h-fit">
          <div className="rounded-2xl border border-border bg-card/60 p-4">
            <p className="px-2 pb-3 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              In questa pagina
            </p>
            <nav aria-label="Indice del documento">
              <ol className="space-y-1">
                {sections.map((section, index) => (
                  <li key={section.id}>
                    <Link
                      href={`#${section.id}`}
                      className="group flex items-start gap-3 rounded-lg px-2 py-2 text-sm leading-snug text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <span className="font-mono text-xs text-primary/70 transition-colors group-hover:text-primary">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>{section.label}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </aside>

        <article className="min-w-0 max-w-3xl">
          <div className="space-y-14">{children}</div>

          <div className="mt-16 border-t border-border pt-8">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Hai bisogno di chiarimenti su questo documento? Contattaci a{" "}
              <a
                href="mailto:anthon.chat@gmail.com"
                className="font-semibold text-foreground underline decoration-brand-yellow underline-offset-4"
              >
                anthon.chat@gmail.com
              </a>
              .
            </p>
          </div>
        </article>
      </div>

      <Footer />
    </div>
  );
}

export function LegalSection({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-32">
      <div className="mb-5 flex items-start gap-4">
        <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-yellow/15 font-mono text-xs font-semibold text-primary">
          {number}
        </span>
        <h2 className="font-display text-3xl font-bold uppercase leading-none tracking-tight text-foreground sm:text-4xl">
          {title}
        </h2>
      </div>
      <div className="space-y-4 text-[1.02rem] leading-8 text-muted-foreground [&_a]:font-semibold [&_a]:text-foreground [&_a]:underline [&_a]:decoration-brand-yellow [&_a]:underline-offset-4 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
        {children}
      </div>
    </section>
  );
}
