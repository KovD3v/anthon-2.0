/**
 * Guest Authentication for Web
 *
 * Handles guest user sessions via HttpOnly cookies.
 * Follows the same pattern as Telegram guest users.
 */

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

// Cookie configuration
const GUEST_COOKIE_NAME = "anthon_guest_token";
const GUEST_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

// Guest user type (subset of full User)
export interface GuestUser {
  id: string;
  isGuest: true;
  role: "USER";
  subscription: {
    status: string;
    planId: string | null;
  } | null;
}

/**
 * Generate a secure random guest token.
 */
function generateGuestToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Hash a guest token for secure storage.
 */
export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Get the guest token from cookies (if present).
 */
export async function getGuestTokenFromCookies(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(GUEST_COOKIE_NAME);
    return cookie?.value ?? null;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      ((error as any).digest === "DYNAMIC_SERVER_USAGE" ||
        error.message.includes("Dynamic server usage"))
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * Set the guest token cookie.
 * Call this from API routes that need to set the cookie.
 */
async function setGuestCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(GUEST_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: GUEST_COOKIE_MAX_AGE,
    path: "/",
  });
}

/**
 * Clear the guest token cookie.
 * Call this after successful migration to registered user.
 */
export async function clearGuestCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(GUEST_COOKIE_NAME);
}

/**
 * Get or create a guest user from the token.
 * If no token is provided, creates a new guest user and returns both user and token.
 */
async function getOrCreateGuestUser(
  existingToken?: string | null,
): Promise<{ user: GuestUser; token: string; isNew: boolean }> {
  // If we have an existing token, try to find the user
  if (existingToken) {
    const tokenHash = hashGuestToken(existingToken);

    const user = await prisma.user.findFirst({
      where: {
        isGuest: true,
        guestAbuseIdHash: tokenHash,
        guestConvertedAt: null, // Not yet converted to registered user
      },
      select: {
        id: true,
        isGuest: true,
        role: true,
        subscription: {
          select: {
            status: true,
            planId: true,
          },
        },
      },
    });

    if (user?.isGuest) {
      return {
        user: user as GuestUser,
        token: existingToken,
        isNew: false,
      };
    }
  }

  // No valid token or user not found - create a new guest user
  const newToken = generateGuestToken();
  const tokenHash = hashGuestToken(newToken);

  const user = await prisma.user.create({
    data: {
      isGuest: true,
      guestAbuseIdHash: tokenHash,
    },
    select: {
      id: true,
      isGuest: true,
      role: true,
      subscription: {
        select: {
          status: true,
          planId: true,
        },
      },
    },
  });

  return {
    user: user as GuestUser,
    token: newToken,
    isNew: true,
  };
}

/**
 * Get an existing guest user from cookies (does not create new).
 * Returns null if no guest session exists.
 */
async function _getExistingGuestUser(): Promise<GuestUser | null> {
  const token = await getGuestTokenFromCookies();
  if (!token) return null;

  const tokenHash = hashGuestToken(token);

  const user = await prisma.user.findFirst({
    where: {
      isGuest: true,
      guestAbuseIdHash: tokenHash,
      guestConvertedAt: null,
    },
    select: {
      id: true,
      isGuest: true,
      role: true,
      subscription: {
        select: {
          status: true,
          planId: true,
        },
      },
    },
  });

  if (user?.isGuest) {
    return user as GuestUser;
  }

  return null;
}

/**
 * Get a guest user and ensure cookie is set.
 * This is the main entry point for guest authentication in API routes.
 */
export async function authenticateGuest(): Promise<{
  user: GuestUser;
  token: string;
  isNew: boolean;
}> {
  const existingToken = await getGuestTokenFromCookies();
  const result = await getOrCreateGuestUser(existingToken);

  // Set cookie if this is a new session or token changed
  if (result.isNew || result.token !== existingToken) {
    await setGuestCookie(result.token);
  }

  return result;
}
