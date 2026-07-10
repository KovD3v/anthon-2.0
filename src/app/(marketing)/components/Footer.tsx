import { ArrowUpRight, Brain, Mail } from "lucide-react";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t bg-background py-12 md:py-16">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.3fr_0.8fr_0.8fr]">
          <div className="max-w-sm space-y-4">
            <div className="flex items-center gap-2 font-bold text-xl">
              <Brain className="h-6 w-6 text-brand-yellow" />
              <span>Anthon</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Il tuo mental coach personale basato sull'IA. Aiuta gli atleti a
              dare il massimo attraverso la resilienza mentale e la
              concentrazione.
            </p>
            <a
              href="mailto:anthon.chat@gmail.com"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold transition-colors hover:border-foreground/30 hover:bg-accent"
            >
              <Mail className="h-4 w-4" />
              anthon.chat@gmail.com
            </a>
          </div>

          <div>
            <h3 className="font-display mb-4 text-lg font-bold uppercase tracking-wide">
              Prodotto
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/#features"
                  className="text-muted-foreground hover:text-foreground"
                >
                  Funzionalità
                </Link>
              </li>
              <li>
                <Link
                  href="/#how-it-works"
                  className="text-muted-foreground hover:text-foreground"
                >
                  Come funziona
                </Link>
              </li>
              <li>
                <Link
                  href="/#metodo"
                  className="text-muted-foreground hover:text-foreground"
                >
                  Metodo
                </Link>
              </li>
              <li>
                <Link
                  href="/pricing"
                  className="text-muted-foreground hover:text-foreground"
                >
                  Prezzi
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-display mb-4 text-lg font-bold uppercase tracking-wide">
              Supporto
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/help"
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                  Centro assistenza <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </li>
              <li>
                <Link
                  href="/channels"
                  className="text-muted-foreground hover:text-foreground"
                >
                  Collega i canali
                </Link>
              </li>
              <li>
                <Link
                  href="/sign-up"
                  className="text-muted-foreground hover:text-foreground"
                >
                  Crea un account
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t pt-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} Anthon AI. Tutti i diritti
            riservati.
          </p>
          <p>Costruito per la performance, progettato in Italia.</p>
        </div>
      </div>
    </footer>
  );
}
