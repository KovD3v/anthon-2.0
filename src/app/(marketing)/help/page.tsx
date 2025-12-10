"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  Brain,
  Command,
  Keyboard,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HelpPage() {
  const features = [
    {
      icon: Brain,
      title: "AI Mental Coach",
      description:
        "Anthon is your personal mental coach powered by advanced AI. It helps you navigate challenges, improve productivity, and maintain mental clarity.",
    },
    {
      icon: Zap,
      title: "Real-time Feedback",
      description:
        "Get instant feedback on your thoughts and ideas. Provide thumbs up/down to help Anthon learn and serve you better.",
    },
    {
      icon: Search,
      title: "Smart Search",
      description:
        "Instantly find any past conversation or specific message with our powerful semantic search engine.",
    },
    {
      icon: Sparkles,
      title: "Markdown Export",
      description:
        "Export your meaningful conversations to Markdown for safekeeping or sharing with others.",
    },
  ];

  const shortcuts = [
    {
      keys: ["Ctrl", "N"],
      description: "Start a new chat immediately",
    },
    {
      keys: ["Ctrl", "K"],
      description: "Open message search",
    },
    {
      keys: ["Ctrl", "/"],
      description: "Toggle the sidebar",
    },
    {
      keys: ["Esc"],
      description: "Close search or active modals",
    },
  ];

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] overflow-hidden bg-background">
      {/* Background Decor */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] h-[600px] w-[600px] rounded-full bg-primary/5 blur-[100px]" />
        <div className="absolute top-[40%] right-[10%] h-[500px] w-[500px] rounded-full bg-blue-500/5 blur-[100px]" />
      </div>

      <div className="container relative mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl mb-6">
              How to use <span className="text-primary">Anthon</span>
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              Discover hidden features and master your workflow with keyboard
              shortcuts. Anthon is designed to be fast, intuitive, and powerful.
            </p>
          </motion.div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-24">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-8 hover:bg-white/10 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <feature.icon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Shortcuts Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="rounded-3xl border border-white/10 bg-background/50 backdrop-blur-xl p-8 sm:p-12 mb-20"
        >
          <div className="flex items-center gap-3 mb-8">
            <Keyboard className="h-8 w-8 text-primary" />
            <h2 className="text-2xl font-bold text-foreground">
              Keyboard Shortcuts
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {shortcuts.map((shortcut) => (
              <div
                key={shortcut.description}
                className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5"
              >
                <span className="text-foreground/80 font-medium">
                  {shortcut.description}
                </span>
                <div className="flex items-center gap-1.5">
                  {shortcut.keys.map((key) => (
                    <kbd
                      key={key}
                      className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-white/10 bg-black/20 px-2 text-sm font-semibold text-muted-foreground shadow-sm"
                    >
                      {key === "Cmd" ? (
                        <Command className="h-4 w-4" />
                      ) : key === "Ctrl" ? (
                        <span className="text-xs">Ctrl</span>
                      ) : (
                        key
                      )}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <div className="text-center">
          <Link href="/chat">
            <Button
              size="lg"
              className="h-12 px-8 text-base gap-2 rounded-full"
            >
              Start chatting now
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
