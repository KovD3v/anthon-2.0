"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect } from "react";
import { schedulePosthogLoad } from "@/lib/posthog-client";

/**
 * Identifies users in PostHog when they sign in via Clerk.
 * Automatically resets PostHog session when user signs out.
 */
export function IdentifyUser() {
  const { user, isLoaded } = useUser();

  useEffect(() => {
    if (!isLoaded) return;
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;

    return schedulePosthogLoad((posthog) => {
      if (user) {
        // Identify the user in PostHog with Clerk data
        posthog.identify(user.id, {
          email: user.primaryEmailAddress?.emailAddress,
          name: user.fullName,
          firstName: user.firstName,
          lastName: user.lastName,
          createdAt: user.createdAt,
          imageUrl: user.imageUrl,
        });
      } else {
        // User signed out - reset PostHog to start fresh anonymous session
        posthog.reset();
      }
    });
  }, [user, isLoaded]);

  return null;
}
