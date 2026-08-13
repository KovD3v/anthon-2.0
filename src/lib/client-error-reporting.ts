"use client";

import { initializePosthog } from "@/lib/posthog-client";

type ClientErrorContext = Record<
  string,
  boolean | number | string | null | undefined
>;

function normalizeClientError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  return new Error("Unknown client error");
}

export function reportClientError(
  error: unknown,
  context?: ClientErrorContext,
): void {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;

  void initializePosthog()
    .then((posthog) => {
      posthog.captureException(normalizeClientError(error), context);
    })
    .catch(() => {
      // Error reporting must never affect the user interaction that failed.
    });
}
