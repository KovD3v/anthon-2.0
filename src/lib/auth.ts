/**
 * Authentication and authorization helpers.
 * Provides role-based access control functions.
 */

import { auth, clerkClient } from "@clerk/nextjs/server";
import { waitUntil } from "@vercel/functions";
import { unstable_cache } from "next/cache";
import type { UserRole } from "@/generated/prisma";
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
  role: UserRole;
  createdAt: Date;
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
        role: true,
        createdAt: true,
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
    const { userId: clerkId } = await auth();

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
          role: true,
          createdAt: true,
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
            role: true,
            createdAt: true,
          },
        });

        // Sync profile asynchronously (wrapped with waitUntil for serverless)
        waitUntil(
          syncUserProfileFromClerk(clerkId, user.id).catch((error) => {
            authLogger.error(
              "auth.profile_sync.background_failed",
              "Background profile sync failed",
              { error, clerkId, userId: user.id },
            );
          }),
        );
      }
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
        role: user.role,
        // unstable_cache serializes Date objects to strings, so we need to convert back
        createdAt: new Date(user.createdAt),
      },
      error: null,
    };
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      ((error as { digest?: string }).digest === "DYNAMIC_SERVER_USAGE" ||
        error.message.includes("Dynamic server usage"))
    ) {
      authLogger.warn(
        "auth.dynamic_server_usage",
        "Dynamic server usage while resolving auth",
        { message: error.message },
      );
      return { user: null, error: null };
    }
    authLogger.error("auth.resolve_failed", "Error resolving auth user", {
      error,
    });
    return { user: null, error: "Authentication error" };
  }
}

/**
 * Sync user profile from Clerk asynchronously.
 * This is called in the background to avoid blocking the main request.
 */
async function syncUserProfileFromClerk(
  clerkId: string,
  userId: string,
): Promise<void> {
  try {
    // Check if profile already exists with a name
    const profile = await prisma.profile.findUnique({
      where: { userId },
      select: { name: true },
    });

    // Skip if profile already has a name
    if (profile?.name) {
      return;
    }

    // Fetch user data from Clerk
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(clerkId);
    const firstName = clerkUser.firstName;
    const lastName = clerkUser.lastName;

    if (firstName || lastName) {
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
      "auth.profile_sync.failed",
      "Error syncing user profile from Clerk",
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
  revalidateTag("user-auth", "page");
}
