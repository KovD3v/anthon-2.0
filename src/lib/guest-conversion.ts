import "server-only";

import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import {
  clearGuestCookie,
  getGuestTokenFromCookies,
  hashGuestToken,
} from "@/lib/guest-auth";
import { migrateGuestToUser } from "@/lib/guest-migration";
import { createLogger } from "@/lib/logger";

const conversionLogger = createLogger("auth");

export type GuestConversionOutcome =
  | "no_cookie"
  | "stale_cookie"
  | "already_owned"
  | "migrated"
  | "retryable_failure";

export async function convertGuestForAuthenticatedUser(
  userId: string,
  options: { canMutateCookies?: boolean } = {},
): Promise<GuestConversionOutcome> {
  const canMutateCookies = options.canMutateCookies ?? true;
  const guestToken = await getGuestTokenFromCookies();
  if (!guestToken) {
    return "no_cookie";
  }

  const guestUser = await prisma.user.findFirst({
    where: {
      isGuest: true,
      guestTokenHash: hashGuestToken(guestToken),
      guestConvertedAt: null,
    },
    select: { id: true },
  });

  if (!guestUser) {
    if (canMutateCookies) await clearGuestCookie();
    return "stale_cookie";
  }

  if (guestUser.id === userId) {
    if (canMutateCookies) await clearGuestCookie();
    return "already_owned";
  }

  conversionLogger.info("guest.migration_start", "Migrating guest to user", {
    guestId: guestUser.id,
    userId,
  });

  const migrationResult = await migrateGuestToUser(guestUser.id, userId);
  if (!migrationResult.success) {
    conversionLogger.error("guest.migration_failed", "Guest migration failed", {
      error: migrationResult.error,
    });
    return "retryable_failure";
  }

  // Chat layouts can perform the migration while rendering the authenticated
  // route. Next.js 16 rejects cache invalidation from that render context;
  // the route-handler callers keep the normal revalidation behavior.
  if (canMutateCookies) {
    revalidateTag(`chats-${userId}`, "max");
  }
  if (canMutateCookies) await clearGuestCookie();
  conversionLogger.info(
    "guest.migration_success",
    "Guest migration successful",
    { migratedCounts: migrationResult.migratedCounts },
  );
  return "migrated";
}
