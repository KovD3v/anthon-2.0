"use client";

import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
  useUser,
} from "@clerk/nextjs";
import { AnimatePresence, m } from "framer-motion";
import {
  Brain,
  Building2,
  ChevronRight,
  LayoutDashboard,
  LogIn,
  Menu,
  MessageSquare,
  Moon,
  Settings,
  Sparkles,
  Sun,
  Tag,
  Target,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { duration, ease } from "@/lib/motion";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const { user } = useUser();
  const isOrgMember = (user?.organizationMemberships?.length ?? 0) > 0;
  const mounted = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <header className="sticky top-0 z-50 w-full pt-[env(safe-area-inset-top)]">
      <div className="mx-2 mt-2 rounded-2xl border border-border bg-background/90 shadow-sm backdrop-blur-xl md:mx-4 md:mt-4">
        <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl">
            <Link href="/" className="flex items-center gap-2">
              <Brain className="h-6 w-6 text-primary" />
              <span>Anthon</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav
            aria-label="Navigazione principale"
            className="hidden items-center gap-6 text-sm font-medium md:flex"
          >
            <Link
              href="/#features"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Risultati
            </Link>
            <Link
              href="/#how-it-works"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Come funziona
            </Link>
            <Link
              href="/#metodo"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Metodo
            </Link>
            <SignedIn>
              <Link
                href="/chat"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Chat
              </Link>
              <Link
                href="/profile"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Profilo
              </Link>
              <Link
                href="/channels"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Canali
              </Link>
              {isOrgMember && (
                <Link
                  href="/organization"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  Organizzazione
                </Link>
              )}
            </SignedIn>
            <Link
              href="/pricing"
              aria-current={pathname === "/pricing" ? "page" : undefined}
              className={cn(
                "relative py-2 text-muted-foreground transition-colors hover:text-foreground",
                pathname === "/pricing" &&
                  "text-foreground after:absolute after:inset-x-0 after:-bottom-1 after:h-0.5 after:bg-primary",
              )}
            >
              Prezzi
            </Link>
          </nav>

          {/* Auth Buttons (Desktop) */}
          <div className="hidden md:flex items-center gap-4">
            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-9 w-9"
              aria-label={
                mounted
                  ? `Attiva il tema ${theme === "dark" ? "chiaro" : "scuro"}`
                  : "Cambia tema"
              }
              title={
                mounted
                  ? `Attiva il tema ${theme === "dark" ? "chiaro" : "scuro"}`
                  : "Cambia tema"
              }
            >
              {!mounted ? (
                <Sun className="h-4 w-4 opacity-0" />
              ) : theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
            <SignedOut>
              <SignInButton mode="modal">
                <Button variant="ghost">Accedi</Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button>Inizia gratis</Button>
              </SignUpButton>
            </SignedOut>
            <SignedIn>
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "h-10 w-10",
                  },
                }}
              />
            </SignedIn>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-accent md:hidden"
            onClick={toggleMenu}
            aria-label={isMenuOpen ? "Chiudi menu" : "Apri menu"}
            aria-expanded={isMenuOpen}
            aria-controls="menu-mobile"
          >
            <AnimatePresence mode="wait">
              {isMenuOpen ? (
                <m.div
                  key="close"
                  initial={{ opacity: 0, rotate: -90 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={{ opacity: 0, rotate: 90 }}
                  transition={{ duration: duration.fast, ease: ease.inOut }}
                >
                  <X className="h-6 w-6" />
                </m.div>
              ) : (
                <m.div
                  key="menu"
                  initial={{ opacity: 0, rotate: 90 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={{ opacity: 0, rotate: -90 }}
                  transition={{ duration: duration.fast, ease: ease.inOut }}
                >
                  <Menu className="h-6 w-6" />
                </m.div>
              )}
            </AnimatePresence>
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isMenuOpen && (
            <m.div
              id="menu-mobile"
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{
                opacity: 1,
                height: "auto",
                marginTop: 8,
              }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: duration.base, ease: ease.inOut }}
              className="overflow-hidden border-t border-border md:hidden"
            >
              <div className="space-y-6 rounded-b-2xl bg-background/95 p-4 backdrop-blur-3xl">
                <nav
                  aria-label="Navigazione mobile"
                  className="flex flex-col space-y-1"
                >
                  <MobileNavLink
                    href="/#features"
                    icon={<Target className="h-4 w-4" />}
                    label="Risultati"
                    onClick={() => setIsMenuOpen(false)}
                  />
                  <MobileNavLink
                    href="/#how-it-works"
                    icon={<Sparkles className="h-4 w-4" />}
                    label="Come funziona"
                    onClick={() => setIsMenuOpen(false)}
                  />
                  <SignedIn>
                    <MobileNavLink
                      href="/profile"
                      icon={<User className="h-4 w-4" />}
                      label="Profilo"
                      onClick={() => setIsMenuOpen(false)}
                    />
                    <MobileNavLink
                      href="/channels"
                      icon={<LayoutDashboard className="h-4 w-4" />}
                      label="Canali"
                      onClick={() => setIsMenuOpen(false)}
                    />
                    {isOrgMember && (
                      <MobileNavLink
                        href="/organization"
                        icon={<Building2 className="h-4 w-4" />}
                        label="Organizzazione"
                        onClick={() => setIsMenuOpen(false)}
                      />
                    )}
                  </SignedIn>
                  <MobileNavLink
                    href="/chat"
                    icon={<MessageSquare className="h-4 w-4" />}
                    label="Chat"
                    onClick={() => setIsMenuOpen(false)}
                  />
                  <MobileNavLink
                    href="/pricing"
                    icon={<Tag className="h-4 w-4" />}
                    label="Prezzi"
                    onClick={() => setIsMenuOpen(false)}
                  />
                </nav>

                <div className="space-y-3 pt-4 border-t border-white/5">
                  {/* Mobile Theme Toggle */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      toggleTheme();
                    }}
                    className="justify-between gap-2 w-full h-11 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5"
                  >
                    <div className="flex items-center gap-3">
                      {theme === "dark" ? (
                        <>
                          <Sun className="h-4 w-4 text-orange-400" />
                          <span className="text-sm font-medium">
                            Tema Chiaro
                          </span>
                        </>
                      ) : (
                        <>
                          <Moon className="h-4 w-4 text-blue-400" />
                          <span className="text-sm font-medium">
                            Tema Scuro
                          </span>
                        </>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                  </Button>

                  <SignedOut>
                    <div className="grid grid-cols-2 gap-2">
                      <SignInButton mode="modal">
                        <Button
                          variant="ghost"
                          className="justify-center gap-2 h-11 rounded-xl bg-white/5 border border-white/5"
                        >
                          <LogIn className="h-4 w-4" />
                          Accedi
                        </Button>
                      </SignInButton>
                      <SignUpButton mode="modal">
                        <Button className="justify-center gap-2 h-11 rounded-xl shadow-lg shadow-primary/20">
                          <Sparkles className="h-4 w-4" />
                          Inizia ora
                        </Button>
                      </SignUpButton>
                    </div>
                  </SignedOut>

                  <SignedIn>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                      <div className="flex items-center gap-2">
                        <UserButton />
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold">Profilo</span>
                          <span className="text-xs text-muted-foreground">
                            Gestisci account
                          </span>
                        </div>
                      </div>
                      <Settings className="h-4 w-4 text-muted-foreground/50" />
                    </div>
                  </SignedIn>
                </div>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}

function MobileNavLink({
  href,
  icon,
  label,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 hover:bg-white/5 active:scale-[0.98] group"
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
          {icon}
        </div>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
    </Link>
  );
}
