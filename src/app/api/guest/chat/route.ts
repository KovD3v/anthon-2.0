import { handleGuestChatPost } from "@/lib/channels/web/guest-chat-route-handler";

export const maxDuration = 60;

export async function POST(request: Request) {
  return handleGuestChatPost(request);
}
