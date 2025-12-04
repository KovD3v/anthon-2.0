/**
 * Admin Users API
 * List, view, and manage users.
 */

import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireSuperAdmin, updateUserRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { UserRole } from "@/generated/prisma";

// GET /api/admin/users - List users with pagination and search
export async function GET(req: NextRequest) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const page = Number.parseInt(searchParams.get("page") || "1");
  const limit = Number.parseInt(searchParams.get("limit") || "20");
  const search = searchParams.get("search") || "";
  const role = searchParams.get("role") as UserRole | null;

  const skip = (page - 1) * limit;

  try {
    const where: {
      email?: { contains: string; mode: "insensitive" };
      role?: UserRole;
    } = {};

    if (search) {
      where.email = { contains: search, mode: "insensitive" };
    }

    if (role) {
      where.role = role;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          clerkId: true,
          email: true,
          role: true,
          createdAt: true,
          profile: {
            select: {
              name: true,
              sport: true,
            },
          },
          subscription: {
            select: {
              status: true,
              planName: true,
            },
          },
          _count: {
            select: {
              messages: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        name: u.profile?.name,
        sport: u.profile?.sport,
        subscriptionStatus: u.subscription?.status,
        planName: u.subscription?.planName,
        messageCount: u._count.messages,
        createdAt: u.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[Users API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/users - Update user role (SUPER_ADMIN only)
export async function PATCH(req: NextRequest) {
  const { user, errorResponse } = await requireSuperAdmin();
  if (errorResponse) return errorResponse;
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { userId, role } = body as { userId: string; role: UserRole };

    if (!userId || !role) {
      return NextResponse.json(
        { error: "userId and role are required" },
        { status: 400 }
      );
    }

    // Validate role
    if (!["USER", "ADMIN", "SUPER_ADMIN"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const result = await updateUserRole(userId, role, user);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Users API] Error updating role:", error);
    return NextResponse.json(
      { error: "Failed to update role" },
      { status: 500 }
    );
  }
}
