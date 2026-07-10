import { Navbar } from "../(marketing)/components/Navbar";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#contenuto-principale"
        className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground transition-transform focus:translate-y-0"
      >
        Vai al contenuto principale
      </a>
      <Navbar />
      <main id="contenuto-principale" className="flex-1">
        {children}
      </main>
    </div>
  );
}
