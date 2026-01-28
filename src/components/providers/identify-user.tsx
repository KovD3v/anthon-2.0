"use client";

import { useUser } from "@clerk/nextjs";
import posthog from "posthog-js";
import { useEffect } from "react";

/**
 * Identifies users in PostHog when they sign in via Clerk.
 * Automatically resets PostHog session when user signs out.
 */
export function IdentifyUser() {
  const { user, isLoaded } = useUser();

  useEffect(() => {
    if (!isLoaded) return;

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
  }, [user, isLoaded]);

  return null;
}
