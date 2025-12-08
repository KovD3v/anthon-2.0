"use client";

import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { Brain, Menu, Moon, Sun, X } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-background/60 backdrop-blur-xl shadow-xs">
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
          {isMenuOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <Menu className="h-6 w-6" />
          )}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="md:hidden border-t bg-background p-4 space-y-4">
          <nav className="flex flex-col space-y-4">
            <SignedIn>
              <Link
                href="/chat"
                className="text-sm font-medium text-muted-foreground hover:text-primary"
                onClick={() => setIsMenuOpen(false)}
              >
                Chat
              </Link>
              <Link
                href="/profile"
                className="text-sm font-medium text-muted-foreground hover:text-primary"
                onClick={() => setIsMenuOpen(false)}
              >
                Profilo
              </Link>
            </SignedIn>
            <Link
              href="/pricing"
              className="text-sm font-medium text-muted-foreground hover:text-primary"
              onClick={() => setIsMenuOpen(false)}
            >
              Prezzi
            </Link>
          </nav>
          <div className="flex flex-col gap-2 pt-4 border-t">
            {/* Mobile Theme Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                toggleTheme();
                setIsMenuOpen(false);
              }}
              className="justify-start gap-2 w-full"
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? (
                <>
                  <Sun className="h-4 w-4" />
                  Light Mode
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4" />
                  Dark Mode
                </>
              )}
            </Button>
            <SignedOut>
              <SignInButton mode="modal">
                <Button variant="ghost" className="w-full justify-start">
                  Accedi
                </Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button className="w-full">Inizia gratis</Button>
              </SignUpButton>
            </SignedOut>
            <SignedIn>
              <div className="flex items-center gap-2 py-2">
                <UserButton />
                <span className="text-sm font-medium">Il tuo profilo</span>
              </div>
            </SignedIn>
          </div>
        </div>
      )}
    </header>
  );
}
