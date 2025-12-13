/**
 * Guest User Migration Utility
 *
 * Migrates all data from a guest user to a registered user when they complete
 * the registration/linking flow. This ensures conversation history and preferences
 * are preserved.
 *
 * Conflict Resolution Strategy:
 * - For profile/preferences: MORE RECENT data wins (based on updatedAt)
 * - For memories: MORE RECENT data wins, conflicts are logged
 * - Conflicts are saved as a special memory for user reference
 */

import { prisma } from "@/lib/db";

export interface MigratedCounts {
  messages: number;
  chats: number;
  memories: number;
  sessionSummaries: number;
  channelIdentities: number;
  dailyUsage: number;
  profile: boolean;
  preferences: boolean;
}

export interface ConflictInfo {
  field: string;
  keptValue: unknown;
  discardedValue: unknown;
  reason: "target_newer" | "guest_newer" | "target_exists";
}

export interface MigrationResult {
  success: boolean;
  migratedCounts: MigratedCounts;
  conflicts: ConflictInfo[];
  error?: string;
}

/**
 * Migrate all data from a guest user to a registered user.
 *
 * This function:
 * 1. Transfers all messages, chats, memories, session summaries
 * 2. Merges profile/preferences with recency-based priority
 * 3. Aggregates daily usage data
 * 4. Updates channel identities
 * 5. Marks the guest user as converted
 * 6. Logs conflicts for user reference
 *
 * All operations are wrapped in a transaction for atomicity.
 */
