"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import {
  BarChart3,
  Building2,
  ChevronUp,
  CreditCard,
  HelpCircle,
  Home,
  LogOut,
  MessageSquare,
  Moon,
  Radio,
  Settings,
  Sun,
  User,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { duration, ease } from "@/lib/motion";

export function SidebarBottom() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const handleAction = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  const isOrgMember = (user?.organizationMemberships?.length ?? 0) > 0;

  const menuItems = [
    {
      icon: MessageSquare,
      label: "Chat",
      onClick: () => router.push("/chat"),
    },
    {
      icon: Settings,
      label: "Profilo e impostazioni",
      onClick: () => router.push("/profile"),
    },
    {
      icon: Radio,
      label: "Canali",
      onClick: () => router.push("/channels"),
    },
    {
      icon: BarChart3,
      label: "Utilizzo",
      onClick: () => router.push("/chat/usage"),
    },
    {
      icon: CreditCard,
      label: "Prezzi",
      onClick: () => router.push("/pricing"),
    },
    ...(isOrgMember
      ? [
          {
            icon: Building2,
            label: "Organizzazione",
            onClick: () => router.push("/organization"),
          },
        ]
      : []),
    {
      icon: HelpCircle,
      label: "Assistenza",
      onClick: () => router.push("/help"),
    },
    {
      icon: Home,
      label: "Home",
      onClick: () => router.push("/"),
    },
    {
      icon: theme === "dark" ? Sun : Moon,
      label: theme === "dark" ? "Tema chiaro" : "Tema scuro",
      onClick: () => setTheme(theme === "dark" ? "light" : "dark"),
    },
  ];

  return (
    <div className="relative mt-auto" ref={menuRef}>
      <AnimatePresence>
        {isOpen && (
          <m.div
            initial={{
              opacity: 0,
              transform: shouldReduceMotion
                ? "translateY(0) scale(1)"
                : "translateY(10px) scale(0.95)",
            }}
            animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
            exit={{
              opacity: 0,
              transform: shouldReduceMotion
                ? "translateY(0) scale(1)"
                : "translateY(10px) scale(0.95)",
            }}
            transition={{
              duration: duration.fast,
              ease: ease.out,
            }}
            id="account-navigation-menu"
            role="menu"
            aria-label="Navigazione account"
            className="absolute right-2 bottom-full left-2 z-50 mb-2 origin-bottom overflow-hidden rounded-xl border border-border/80 bg-popover text-popover-foreground dark:border-white/15"
          >
            <div className="flex flex-col p-1.5">
              {menuItems.map((item) => (
                <button
                  type="button"
                  key={item.label}
                  onClick={() => handleAction(item.onClick)}
                  role="menuitem"
                  className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground/80 outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-accent/80 motion-reduce:transition-none"
                >
                  <item.icon className="size-[1.125rem] shrink-0" />
                  {item.label}
                </button>
              ))}
              <div className="mx-2 my-1 h-px bg-border/70" />
              <button
                type="button"
                onClick={() =>
                  handleAction(() => signOut({ redirectUrl: "/" }))
                }
                role="menuitem"
                className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-destructive outline-none transition-colors hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-inset active:bg-destructive/20 motion-reduce:transition-none"
              >
                <LogOut className="size-[1.125rem] shrink-0" />
                Esci
              </button>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <div className="border-t border-border/50 bg-background/80 px-3 py-2 backdrop-blur-md dark:border-white/10 dark:bg-background/40">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-controls="account-navigation-menu"
          aria-label={isOpen ? "Chiudi menu account" : "Apri menu account"}
          className={`group flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left outline-none transition-[background-color,transform] hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:scale-[0.98] motion-reduce:transition-[background-color] motion-reduce:active:scale-100 ${
            isOpen ? "bg-accent" : "bg-transparent"
          }`}
        >
          <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-primary/10 ring-1 ring-border/80 transition-[--tw-ring-color] group-hover:ring-primary/30 dark:ring-white/15">
            {user?.imageUrl ? (
              <Image
                src={user.imageUrl}
                alt={user.fullName || "Utente"}
                fill
                sizes="40px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-primary">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col items-start">
            <span className="w-full truncate text-sm font-semibold leading-5 text-foreground">
              {user?.fullName || "Utente"}
            </span>
            <span className="w-full truncate text-xs leading-4 text-muted-foreground">
              {user?.emailAddresses?.[0]?.emailAddress ||
                "Email non disponibile"}
            </span>
          </div>

          <ChevronUp
            className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>
    </div>
  );
}
