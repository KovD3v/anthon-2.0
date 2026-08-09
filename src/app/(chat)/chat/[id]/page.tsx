import { notFound } from "next/navigation";
import { PageWrapper } from "@/components/ui/page-wrapper";
import { getAuthUser } from "@/lib/auth";
import { getSharedChatWithRetry } from "@/lib/chat";
import { prisma } from "@/lib/db";
import { getGuestTokenFromCookies, hashGuestToken } from "@/lib/guest-auth";
import { convertGuestForAuthenticatedUser } from "@/lib/guest-conversion";
import { ChatConversationClient } from "./chat-conversation-client";

export const prefetch = "partial";

export default async function ChatConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let authUser = null;
  try {
    const result = await getAuthUser();
    authUser = result.user;
  } catch (_e) {
    // Auth might fail during static generation, which is fine
  }
  let userId = authUser?.id;

  // Layouts and pages render in parallel. The chat layout also starts guest
  // conversion so the sidebar is correct, but this page must await the same
  // server-side handoff before checking ownership or it can render a false 404
  // on the first navigation after signup.
  if (authUser) {
    await convertGuestForAuthenticatedUser(authUser.id, {
      canMutateCookies: false,
    });
  }

  // Handle guest user if not authenticated
  if (!userId) {
    const guestToken = await getGuestTokenFromCookies();
    if (guestToken) {
      const tokenHash = hashGuestToken(guestToken);
      const guestUser = await prisma.user.findFirst({
        where: {
          isGuest: true,
          guestTokenHash: tokenHash,
          guestConvertedAt: null,
        },
        select: { id: true },
      });
      if (guestUser) {
        userId = guestUser.id;
      }
    }
  }

  // Fetch chat data on the server
  // If no userId, use a placeholder - the loader handles public/private
  // access checks and retries a brief Neon read-after-write miss after chat
  // creation.
  const chatData = await getSharedChatWithRetry(id, userId || "anonymous");

  if (!chatData) {
    notFound();
  }

  return (
    <PageWrapper className="flex min-h-0 flex-1 flex-col">
      <div className="contents" data-testid="chat-conversation-shell">
        <div className="contents" data-testid="chat-conversation-content">
          <ChatConversationClient chatId={id} initialChatData={chatData} />
        </div>
      </div>
    </PageWrapper>
  );
}
