"use client";

type PostHogClient = typeof import("posthog-js").default;

let posthogPromise: Promise<PostHogClient> | null = null;
let posthogInitializationPromise: Promise<PostHogClient> | null = null;

export function loadPosthog(): Promise<PostHogClient> {
  if (posthogPromise) return posthogPromise;

  posthogPromise = import("posthog-js")
    .then(({ default: posthog }) => posthog)
    .catch((error: unknown) => {
      posthogPromise = null;
      throw error;
    });

  return posthogPromise;
}

export function initializePosthog(): Promise<PostHogClient> {
  if (posthogInitializationPromise) return posthogInitializationPromise;

  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  posthogInitializationPromise = loadPosthog()
    .then((posthog) => {
      if (posthogKey && !posthog.__loaded) {
        posthog.init(posthogKey, {
          api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
          capture_exceptions: true,
          defaults: "2025-11-30",
        });
      }

      return posthog;
    })
    .catch((error: unknown) => {
      posthogInitializationPromise = null;
      throw error;
    });

  return posthogInitializationPromise;
}

export function schedulePosthogLoad(
  onLoad: (posthog: PostHogClient) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  let cancelled = false;
  const start = () => {
    if (cancelled) return;

    void initializePosthog()
      .then((posthog) => {
        if (!cancelled) onLoad(posthog);
      })
      .catch(() => {
        // Analytics must never affect the application when its client fails to load.
      });
  };
  const idleWindow = window as Window & {
    cancelIdleCallback?: (id: number) => void;
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout: number },
    ) => number;
  };

  if (typeof idleWindow.requestIdleCallback === "function") {
    const idleId = idleWindow.requestIdleCallback(start, { timeout: 2000 });
    return () => {
      cancelled = true;
      idleWindow.cancelIdleCallback?.(idleId);
    };
  }

  const timeoutId = window.setTimeout(start, 1000);
  return () => {
    cancelled = true;
    window.clearTimeout(timeoutId);
  };
}
