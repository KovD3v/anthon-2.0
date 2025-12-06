/**
 * Script to sync user names from Clerk to Profile table
 * Run this once to backfill existing users
 *
 * Usage:
 *   bun run scripts/sync-user-names.ts          # Only sync users without names
 *   bun run scripts/sync-user-names.ts --force  # Force sync all users
 */

import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "../src/lib/db";

const forceSync = process.argv.includes("--force");

async function syncUserNames() {
  console.log("Starting user name sync from Clerk...");
  if (forceSync) {
    console.log(
      "⚠️  FORCE MODE: Will update all users, even those with existing names"
    );
  }

  // Get all users without profiles or profiles without names
  const users = await prisma.user.findMany({
    where: {
      clerkId: { not: null },
    },
    include: {
      profile: true,
    },
  });

  console.log(`Found ${users.length} users to check`);

  let synced = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of users) {
    if (!user.clerkId) {
      skipped++;
      continue;
    }

    // Skip if profile already has a name (unless force mode)
    if (!forceSync && user.profile?.name) {
      console.log(
        `✓ User ${user.clerkId} already has name: ${user.profile.name}`
      );
      skipped++;
      continue;
    }

    try {
      // Fetch user from Clerk
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(user.clerkId);
      const firstName = clerkUser.firstName;
      const lastName = clerkUser.lastName;

      if (firstName || lastName) {
        const fullName = [firstName, lastName].filter(Boolean).join(" ");

        // Update or create profile
        await prisma.profile.upsert({
          where: { userId: user.id },
          update: { name: fullName },
          create: {
            userId: user.id,
            name: fullName,
          },
        });

        console.log(`✓ Synced name for ${user.clerkId}: ${fullName}`);
        synced++;
      } else {
        console.log(`⚠ No name found in Clerk for ${user.clerkId}`);
        skipped++;
      }
    } catch (error) {
      console.error(`✗ Error syncing user ${user.clerkId}:`, error);
      errors++;
    }
  }

  console.log("\n=== Sync Complete ===");
  console.log(`Synced: ${synced}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total: ${users.length}`);
}

syncUserNames()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
