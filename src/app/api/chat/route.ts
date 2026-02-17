import { handleWebChatPost } from "@/lib/channels/web/chat-route-handler";

export const maxDuration = 60;

export async function POST(request: Request) {
  return handleWebChatPost(request);
}
