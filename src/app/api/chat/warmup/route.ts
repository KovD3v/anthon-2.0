import { waitUntil } from "@vercel/functions";
import { warmDatabaseConnection } from "@/lib/db";

export const runtime = "nodejs";

async function readBody(request: Request): Promise<{ chatId?: unknown }> {
  try {
    return (await request.json()) as { chatId?: unknown };
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const { chatId } = await readBody(request);

  if (typeof chatId !== "string" || chatId.trim().length === 0) {
    return Response.json(
      { error: "chatId must be a non-empty string" },
      { status: 400 },
    );
  }

  waitUntil(warmDatabaseConnection("chat_input_started"));

  return new Response(null, { status: 204 });
}
