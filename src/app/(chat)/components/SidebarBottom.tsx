"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Building2,
  ChevronUp,
  HelpCircle,
  Home,
  LogOut,
  Moon,
  Settings,
  Sun,
  User,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

export function SidebarBottom() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAction = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  const menuItems = [
    {
      icon: Settings,
      label: "Settings",
      onClick: () => router.push("/profile"),
    },
    {
      icon: User,
      label: "Profile",
      onClick: () => router.push("/profile"),
    },
    {
      icon: Building2,
      label: "Organization",
      onClick: () => router.push("/organization"),
    },
    {
      icon: BarChart3,
      label: "Utilizzo",
      onClick: () => router.push("/chat/usage"),
    },
    {
      icon: HelpCircle,
      label: "Help & Support",
      onClick: () => router.push("/help"),
    },
    {
      icon: Home,
      label: "Back to Home",
      onClick: () => router.push("/"),
    },
    {
      icon: theme === "dark" ? Sun : Moon,
      label: theme === "dark" ? "Light Mode" : "Dark Mode",
      onClick: () => setTheme(theme === "dark" ? "light" : "dark"),
    },
  ];

  return (
    <div className="relative mt-auto" ref={menuRef}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute bottom-full left-0 mb-2 w-[calc(100%-16px)] mx-2 overflow-hidden rounded-xl border border-border dark:border-white/20 bg-background/95 dark:bg-black/60 backdrop-blur-xl shadow-xl ring-1 ring-black/5 dark:ring-white/10"
          >
            <div className="flex flex-col p-1">
              {menuItems.map((item) => (
                <button
                  type="button"
                  key={item.label}
                  onClick={() => handleAction(item.onClick)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-primary/10 hover:text-primary active:bg-primary/20"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              ))}
              <div className="my-1 h-px bg-border/50" />
              <button
                type="button"
                onClick={() =>
                  handleAction(() => signOut({ redirectUrl: "/" }))
                }
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive active:bg-destructive/20"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="border-t border-border/50 dark:border-white/10 bg-background/80 dark:bg-background/40 backdrop-blur-md p-3">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="group flex w-full items-center gap-3 rounded-xl bg-background/50 p-2.5 transition-all hover:bg-background/80 hover:shadow-sm active:scale-[0.98]"
        >
          <div className="relative h-9 w-9 overflow-hidden rounded-full bg-linear-to-br from-primary/20 to-primary/10 ring-2 ring-border dark:ring-white/20 transition-all group-hover:ring-primary/20">
            {user?.imageUrl ? (
              <Image
                src={user.imageUrl}
                alt={user.fullName || "User"}
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-primary">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col items-start overflow-hidden">
            <span className="truncate text-sm font-semibold text-foreground/90">
              {user?.fullName || "User"}
            </span>
            <span className="truncate text-xs text-muted-foreground/80">
              {user?.emailAddresses?.[0]?.emailAddress || "user@example.com"}
            </span>
          </div>

          <ChevronUp
            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>
    </div>
  );
}
