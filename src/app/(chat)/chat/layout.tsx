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
    <Suspense fallback={<ChatLayoutSkeleton />}>
      <ChatSidebarData>{children}</ChatSidebarData>
    </Suspense>
  );
}

function ChatLayoutSkeleton() {
  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-72 shrink-0 overflow-hidden border-r border-border/50 bg-background/80 backdrop-blur-xl dark:border-white/10 dark:bg-muted/40 md:block">
        <SidebarSkeleton />
      </aside>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top)]">
        <div className="mx-2 mt-2 md:mx-4 md:mt-4">
          <div className="flex h-12 items-center gap-3 rounded-2xl border border-border/50 bg-background/60 px-3 shadow-sm backdrop-blur-xl sm:h-14 sm:px-4 dark:border-white/10">
            <div className="h-8 w-8 animate-pulse rounded-md bg-muted/40 md:hidden" />
            <div className="h-3 w-44 animate-pulse rounded bg-muted/35" />
            <div className="ml-auto h-7 w-20 animate-pulse rounded-xl bg-muted/30" />
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col bg-linear-to-b from-background to-muted/20">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-primary/5 via-background/0 to-background/0" />

          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="mx-auto max-w-3xl space-y-6">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 animate-pulse rounded-full bg-muted/45" />
                <div className="space-y-2 rounded-2xl rounded-tl-sm border border-white/10 bg-background/60 px-5 py-3.5">
                  <div className="h-3 w-52 animate-pulse rounded bg-muted/35" />
                  <div className="h-3 w-40 animate-pulse rounded bg-muted/30" />
                </div>
              </div>
              <div className="flex flex-row-reverse items-start gap-3">
                <div className="h-8 w-8 animate-pulse rounded-full bg-primary/25" />
                <div className="space-y-2 rounded-2xl rounded-tr-sm bg-primary/20 px-5 py-3.5">
                  <div className="h-3 w-44 animate-pulse rounded bg-muted/35" />
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto w-full max-w-3xl px-3 pb-6 pt-2 sm:px-4 sm:pb-8">
            <div className="flex items-end gap-2 rounded-4xl border border-white/10 bg-background/60 p-2 shadow-lg backdrop-blur-xl ring-1 ring-black/5 dark:bg-muted/40 dark:ring-white/10">
              <div className="h-9 w-9 animate-pulse rounded-full bg-muted/35" />
              <div className="h-9 w-9 animate-pulse rounded-full bg-muted/30" />
              <div className="h-10 flex-1 animate-pulse rounded-2xl bg-muted/30" />
              <div className="h-9 w-9 animate-pulse rounded-full bg-muted/45" />
            </div>
          </div>
        </div>
      </div>
    </div>
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
