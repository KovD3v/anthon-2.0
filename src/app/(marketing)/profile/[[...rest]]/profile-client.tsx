"use client";

import { AccountConsole } from "../components/AccountConsole";

export function ProfileClient() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-5xl px-3 py-7 sm:px-6 sm:py-14">
        <AccountConsole />
      </main>
    </div>
  );
}
