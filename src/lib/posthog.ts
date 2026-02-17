/**
 * Server-side PostHog client for analytics tracking.
 * Use this in API routes and server components.
 */

import { PostHog } from "posthog-node";

// Singleton PostHog client for server-side usage
let posthogClient: PostHog | null = null;

export function getPostHogClient(): PostHog {
  if (!posthogClient) {
    const apiKey = process.env.POSTHOG_API_KEY;
    if (!apiKey) {
      throw new Error("POSTHOG_API_KEY is not set");
    }
    posthogClient = new PostHog(apiKey, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1, // Flush immediately for serverless
      flushInterval: 0,
    });
  }
  return posthogClient;
}
