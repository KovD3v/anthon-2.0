import {
  handleTelegramWebhookGet,
  handleTelegramWebhookPost,
} from "@/lib/channels/telegram/webhook-handler";

export const runtime = "nodejs";

export async function GET() {
  return handleTelegramWebhookGet();
}

export async function POST(request: Request) {
  return handleTelegramWebhookPost(request);
}
