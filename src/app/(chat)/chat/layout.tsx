import { Suspense } from "react";
import type { UserRole } from "@/generated/prisma";
import { getAuthUser } from "@/lib/auth";
import { getSharedChats } from "@/lib/chat";
import type { RoutineCardData } from "@/lib/coaching/routine";
import { isRoutineFeatureEnabled } from "@/lib/coaching/routine-feature";
import { getActiveRoutineForReturn } from "@/lib/coaching/routine-return.server";
import { getUserControlledCoachingGoal } from "@/lib/coaching-context";
import { prisma } from "@/lib/db";
import { getGuestTokenFromCookies, hashGuestToken } from "@/lib/guest-auth";
import { convertGuestForAuthenticatedUser } from "@/lib/guest-conversion";
import { createLogger } from "@/lib/logger";
import { getSharedUsageData } from "@/lib/usage";
import type { Chat, UsageData } from "@/types/chat";
import { SidebarSkeleton } from "../../(chat)/components/Skeletons";
import { type ChatSidebarHydrationData, LayoutClient } from "./layout-client";
import { SidebarDataHydrator } from "./sidebar-data-hydrator";

const chatLayoutLogger = createLogger("ai");

type AuthUser = NonNullable<Awaited<ReturnType<typeof getAuthUser>>["user"]>;

export type ChatSidebarIdentity = {
  authUser: AuthUser | null;
  guestUser: { id: string; role: UserRole } | null;
  guestConversionPending: boolean;
  isGuest: boolean;
};

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<ChatLayoutSkeleton />}>
      <ChatLayoutWithIdentity>{children}</ChatLayoutWithIdentity>
    </Suspense>
  );
}

async function ChatLayoutWithIdentity({
  children,
}: {
  children: React.ReactNode;
}) {
  const identity = await getChatSidebarIdentity();

  return (
    <LayoutClient
      initialChats={[]}
      initialUsageData={null}
      initialCoachingGoal={null}
      initialActiveRoutine={null}
      initialRoutinesEnabled={false}
      guestConversionPending={identity.guestConversionPending}
      isGuest={identity.isGuest}
      sidebarSlot={
        <Suspense fallback={null}>
          <ChatSidebarData identity={identity} />
        </Suspense>
      }
    >
      {children}
    </LayoutClient>
  );
}

function ChatLayoutSkeleton() {
  return (
    <div
      className="flex chat-mobile-viewport overflow-hidden overscroll-none"
      data-testid="chat-layout-shell"
    >
      <aside className="hidden w-72 shrink-0 overflow-hidden border-r border-border/50 bg-background/80 backdrop-blur-xl dark:border-white/10 dark:bg-muted/40 md:block">
        <SidebarSkeleton />
      </aside>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top)]">
        <div className="mx-2 mt-2 md:mx-4 md:mt-4">
          <div className="flex h-12 items-center gap-2 rounded-2xl border border-border/50 bg-background/60 px-3 shadow-sm backdrop-blur-xl sm:h-14 sm:px-4 dark:border-white/10">
            <div className="size-8 animate-pulse rounded-md bg-muted/40 md:hidden" />
            <div className="h-3 w-44 animate-pulse rounded bg-muted/35" />
            <div className="ml-auto h-7 w-20 animate-pulse rounded-xl bg-muted/30" />
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col bg-linear-to-b from-background to-muted/20">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-primary/5 via-background/0 to-background/0" />

          <div className="flex-1 overflow-y-auto overscroll-y-none px-4 py-6">
            <div className="mx-auto max-w-3xl space-y-6">
              <div className="flex items-start gap-2">
                <div className="size-8 animate-pulse rounded-full bg-muted/45" />
                <div className="space-y-2 rounded-2xl rounded-tl-sm bg-[#c4cd4c]/60 px-5 py-3.5">
                  <div className="h-3 w-52 animate-pulse rounded bg-muted/35" />
                  <div className="h-3 w-40 animate-pulse rounded bg-muted/30" />
                </div>
              </div>
              <div className="flex flex-row-reverse items-start gap-2">
                <div className="size-8 animate-pulse rounded-full bg-primary/25" />
                <div className="space-y-2 rounded-2xl rounded-tr-sm bg-primary/20 px-5 py-3.5">
                  <div className="h-3 w-44 animate-pulse rounded bg-muted/35" />
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto w-full max-w-3xl px-3 pb-6 pt-2 sm:px-4 sm:pb-8">
            <div className="flex items-end gap-2 rounded-4xl border border-border/70 bg-background/60 p-2 shadow-lg backdrop-blur-xl ring-1 ring-black/5 dark:border-white/10 dark:bg-muted/40 dark:ring-white/10">
              <div className="size-9 animate-pulse rounded-full bg-muted/35" />
              <div className="size-9 animate-pulse rounded-full bg-muted/30" />
              <div className="h-10 flex-1 animate-pulse rounded-2xl bg-muted/30" />
              <div className="size-9 animate-pulse rounded-full bg-muted/45" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function ChatSidebarData({
  identity,
}: {
  identity: ChatSidebarIdentity;
}) {
  const data = await getChatSidebarData(identity);

  return <SidebarDataHydrator data={data} />;
}

