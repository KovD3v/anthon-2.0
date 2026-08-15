/**
 * Authentication and authorization helpers.
 * Provides role-based access control functions.
 */

import { clerkClient } from "@clerk/nextjs/server";
import { waitUntil } from "@vercel/functions";
import { revalidateTag, unstable_cache } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { UserRole } from "@/generated/prisma";
import { resolveAuthenticatedClerkId } from "@/lib/auth-identity";
import { prisma } from "@/lib/db";
import { createLogger, getLogContext } from "@/lib/logger";

export type { UserRole };
const authLogger = createLogger("auth");

function logAuthState(event: string, message: string, data?: unknown) {
  if (event === "auth.authenticated") {
    // Frequent and repetitive; keep available at debug level.
    authLogger.debug(event, message, data);
    return;
  }

  const context = getLogContext();
  if (context.requestId) {
    authLogger.info(event, message, data);
    return;
  }

  // Avoid noisy auth state logs during server component renders.
  authLogger.debug(event, message, data);
}

export interface AuthUser {
  id: string;
  clerkId: string;
  email: string | null;
  isGuest: boolean;
  role: UserRole;
  createdAt: Date;
  onboardingCompletedAt: Date | null;
}

export interface AuthResult {
  user: AuthUser | null;
  error: string | null;
}

/**
 * Cached user lookup by clerkId.
 * Cache is revalidated every 60 seconds to keep role changes relatively fresh.
 */
const getCachedUserByClerkId = unstable_cache(
  async (clerkId: string) => {
    return prisma.user.findUnique({
      where: { clerkId },
      select: {
        id: true,
        clerkId: true,
        email: true,
        isGuest: true,
        role: true,
        createdAt: true,
        onboardingCompletedAt: true,
      },
    });
  },
  ["user-by-clerk-id"],
  {
    revalidate: 60, // Cache for 60 seconds
    tags: ["user-auth"],
  },
);

/**
 * Get the authenticated user with their role from the database.
 * Creates a new user if they don't exist yet.
 *
 * PERFORMANCE: This function is optimized to avoid slow Clerk API calls.
 * Profile syncing is now done asynchronously in the background.
 * User lookups are cached for 60 seconds to reduce database queries.
 */
export async function getAuthUser(): Promise<AuthResult> {
  try {
    const clerkId = await resolveAuthenticatedClerkId();

    if (!clerkId) {
      logAuthState("auth.unauthenticated", "No authenticated Clerk session");
      return { user: null, error: "Not authenticated" };
    }

    // Try cached lookup first
    let user = await getCachedUserByClerkId(clerkId);

    if (!user) {
      // User not in cache, check database directly
      user = await prisma.user.findUnique({
        where: { clerkId },
        select: {
          id: true,
          clerkId: true,
          email: true,
          isGuest: true,
          role: true,
          createdAt: true,
          onboardingCompletedAt: true,
        },
      });

      if (!user) {
        // Create new user with default role
        user = await prisma.user.create({
          data: { clerkId },
          select: {
            id: true,
            clerkId: true,
            email: true,
            isGuest: true,
            role: true,
            createdAt: true,
            onboardingCompletedAt: true,
          },
        });
      }
    }

    if (user.email === null) {
      const userId = user.id;

      // Sync missing Clerk data asynchronously (wrapped with waitUntil for serverless)
      waitUntil(
        syncUserFromClerk(clerkId, userId).catch((error) => {
          authLogger.error(
            "auth.user_sync.background_failed",
            "Background user sync failed",
            { error, clerkId, userId },
          );
        }),
      );
    }

    logAuthState("auth.authenticated", "Authenticated user resolved", {
      userId: user.id,
      clerkId: user.clerkId,
      role: user.role,
    });

    return {
      user: {
        id: user.id,
        clerkId: user.clerkId ?? "",
        email: user.email,
        isGuest: user.isGuest,
        role: user.role,
        // unstable_cache serializes Date objects to strings, so we need to convert back
        createdAt: new Date(user.createdAt),
        onboardingCompletedAt: user.onboardingCompletedAt
          ? new Date(user.onboardingCompletedAt)
          : null,
      },
      error: null,
    };
  } catch (error: unknown) {
    unstable_rethrow(error);
    authLogger.error("auth.resolve_failed", "Error resolving auth user", {
      error,
    });
    return { user: null, error: "Authentication error" };
  }
}

/**
 * Sync missing user data from Clerk asynchronously.
 * This is called in the background to avoid blocking the main request.
 */
