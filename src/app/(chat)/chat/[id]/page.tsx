import { notFound } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { getSharedChat } from "@/lib/chat";
import { prisma } from "@/lib/db";
import { getGuestTokenFromCookies, hashGuestToken } from "@/lib/guest-auth";
import { ChatConversationClient } from "./chat-conversation-client";

export async function generateStaticParams() {
	const publicChats = await prisma.chat.findMany({
		where: { visibility: "PUBLIC" },
		select: { id: true },
		take: 100, // Pre-render top 100 public chats
	});

	return publicChats.map((chat) => ({
		id: chat.id,
	}));
}

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

	// Handle guest user if not authenticated
	if (!userId) {
		const guestToken = await getGuestTokenFromCookies();
		if (guestToken) {
			const tokenHash = hashGuestToken(guestToken);
			const guestUser = await prisma.user.findFirst({
				where: {
					isGuest: true,
					guestAbuseIdHash: tokenHash,
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
	// If no userId, use a placeholder - getSharedChat handles public/private access checks
	const chatData = await getSharedChat(id, userId || "anonymous");

	if (!chatData) {
		notFound();
	}

	return <ChatConversationClient chatId={id} initialChatData={chatData} />;
}
