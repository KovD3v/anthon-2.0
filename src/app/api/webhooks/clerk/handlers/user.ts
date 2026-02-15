/**
 * Clerk webhook handlers for user events.
 */

import { prisma } from "@/lib/db";
import type { UserCreatedData } from "./types";

/**
 * Handle user.created event.
 * Creates the user in our database if not exists.
 */
export async function handleUserCreated(data: UserCreatedData) {
  const clerkId = data.id;
  const email = data.email_addresses?.[0]?.email_address;
  const firstName = data.first_name;
  const lastName = data.last_name;

  console.log(`[Webhook] User created: ${clerkId}`);

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { clerkId },
  });

  if (!existingUser) {
    // Create user
    const user = await prisma.user.create({
      data: {
        clerkId,
        email,
      },
    });
    console.log(`[Webhook] Created user in database: ${clerkId}`);

    // Create profile with name if available
    if (firstName || lastName) {
      const fullName = [firstName, lastName].filter(Boolean).join(" ");
      await prisma.profile.create({
        data: {
          userId: user.id,
          name: fullName,
        },
      });
      console.log(`[Webhook] Created profile with name: ${fullName}`);
    }
  } else {
    // Update existing user with email if missing or changed
    if (existingUser.email !== email) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { email },
      });
      console.log(`[Webhook] Updated existing user email: ${clerkId}`);
    }
  }
}

/**
 * Handle user.updated event.
 * Updates user profile with name changes from Clerk.
 */
export async function handleUserUpdated(data: UserCreatedData) {
  const clerkId = data.id;
  const email = data.email_addresses?.[0]?.email_address;
  const firstName = data.first_name;
  const lastName = data.last_name;

  console.log(`[Webhook] User updated: ${clerkId}`);

  // Find user
  const user = await prisma.user.findUnique({
    where: { clerkId },
    include: { profile: true },
  });

  if (!user) {
    console.error(`[Webhook] User not found: ${clerkId}`);
    return;
  }

  // Update profile with name if available
  if (firstName || lastName) {
    const fullName = [firstName, lastName].filter(Boolean).join(" ");

    if (user.profile) {
      await prisma.profile.update({
        where: { userId: user.id },
        data: { name: fullName },
      });
    } else {
      await prisma.profile.create({
        data: {
          userId: user.id,
          name: fullName,
        },
      });
    }
    console.log(`[Webhook] Updated profile name: ${fullName}`);
  }

  // Update email if provided
  if (email && user.email !== email) {
    await prisma.user.update({
      where: { id: user.id },
      data: { email },
    });
    console.log(`[Webhook] Updated user email: ${clerkId}`);
  }
}
