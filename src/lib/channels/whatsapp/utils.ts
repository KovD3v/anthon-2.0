import { createHmac } from "node:crypto";
import { LatencyLogger } from "@/lib/latency-logger";

export function verifySignature(request: Request, body: string): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true;

  const signature = request.headers.get("x-hub-signature-256");
  if (!signature) return false;

  const hash = createHmac("sha256", secret).update(body).digest("hex");
  const expectedSignature = `sha256=${hash}`;

  return signature === expectedSignature;
}

export function isConnectCommand(text: string) {
  const norm = text.trim().toLowerCase();
  return (
    norm === "/connect" ||
    norm === "collega" ||
    norm === "collega profilo" ||
    norm === "connect"
  );
}

export function getPublicAppUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function sendWhatsAppMessage(to: string, text: string) {
  if (process.env.WHATSAPP_DISABLE_SEND === "true") return;

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return;

  const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    console.error(
      "[WhatsApp] Send message failed:",
      res.status,
      await res.text(),
    );
  }
}

export async function sendWhatsAppVoice(
  to: string,
  audioBuffer: Buffer,
): Promise<boolean> {
  if (process.env.WHATSAPP_DISABLE_SEND === "true") return false;

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return false;

  return await LatencyLogger.measure("Voice: WhatsApp Send", async () => {
    try {
      const uploadUrl = `https://graph.facebook.com/v21.0/${phoneId}/media`;
      const formData = new FormData();
      formData.append("messaging_product", "whatsapp");
      formData.append(
        "file",
        new Blob([new Uint8Array(audioBuffer)], { type: "audio/mpeg" }),
        "voice.mp3",
      );

      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!uploadRes.ok) {
        console.error("[WhatsApp] Voice upload failed:", await uploadRes.text());
        return false;
      }

      const { id: mediaId } = (await uploadRes.json()) as { id: string };

      const sendUrl = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
      const sendRes = await fetch(sendUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "audio",
          audio: { id: mediaId },
        }),
      });

      if (!sendRes.ok) {
        console.error("[WhatsApp] Voice send failed:", await sendRes.text());
        return false;
      }

      return true;
    } catch (err) {
      console.error("[WhatsApp] sendWhatsAppVoice error:", err);
      return false;
    }
  });
}

export async function downloadWhatsAppMedia(
  mediaId: string,
): Promise<{ base64: string; mimeType: string } | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return null;

  try {
    const urlRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!urlRes.ok) return null;

    const { url, mime_type } = (await urlRes.json()) as {
      url: string;
      mime_type: string;
    };

    const binRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!binRes.ok) return null;

    const buffer = await binRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    return { base64, mimeType: mime_type };
  } catch (error) {
    console.error("[WhatsApp] Media download err:", error);
    return null;
  }
}