export async function migrateGuestToUser(
  guestUserId: string,
  targetUserId: string,
): Promise<MigrationResult> {
  if (guestUserId === targetUserId) {
    return {
      success: false,
      migratedCounts: createEmptyCounts(),
      conflicts: [],
      error: "Cannot migrate user to themselves",
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const migratedCounts: MigratedCounts = createEmptyCounts();
      const conflicts: ConflictInfo[] = [];

      // 1. Migrate Messages
      const messagesResult = await tx.message.updateMany({
        where: { userId: guestUserId },
        data: { userId: targetUserId },
      });
      migratedCounts.messages = messagesResult.count;

      // 2. Migrate Chats
      const chatsResult = await tx.chat.updateMany({
        where: { userId: guestUserId },
        data: { userId: targetUserId },
      });
      migratedCounts.chats = chatsResult.count;

      // 3. Migrate Memories with recency-based conflict resolution
      const guestMemories = await tx.memory.findMany({
        where: { userId: guestUserId },
      });

      for (const memory of guestMemories) {
        const existingMemory = await tx.memory.findUnique({
          where: {
            userId_key: {
              userId: targetUserId,
              key: memory.key,
            },
          },
        });

        if (existingMemory) {
          // Conflict! Use recency to decide
          const guestNewer =
            new Date(memory.updatedAt) > new Date(existingMemory.updatedAt);

          if (guestNewer) {
            // Guest memory is newer, update target's memory
            await tx.memory.update({
              where: { id: existingMemory.id },
              data: { value: memory.value ?? {} },
            });
            conflicts.push({
              field: `memory:${memory.key}`,
              keptValue: memory.value,
              discardedValue: existingMemory.value,
              reason: "guest_newer",
            });
          } else {
            // Target memory is newer, keep it
            conflicts.push({
              field: `memory:${memory.key}`,
              keptValue: existingMemory.value,
              discardedValue: memory.value,
              reason: "target_newer",
            });
          }
          // Delete guest's memory
          await tx.memory.delete({ where: { id: memory.id } });
        } else {
          // No conflict, move memory to target user
          await tx.memory.update({
            where: { id: memory.id },
            data: { userId: targetUserId },
          });
          migratedCounts.memories++;
        }
      }

      // 4. Migrate Session Summaries
      const sessionSummariesResult = await tx.sessionSummary.updateMany({
        where: { userId: guestUserId },
        data: { userId: targetUserId },
      });
      migratedCounts.sessionSummaries = sessionSummariesResult.count;

      // 5. Migrate Channel Identities
      const channelIdentitiesResult = await tx.channelIdentity.updateMany({
        where: { userId: guestUserId },
        data: { userId: targetUserId },
      });
      migratedCounts.channelIdentities = channelIdentitiesResult.count;

      // 6. Migrate/Aggregate Daily Usage
      const guestUsage = await tx.dailyUsage.findMany({
        where: { userId: guestUserId },
      });

      for (const usage of guestUsage) {
        const existingUsage = await tx.dailyUsage.findUnique({
          where: {
            userId_date: {
              userId: targetUserId,
              date: usage.date,
            },
          },
        });

        if (existingUsage) {
          // Aggregate into existing record
          await tx.dailyUsage.update({
            where: { id: existingUsage.id },
            data: {
              requestCount: { increment: usage.requestCount },
              inputTokens: { increment: usage.inputTokens },
              outputTokens: { increment: usage.outputTokens },
              totalCostUsd: { increment: usage.totalCostUsd },
            },
          });
          await tx.dailyUsage.delete({ where: { id: usage.id } });
        } else {
          await tx.dailyUsage.update({
            where: { id: usage.id },
            data: { userId: targetUserId },
          });
        }
        migratedCounts.dailyUsage++;
      }

      // 7. Merge Profile with recency-based priority
      const guestProfile = await tx.profile.findUnique({
        where: { userId: guestUserId },
      });

      if (guestProfile) {
        const targetProfile = await tx.profile.findUnique({
          where: { userId: targetUserId },
        });

        if (!targetProfile) {
          // No target profile, create one with guest's data
          await tx.profile.create({
            data: {
              userId: targetUserId,
              name: guestProfile.name,
              sport: guestProfile.sport,
              goal: guestProfile.goal,
              experience: guestProfile.experience,
              birthday: guestProfile.birthday,
              notes: guestProfile.notes,
            },
          });
          migratedCounts.profile = true;
        } else {
          // Both exist - merge with recency priority
          const guestNewer =
            new Date(guestProfile.updatedAt) >
            new Date(targetProfile.updatedAt);
          const updates: Record<string, unknown> = {};
          const profileFields = [
            "name",
            "sport",
            "goal",
            "experience",
            "notes",
          ] as const;

          for (const field of profileFields) {
            const targetValue = targetProfile[field];
            const guestValue = guestProfile[field];

            if (targetValue && guestValue && targetValue !== guestValue) {
              // Conflict on this field
              if (guestNewer) {
                updates[field] = guestValue;
                conflicts.push({
                  field: `profile:${field}`,
                  keptValue: guestValue,
                  discardedValue: targetValue,
                  reason: "guest_newer",
                });
              } else {
                conflicts.push({
                  field: `profile:${field}`,
                  keptValue: targetValue,
                  discardedValue: guestValue,
                  reason: "target_newer",
                });
              }
            } else if (!targetValue && guestValue) {
              // Target missing this field, fill it
              updates[field] = guestValue;
            }
          }

          // Handle birthday separately (it's a Date)
          if (!targetProfile.birthday && guestProfile.birthday) {
            updates.birthday = guestProfile.birthday;
          } else if (
            targetProfile.birthday &&
            guestProfile.birthday &&
            targetProfile.birthday.getTime() !== guestProfile.birthday.getTime()
          ) {
            if (guestNewer) {
              updates.birthday = guestProfile.birthday;
              conflicts.push({
                field: "profile:birthday",
                keptValue: guestProfile.birthday.toISOString(),
                discardedValue: targetProfile.birthday.toISOString(),
                reason: "guest_newer",
              });
            } else {
              conflicts.push({
                field: "profile:birthday",
                keptValue: targetProfile.birthday.toISOString(),
                discardedValue: guestProfile.birthday.toISOString(),
                reason: "target_newer",
              });
            }
          }

          if (Object.keys(updates).length > 0) {
            await tx.profile.update({
              where: { userId: targetUserId },
              data: updates,
            });
            migratedCounts.profile = true;
          }
        }

        // Delete guest's profile
        await tx.profile.delete({ where: { userId: guestUserId } });
      }

      // 8. Merge Preferences with recency-based priority
      const guestPreferences = await tx.preferences.findUnique({
        where: { userId: guestUserId },
      });

      if (guestPreferences) {
        const targetPreferences = await tx.preferences.findUnique({
          where: { userId: targetUserId },
        });

        if (!targetPreferences) {
          await tx.preferences.create({
            data: {
              userId: targetUserId,
              tone: guestPreferences.tone,
              mode: guestPreferences.mode,
              language: guestPreferences.language,
              push: guestPreferences.push,
            },
          });
          migratedCounts.preferences = true;
        } else {
          // Both exist - merge with recency priority
          const guestNewer =
            new Date(guestPreferences.updatedAt) >
            new Date(targetPreferences.updatedAt);
          const updates: Record<string, unknown> = {};
          const prefFields = ["tone", "mode", "language"] as const;

          for (const field of prefFields) {
            const targetValue = targetPreferences[field];
            const guestValue = guestPreferences[field];

            if (targetValue && guestValue && targetValue !== guestValue) {
              if (guestNewer) {
                updates[field] = guestValue;
                conflicts.push({
                  field: `preferences:${field}`,
                  keptValue: guestValue,
                  discardedValue: targetValue,
                  reason: "guest_newer",
                });
              } else {
                conflicts.push({
                  field: `preferences:${field}`,
                  keptValue: targetValue,
                  discardedValue: guestValue,
                  reason: "target_newer",
                });
              }
            } else if (!targetValue && guestValue) {
              updates[field] = guestValue;
            }
          }

          // Handle push notification preference
          if (targetPreferences.push !== guestPreferences.push && guestNewer) {
            updates.push = guestPreferences.push;
            conflicts.push({
              field: "preferences:push",
              keptValue: guestPreferences.push,
              discardedValue: targetPreferences.push,
              reason: "guest_newer",
            });
          }

          if (Object.keys(updates).length > 0) {
            await tx.preferences.update({
              where: { userId: targetUserId },
              data: updates,
            });
            migratedCounts.preferences = true;
          }
        }

        // Delete guest's preferences
        await tx.preferences.delete({ where: { userId: guestUserId } });
      }

      // 9. Mark guest as converted
      await tx.user.update({
        where: { id: guestUserId },
        data: { guestConvertedAt: new Date() },
      });

      // 10. Save conflicts as a special memory for reference (if any)
      if (conflicts.length > 0) {
        await tx.memory.upsert({
          where: {
            userId_key: {
              userId: targetUserId,
              key: "_migration_conflicts",
            },
          },
          create: {
            userId: targetUserId,
            key: "_migration_conflicts",
            value: {
              migratedAt: new Date().toISOString(),
              guestUserId,
              conflicts,
            },
          },
          update: {
            value: {
              migratedAt: new Date().toISOString(),
              guestUserId,
              conflicts,
            },
          },
        });
      }

      return { migratedCounts, conflicts };
    });

    console.log(
      `[Guest Migration] Successfully migrated guest ${guestUserId} to user ${targetUserId}:`,
      result.migratedCounts,
      `(${result.conflicts.length} conflicts resolved)`,
    );

    return {
      success: true,
      migratedCounts: result.migratedCounts,
      conflicts: result.conflicts,
    };
  } catch (error) {
    console.error(
      `[Guest Migration] Failed to migrate guest ${guestUserId} to user ${targetUserId}:`,
      error,
    );
    return {
      success: false,
      migratedCounts: createEmptyCounts(),
      conflicts: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function createEmptyCounts(): MigratedCounts {
  return {
    messages: 0,
    chats: 0,
    memories: 0,
    sessionSummaries: 0,
    channelIdentities: 0,
    dailyUsage: 0,
    profile: false,
    preferences: false,
  };
}
