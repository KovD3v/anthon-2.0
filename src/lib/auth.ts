/**
 * Authentication and authorization helpers.
 * Provides role-based access control functions.
 */

import { waitUntil } from "@vercel/functions";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { unstable_cache } from "next/cache";
import type { UserRole } from "@/generated/prisma";
import { prisma } from "@/lib/db";

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
			},
		});
	},
	["user-by-clerk-id"],
	{
		revalidate: 60, // Cache for 60 seconds
		tags: ["user-auth"],
	}
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

				// Sync profile asynchronously (wrapped with waitUntil for serverless)
				waitUntil(
					syncUserProfileFromClerk(clerkId, user.id).catch(
						(error) => {
							console.error(
								"[Auth] Background profile sync error:",
								error
							);
						}
					)
				);
			}
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
 * Sync user profile from Clerk asynchronously.
 * This is called in the background to avoid blocking the main request.
 */
async function syncUserProfileFromClerk(
	clerkId: string,
	userId: string
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
			console.log(`[Auth] Synced profile name from Clerk: ${fullName}`);
		}
	} catch (error) {
		console.error("[Auth] Error syncing user profile from Clerk:", error);
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
				JSON.stringify({
					error: "Forbidden: Super admin access required",
				}),
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
		console.error("[Auth] Error updating user role:", error);
		return { success: false, error: "Failed to update role" };
	}
}

/**
 * Invalidate the auth cache.
 * Call this when user data changes (e.g., role updates).
 */
export async function invalidateAuthCache(): Promise<void> {
	const { revalidateTag } = await import("next/cache");
	revalidateTag("user-auth", "page");
}