async function syncUserFromClerk(
  clerkId: string,
  userId: string,
): Promise<void> {
  try {
    // Fetch user data from Clerk
    const client = await clerkClient();
    const [clerkUser, profile] = await Promise.all([
      client.users.getUser(clerkId),
      prisma.profile.findUnique({
        where: { userId },
        select: { name: true },
      }),
    ]);
    const email =
      clerkUser.primaryEmailAddress?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress;
    const firstName = clerkUser.firstName;
    const lastName = clerkUser.lastName;

    if (email) {
      await prisma.user.update({
        where: { id: userId },
        data: { email },
      });
      revalidateTag("user-auth", "max");
      authLogger.info(
        "auth.user_sync.email_completed",
        "Synced email from Clerk",
        {
          userId,
          clerkId,
        },
      );
    }

    if (!profile?.name && (firstName || lastName)) {
      const fullName = [firstName, lastName].filter(Boolean).join(" ");
      await prisma.profile.upsert({
        where: { userId },
        update: { name: fullName },
        create: {
          userId,
          name: fullName,
        },
      });
      authLogger.info(
        "auth.profile_sync.completed",
        "Synced profile name from Clerk",
        {
          userId,
          clerkId,
          fullName,
        },
      );
    }
  } catch (error) {
    authLogger.error(
      "auth.user_sync.failed",
      "Error syncing user data from Clerk",
      {
        error,
        userId,
        clerkId,
      },
    );
  }
}

/**
 * Get the full user record with all relations.
 */
export async function getFullUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      preferences: true,
      subscription: true,
    },
  });
}

/**
 * Check if user is an admin (ADMIN or SUPER_ADMIN).
 */
function isAdmin(role: UserRole): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/**
 * Check if user is a super admin.
 */
function isSuperAdmin(role: UserRole): boolean {
  return role === "SUPER_ADMIN";
}

/**
 * Require admin role for an API route.
 * Returns the user if they're an admin, or an error response.
 */
export async function requireAdmin(): Promise<{
  user: AuthUser | null;
  errorResponse: Response | null;
}> {
  const { user, error } = await getAuthUser();

  if (error || !user) {
    authLogger.warn(
      "auth.require_admin.unauthorized",
      "Admin access unauthorized",
      {
        error,
      },
    );
    return {
      user: null,
      errorResponse: new Response(
        JSON.stringify({ error: error || "Unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      ),
    };
  }

  if (!isAdmin(user.role)) {
    authLogger.warn("auth.require_admin.forbidden", "Admin role required", {
      userId: user.id,
      role: user.role,
    });
    return {
      user: null,
      errorResponse: new Response(
        JSON.stringify({ error: "Forbidden: Admin access required" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      ),
    };
  }

  return { user, errorResponse: null };
}

/**
 * Require super admin role for an API route.
 * Returns the user if they're a super admin, or an error response.
 */
export async function requireSuperAdmin(): Promise<{
  user: AuthUser | null;
  errorResponse: Response | null;
}> {
  const { user, error } = await getAuthUser();

  if (error || !user) {
    authLogger.warn(
      "auth.require_super_admin.unauthorized",
      "Super admin access unauthorized",
      { error },
    );
    return {
      user: null,
      errorResponse: new Response(
        JSON.stringify({ error: error || "Unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      ),
    };
  }

  if (!isSuperAdmin(user.role)) {
    authLogger.warn(
      "auth.require_super_admin.forbidden",
      "Super admin role required",
      {
        userId: user.id,
        role: user.role,
      },
    );
    return {
      user: null,
      errorResponse: new Response(
        JSON.stringify({
          error: "Forbidden: Super admin access required",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      ),
    };
  }

  return { user, errorResponse: null };
}

/**
 * Update a user's role (only SUPER_ADMIN can do this).
 */
export async function updateUserRole(
  userId: string,
  newRole: UserRole,
  actingUser: AuthUser,
): Promise<{ success: boolean; error?: string }> {
  // Only super admins can change roles
  if (!isSuperAdmin(actingUser.role)) {
    return {
      success: false,
      error: "Only super admins can change user roles",
    };
  }

  // Prevent demoting yourself
  if (userId === actingUser.id && newRole !== "SUPER_ADMIN") {
    return { success: false, error: "Cannot demote yourself" };
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { role: newRole },
    });

    // Invalidate auth cache when role changes
    await invalidateAuthCache();

    return { success: true };
  } catch (error) {
    authLogger.error("auth.update_role.failed", "Error updating user role", {
      error,
      userId,
      actingUserId: actingUser.id,
      newRole,
    });
    return { success: false, error: "Failed to update role" };
  }
}

/**
 * Invalidate the auth cache.
 * Call this when user data changes (e.g., role updates).
 */
async function invalidateAuthCache(): Promise<void> {
  const { revalidateTag } = await import("next/cache");
  revalidateTag("user-auth", "max");
}