export async function getChatSidebarIdentity(): Promise<ChatSidebarIdentity> {
  const { user: authUser } = await getAuthUser();

  if (authUser) {
    const conversionOutcome = await convertGuestForAuthenticatedUser(
      authUser.id,
      { canMutateCookies: false },
    );

    return {
      authUser,
      guestUser: null,
      guestConversionPending: conversionOutcome !== "no_cookie",
      isGuest: false,
    };
  }

  const guestToken = await getGuestTokenFromCookies();
  if (!guestToken) {
    return {
      authUser: null,
      guestUser: null,
      guestConversionPending: false,
      isGuest: true,
    };
  }

  const tokenHash = hashGuestToken(guestToken);
  const guestUser = await prisma.user.findFirst({
    where: {
      isGuest: true,
      guestTokenHash: tokenHash,
      guestConvertedAt: null,
    },
    select: { id: true, role: true },
  });

  return {
    authUser: null,
    guestUser: guestUser
      ? { id: guestUser.id, role: guestUser.role as UserRole }
      : null,
    guestConversionPending: false,
    isGuest: true,
  };
}

export async function getChatSidebarData(
  identity?: ChatSidebarIdentity,
): Promise<ChatSidebarHydrationData> {
  const resolvedIdentity = identity ?? (await getChatSidebarIdentity());
  const { authUser, guestUser, guestConversionPending, isGuest } =
    resolvedIdentity;
  let chats: Chat[] = [];
  let usageData: UsageData | null = null;
  let coachingGoal: string | null = null;
  let activeRoutine: RoutineCardData | null = null;
  let routinesEnabled = false;

  if (authUser) {
    // Authenticated user path
    const sidebarData = await Promise.all([
      getSharedChats(authUser.id),
      getSharedUsageData(authUser.id, authUser.role),
      isRoutineFeatureEnabled({
        distinctId: authUser.clerkId,
        role: authUser.role,
        isGuest: authUser.isGuest,
      }),
      authUser.isGuest === false
        ? getActiveRoutineForReturn(authUser.id)
        : Promise.resolve(null),
      getUserControlledCoachingGoal(authUser.id).catch((error) => {
        chatLayoutLogger.warn(
          "coaching_goal.unavailable",
          "Failed to load coaching goal",
          { error },
        );
        return null;
      }),
    ]);

    [chats, usageData, routinesEnabled, activeRoutine, coachingGoal] =
      sidebarData;
  } else if (guestUser) {
    [routinesEnabled, chats, usageData] = await Promise.all([
      isRoutineFeatureEnabled({
        distinctId: guestUser.id,
        role: guestUser.role,
        isGuest: true,
      }),
      getSharedChats(guestUser.id),
      getSharedUsageData(guestUser.id, guestUser.role),
    ]);
  }

  return {
    chats,
    usageData,
    coachingGoal,
    activeRoutine,
    routinesEnabled,
    isGuest,
    guestConversionPending,
  };
}
