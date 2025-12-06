"use client";

import {
  BarChart3,
  Brain,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/rag", label: "RAG Documents", icon: FileText },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r bg-muted/30">
        <div className="flex h-14 items-center gap-2 border-b px-6">
          <Brain className="h-6 w-6 text-primary" />
          <div>
            <span className="font-bold">Anthon</span>
            <span className="ml-2 text-xs font-medium text-muted-foreground">
              Admin
            </span>
          </div>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
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
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t p-4">
          <Button
            asChild
            variant="outline"
            className="w-full gap-2 justify-start"
          >
            <Link href="/chat">
              <MessageSquare className="h-4 w-4" />
              Back to Chat
            </Link>
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-background">
        <div className="container mx-auto max-w-7xl p-8">{children}</div>
      </main>
    </div>
  );
}
