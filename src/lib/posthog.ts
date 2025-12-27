/**
 * Server-side PostHog client for analytics tracking.
 * Use this in API routes and server components.
 */

import { PostHog } from "posthog-node";

// Singleton PostHog client for server-side usage
let posthogClient: PostHog | null = null;

export function getPostHogClient(): PostHog {
  if (!posthogClient) {
    posthogClient = new PostHog(process.env.POSTHOG_API_KEY!, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1, // Flush immediately for serverless
      flushInterval: 0,
    });
  }
  return posthogClient;
}

/**
 * Capture an event with user context.
 * Use this for server-side event tracking.
 */
export function captureEvent(
  userId: string,
  event: string,
  properties?: Record<string, unknown>,
) {
  const client = getPostHogClient();
  client.capture({
    distinctId: userId,
    event,
    properties,
  });
}

/**
 * Identify a user with their properties.
 * Call this when user signs up or updates their profile.
 */
export function identifyUser(
  userId: string,
  properties?: Record<string, unknown>,
) {
  const client = getPostHogClient();
  client.identify({
    distinctId: userId,
    properties,
  });
}

/**
 * Shutdown helper for graceful cleanup.
 * Call this before the process exits if needed.
 */
export async function shutdownPostHog() {
  if (posthogClient) {
    await posthogClient.shutdown();
    posthogClient = null;
  }
}
