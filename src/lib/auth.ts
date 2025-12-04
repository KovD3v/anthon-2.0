/**
 * Authentication and authorization helpers.
 * Provides role-based access control functions.
 */

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import type { User, UserRole } from "@/generated/prisma";

export type { UserRole };

export interface AuthUser {
  id: string;
  clerkId: string;
  email: string | null;
  role: UserRole;
}

export interface AuthResult {
  user: AuthUser | null;
  error: string | null;
}

/**
 * Get the authenticated user with their role from the database.
 * Creates a new user if they don't exist yet.
 */
export async function getAuthUser(): Promise<AuthResult> {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return { user: null, error: "Not authenticated" };
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { clerkId },
      select: {
        id: true,
        clerkId: true,
        email: true,
        role: true,
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
        },
      });
    }

    return {
      user: {
        id: user.id,
        clerkId: user.clerkId ?? "",
        email: user.email,
        role: user.role,
      },
      error: null,
    };
  } catch (error) {
    console.error("[Auth] Error getting user:", error);
    return { user: null, error: "Authentication error" };
  }
}

/**
 * Get the full user record with all relations.
 */
export async function getFullUser(userId: string): Promise<User | null> {
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
export function isAdmin(role: UserRole): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/**
 * Check if user is a super admin.
 */
export function isSuperAdmin(role: UserRole): boolean {
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
    return {
      user: null,
      errorResponse: new Response(
        JSON.stringify({ error: error || "Unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      ),
    };
  }

  if (!isAdmin(user.role)) {
    return {
      user: null,
      errorResponse: new Response(
        JSON.stringify({ error: "Forbidden: Admin access required" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
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
    return {
      user: null,
      errorResponse: new Response(
        JSON.stringify({ error: error || "Unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      ),
    };
  }

  if (!isSuperAdmin(user.role)) {
    return {
      user: null,
      errorResponse: new Response(
        JSON.stringify({ error: "Forbidden: Super admin access required" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
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
  actingUser: AuthUser
): Promise<{ success: boolean; error?: string }> {
  // Only super admins can change roles
  if (!isSuperAdmin(actingUser.role)) {
    return { success: false, error: "Only super admins can change user roles" };
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

    return { success: true };
  } catch (error) {
    console.error("[Auth] Error updating user role:", error);
    return { success: false, error: "Failed to update role" };
  }
}
