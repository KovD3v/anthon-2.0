import { waitUntil } from "@vercel/functions";
import { getAuthUser } from "@/lib/auth";
import { handleWebChatPost } from "@/lib/channels/web/chat-route-handler";
import { warmDatabaseConnection } from "@/lib/db";
import {
  isOnboardingRequired,
  onboardingRequiredResponse,
} from "@/lib/onboarding/gate";

export const maxDuration = 60;

export async function POST(request: Request) {
  return handleWebChatPost(request);
}

async function readWarmupBody(request: Request): Promise<{ chatId?: unknown }> {
  try {
    return (await request.json()) as { chatId?: unknown };
  } catch {
    return {};
  }
}

export async function PUT(request: Request) {
  const { user } = await getAuthUser();
  if (isOnboardingRequired(user)) return onboardingRequiredResponse("/chat");
  const { chatId } = await readWarmupBody(request);

  if (typeof chatId !== "string" || chatId.trim().length === 0) {
    return Response.json(
      { error: "chatId must be a non-empty string" },
      { status: 400 },
    );
  }

  waitUntil(warmDatabaseConnection("chat_input_started"));
  return new Response(null, { status: 204 });
}
