"use client";

import {
  BarChart3,
  Brain,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Mic,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SidebarBottom } from "../../(chat)/components/SidebarBottom";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/costs", label: "Costs", icon: Brain },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/rag", label: "RAG Documents", icon: FileText },
  { href: "/admin/voice", label: "Voice", icon: Mic },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-white/10 bg-muted/40 backdrop-blur-xl">
        {/* Header */}
        <div className="flex h-14 items-center gap-2 border-b border-white/10 bg-background/40 backdrop-blur-md px-4">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-primary/20 to-primary/10 shadow-sm ring-1 ring-white/20">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-foreground/90 leading-none">
              Anthon
            </span>
            <span className="text-[10px] font-medium text-muted-foreground">
              Admin Console
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 overflow-y-auto custom-scrollbar">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(item.href);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20"
                        : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
            {/* Back to Chat Link inserted into Nav */}
            <li>
              <Link
                href="/chat"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-white/5 hover:text-foreground transition-all duration-200"
              >
                <MessageSquare className="h-4 w-4" />
                <span>Back to Chat</span>
              </Link>
            </li>
          </ul>
        </nav>

        {/* Footer */}
        <SidebarBottom />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-background/50 backdrop-blur-sm">
        <div className="container mx-auto max-w-7xl p-8">{children}</div>
      </main>
    </div>
  );
}
