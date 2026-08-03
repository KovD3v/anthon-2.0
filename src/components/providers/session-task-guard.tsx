"use client";

import { RedirectToTasks } from "@clerk/nextjs";
import { usePathname } from "next/navigation";

const EXCLUDED_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/sso-callback",
  "/auth-continue",
  "/session-tasks",
];

export function SessionTaskGuard() {
  const pathname = usePathname();
  if (EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }
  return <RedirectToTasks />;
}
