/**
 * Message Feedback API
 *
 * Allows users to provide thumbs up/down feedback on AI messages.
 */

import { auth } from "@clerk/nextjs/server";
import {
  type FeedbackInput,
  FeedbackSchema,
  saveMessageFeedback,
} from "@/lib/chat-feedback";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user
  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  // Parse and validate body
  let body: FeedbackInput;
  try {
    const rawBody = await request.json();
    body = FeedbackSchema.parse(rawBody);
  } catch (_error) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const result = await saveMessageFeedback({ userId: user.id, input: body });

  if (!result) {
    return Response.json(
      { error: "Message not found or cannot receive feedback" },
      { status: 404 },
    );
  }

  return Response.json(result);
}
