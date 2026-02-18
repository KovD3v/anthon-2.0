/**
 * Clerk webhook handlers for user events.
 */

import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import type { UserCreatedData } from "./types";

const webhookLogger = createLogger("webhook");

/**
 * Handle user.created event.
 * Creates the user in our database if not exists.
 */
export async function handleUserCreated(data: UserCreatedData) {
  const clerkId = data.id;
  const email = data.email_addresses?.[0]?.email_address;
  const firstName = data.first_name;
  const lastName = data.last_name;

  webhookLogger.info(
    "webhook.user.created.received",
    "User created event received",
    {
      clerkId,
    },
  );

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
    webhookLogger.info(
      "webhook.user.created.persisted",
      "User created in database",
      {
        clerkId,
        userId: user.id,
      },
    );

    // Create profile with name if available
    if (firstName || lastName) {
      const fullName = [firstName, lastName].filter(Boolean).join(" ");
      await prisma.profile.create({
        data: {
          userId: user.id,
          name: fullName,
        },
      });
      webhookLogger.info(
        "webhook.user.profile.created",
        "Profile created from webhook",
        {
          clerkId,
          userId: user.id,
          fullName,
        },
      );
    }
  } else {
    // Update existing user with email if missing or changed
    if (existingUser.email !== email) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { email },
      });
      webhookLogger.info(
        "webhook.user.email.updated",
        "Updated existing user email from user.created event",
        { clerkId, userId: existingUser.id },
      );
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

  webhookLogger.info(
    "webhook.user.updated.received",
    "User updated event received",
    {
      clerkId,
    },
  );

  // Find user
  const user = await prisma.user.findUnique({
    where: { clerkId },
    include: { profile: true },
  });

  if (!user) {
    webhookLogger.error(
      "webhook.user.updated.missing",
      "User not found for update",
      {
        clerkId,
      },
    );
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
    webhookLogger.info("webhook.user.profile.updated", "Profile name updated", {
      clerkId,
      userId: user.id,
      fullName,
    });
  }

  // Update email if provided
  if (email && user.email !== email) {
    await prisma.user.update({
      where: { id: user.id },
      data: { email },
    });
    webhookLogger.info("webhook.user.email.updated", "User email updated", {
      clerkId,
      userId: user.id,
    });
  }
}
