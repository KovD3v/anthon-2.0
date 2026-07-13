"use client";

import {
  BarChart3,
  Brain,
  Building2,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Mic,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { SidebarBottom } from "../../(chat)/components/SidebarBottom";

const navItems = [
  { href: "/admin", label: "Panoramica", icon: LayoutDashboard },
  { href: "/admin/analytics", label: "Analisi", icon: BarChart3 },
  { href: "/admin/costs", label: "Costi", icon: Brain },
  { href: "/admin/users", label: "Utenti", icon: Users },
  {
    href: "/admin/organizations",
    label: "Organizzazioni",
    icon: Building2,
  },
  { href: "/admin/rag", label: "Documenti RAG", icon: FileText },
  { href: "/admin/voice", label: "Voce", icon: Mic },
  { href: "/admin/ai-traces", label: "Trace AI", icon: ShieldCheck },
  {
    href: "/admin/model-experiments",
    label: "Confronti modelli",
    icon: FlaskConical,
  },
];

function isActiveRoute(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname.startsWith(href);
}

function AdminNavigation({
  pathname,
  mobile = false,
}: {
  pathname: string;
  mobile?: boolean;
}) {
  const links = (
    <ul className="space-y-1">
      {navItems.map((item) => {
        const isActive = isActiveRoute(pathname, item.href);
        const link = (
          <Link
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-[background-color,color,box-shadow] duration-200",
              isActive
                ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );

        return (
          <li key={item.href}>
            {mobile ? <SheetClose asChild>{link}</SheetClose> : link}
          </li>
        );
      })}
      <li>
        {mobile ? (
          <SheetClose asChild>
            <Link
              href="/chat"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-white/5 hover:text-foreground"
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              <span>Torna alla chat</span>
            </Link>
          </SheetClose>
        ) : (
          <Link
            href="/chat"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-white/5 hover:text-foreground"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            <span>Torna alla chat</span>
          </Link>
        )}
      </li>
    </ul>
  );

  return (
    <nav aria-label="Navigazione amministrazione" className="flex-1 p-2">
      {links}
    </nav>
  );
}

function AdminBrand() {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-primary/20 to-primary/10 shadow-sm ring-1 ring-white/20">
        <Brain className="h-5 w-5 text-primary" aria-hidden="true" />
      </div>
      <div className="flex flex-col">
        <span className="font-semibold leading-none text-foreground/90">
          Anthon
        </span>
        <span className="text-[10px] font-medium text-muted-foreground">
          Console amministrazione
        </span>
      </div>
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const currentPage =
    navItems.find(
      (item) => item.href !== "/admin" && pathname.startsWith(item.href),
    ) ?? navItems[0];

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-muted/40 backdrop-blur-xl lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-white/10 bg-background/40 backdrop-blur-md px-4">
          <AdminBrand />
        </div>

        <div className="custom-scrollbar flex flex-1 overflow-y-auto">
          <AdminNavigation pathname={pathname} />
        </div>

        <SidebarBottom />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-background/90 px-4 backdrop-blur-xl lg:hidden">
          <div className="min-w-0">
            <span className="block text-[10px] font-medium text-muted-foreground">
              Amministrazione
            </span>
            <span className="block truncate text-sm font-semibold">
              {currentPage.label}
            </span>
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Apri navigazione amministrazione"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="left"
              closeLabel="Chiudi"
              className="w-[min(20rem,88vw)] gap-0 border-white/10 bg-background/95 p-0 backdrop-blur-xl"
            >
              <SheetHeader className="border-b border-white/10 pr-12">
                <SheetTitle>
                  <AdminBrand />
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Naviga tra le sezioni della console amministrativa.
                </SheetDescription>
              </SheetHeader>
              <div className="custom-scrollbar flex min-h-0 flex-1 overflow-y-auto">
                <AdminNavigation pathname={pathname} mobile />
              </div>
              <SidebarBottom />
            </SheetContent>
          </Sheet>
        </header>

        <main className="min-w-0 flex-1 overflow-auto bg-background/50 backdrop-blur-sm">
          <div className="min-h-full p-4 sm:p-5 lg:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
