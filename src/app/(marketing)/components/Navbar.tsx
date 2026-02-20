"use client";

import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
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
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();
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
      <div className="mx-2 mt-2 md:mx-4 md:mt-4 rounded-2xl border border-white/10 bg-background/60 backdrop-blur-xl shadow-xs">
        <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl">
            <Link href="/" className="flex items-center gap-2">
              <Brain className="h-6 w-6 text-primary" />
              <span>Anthon</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <SignedIn>
              <Link
                href="/chat"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Chat
              </Link>
              <Link
                href="/profile"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Profilo
              </Link>
              <Link
                href="/channels"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Canali
              </Link>
              <Link
                href="/organization"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Organizzazione
              </Link>
            </SignedIn>
            <Link
              href="/pricing"
              className="text-muted-foreground hover:text-primary transition-colors"
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
              title={
                mounted
                  ? `Switch to ${theme === "dark" ? "light" : "dark"} mode`
                  : "Toggle theme"
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
          <button type="button" className="md:hidden p-2" onClick={toggleMenu}>
            <AnimatePresence mode="wait">
              {isMenuOpen ? (
                <m.div
                  key="close"
                  initial={{ opacity: 0, rotate: -90 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={{ opacity: 0, rotate: 90 }}
                  transition={{ duration: 0.2 }}
                >
                  <X className="h-6 w-6" />
                </m.div>
              ) : (
                <m.div
                  key="menu"
                  initial={{ opacity: 0, rotate: 90 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={{ opacity: 0, rotate: -90 }}
                  transition={{ duration: 0.2 }}
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
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{
                opacity: 1,
                height: "auto",
                marginTop: 8,
              }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="md:hidden overflow-hidden border-t border-white/10"
            >
              <div className="p-4 space-y-6 bg-background/40 backdrop-blur-3xl rounded-b-2xl">
                <nav className="flex flex-col space-y-1">
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
                    <MobileNavLink
                      href="/organization"
                      icon={<Building2 className="h-4 w-4" />}
                      label="Organizzazione"
                      onClick={() => setIsMenuOpen(false)}
                    />
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
                    <div className="grid grid-cols-2 gap-3">
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
                      <div className="flex items-center gap-3">
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
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
          {icon}
        </div>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
    </Link>
  );
}
