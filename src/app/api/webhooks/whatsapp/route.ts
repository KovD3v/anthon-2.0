import {
  handleWhatsAppWebhookGet,
  handleWhatsAppWebhookPost,
} from "@/lib/channels/whatsapp/webhook-handler";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleWhatsAppWebhookGet(request);
}

export async function POST(request: Request) {
  return handleWhatsAppWebhookPost(request);
}
