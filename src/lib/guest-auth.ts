/**
 * Guest Authentication for Web
 *
 * Handles guest user sessions via HttpOnly cookies.
 * Follows the same pattern as Telegram guest users.
 */

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { LatencyLogger } from "@/lib/latency-logger";
import { createLogger } from "@/lib/logger";

// Cookie configuration
const GUEST_COOKIE_NAME = "anthon_guest_token";
const GUEST_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds
const authLogger = createLogger("auth");

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

interface GuestChatRow {
  id: string;
  title: string | null;
  visibility: "PRIVATE" | "PUBLIC";
  createdAt: Date;
  updatedAt: Date;
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
      ((error as { digest?: string }).digest === "DYNAMIC_SERVER_USAGE" ||
        error.message.includes("Dynamic server usage"))
    ) {
      authLogger.warn(
        "auth.guest.dynamic_server_usage",
        "Dynamic server usage while reading guest cookie",
      );
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
  await LatencyLogger.measure("Guest Auth: Set guest cookie", async () => {
    const cookieStore = await cookies();
    cookieStore.set(GUEST_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: GUEST_COOKIE_MAX_AGE,
      path: "/",
    });
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

    const user = await LatencyLogger.measure(
      "Guest Auth: Lookup existing guest user",
      () =>
        prisma.user.findFirst({
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
        }),
    );

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

  const user = await LatencyLogger.measure(
    "Guest Auth: Create guest user",
    () =>
      prisma.user.create({
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
      }),
  );

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
export async function getExistingGuestUser(): Promise<GuestUser | null> {
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

  authLogger.info(
    result.isNew ? "auth.guest_session_created" : "auth.guest_session_reused",
    result.isNew ? "Guest session created" : "Guest session reused",
    {
      userId: result.user.id,
      tokenChanged: result.token !== existingToken,
      hasExistingToken: Boolean(existingToken),
    },
  );

  return result;
}

export async function createGuestChatForSession(input: {
  title?: string;
}): Promise<{
  user: GuestUser;
  token: string;
  isNew: boolean;
  chat: GuestChatRow;
}> {
  const existingToken = await getGuestTokenFromCookies();

  if (existingToken) {
    const tokenHash = hashGuestToken(existingToken);
    const user = await LatencyLogger.measure(
      "Guest Auth: Lookup existing guest user",
      () =>
        prisma.user.findFirst({
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
        }),
    );

    if (user?.isGuest) {
      const chat = await LatencyLogger.measure(
        "Guest Chats: Create chat row",
        () =>
          prisma.chat.create({
            data: {
              userId: user.id,
              title: input.title,
              customTitle: !!input.title,
              visibility: "PRIVATE",
            },
            select: {
              id: true,
              title: true,
              visibility: true,
              createdAt: true,
              updatedAt: true,
            },
          }),
      );

      authLogger.info("auth.guest_session_reused", "Guest session reused", {
        userId: user.id,
        tokenChanged: false,
        hasExistingToken: true,
      });

      return {
        user: user as GuestUser,
        token: existingToken,
        isNew: false,
        chat,
      };
    }
  }

  const newToken = generateGuestToken();
  const tokenHash = hashGuestToken(newToken);

  const chatWithUser = await LatencyLogger.measure(
    "Guest Chats: Create guest user and chat",
    () =>
      prisma.chat.create({
        data: {
          title: input.title,
          customTitle: !!input.title,
          visibility: "PRIVATE",
          user: {
            create: {
              isGuest: true,
              guestAbuseIdHash: tokenHash,
            },
          },
        },
        select: {
          id: true,
          title: true,
          visibility: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              isGuest: true,
              role: true,
            },
          },
        },
      }),
  );

  await setGuestCookie(newToken);

  authLogger.info("auth.guest_session_created", "Guest session created", {
    userId: chatWithUser.user.id,
    tokenChanged: true,
    hasExistingToken: Boolean(existingToken),
  });

  const { user, ...chat } = chatWithUser;
  return {
    user: user as GuestUser,
    token: newToken,
    isNew: true,
    chat,
  };
}
