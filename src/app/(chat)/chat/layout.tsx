import { Suspense } from "react";
import type { UserRole } from "@/generated/prisma";
import { getAuthUser } from "@/lib/auth";
import { getSharedChats } from "@/lib/chat";
import { prisma } from "@/lib/db";
import { getGuestTokenFromCookies, hashGuestToken } from "@/lib/guest-auth";
import { getSharedUsageData } from "@/lib/usage";
import type { Chat, UsageData } from "@/types/chat";
import { SidebarSkeleton } from "../../(chat)/components/Skeletons";
import { LayoutClient } from "./layout-client";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<SidebarSkeleton />}>
      <ChatSidebarData>{children}</ChatSidebarData>
    </Suspense>
  );
}

async function ChatSidebarData({ children }: { children: React.ReactNode }) {
  const { user: authUser } = await getAuthUser();
  let chats: Chat[] = [];
  let usageData: UsageData | null = null;
  let isGuest = false;

  if (authUser) {
    // Authenticated user path
    chats = await getSharedChats(authUser.id);
    usageData = await getSharedUsageData(authUser.id, authUser.role);
  } else {
    // Check for guest user
    const guestToken = await getGuestTokenFromCookies();
    if (guestToken) {
      const tokenHash = hashGuestToken(guestToken);
      const guestUser = await prisma.user.findFirst({
        where: {
          isGuest: true,
          guestAbuseIdHash: tokenHash,
          guestConvertedAt: null,
        },
        select: { id: true, role: true },
      });

      if (guestUser) {
        chats = await getSharedChats(guestUser.id);
        usageData = await getSharedUsageData(
          guestUser.id,
          guestUser.role as UserRole,
        );
        isGuest = true;
      }
    }
  }

  return (
    <LayoutClient
      initialChats={chats}
      initialUsageData={usageData}
      isGuest={isGuest}
    >
      {children}
    </LayoutClient>
  );
}
