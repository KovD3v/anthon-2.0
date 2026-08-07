import {
  handleWhatsAppWebhookGet,
  handleWhatsAppWebhookPost,
} from "@/lib/channels/whatsapp/webhook-handler";

export async function GET(request: Request) {
  return handleWhatsAppWebhookGet(request);
}

export async function POST(request: Request) {
  return handleWhatsAppWebhookPost(request);
}
