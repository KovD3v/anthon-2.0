/**
 * Message Feedback API
 *
 * Allows users to provide thumbs up/down feedback on AI messages.
 */

import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const FeedbackSchema = z.object({
  messageId: z.string().min(1),
  feedback: z.number().int().min(-1).max(1), // -1, 0, or 1
});

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
  let body: z.infer<typeof FeedbackSchema>;
  try {
    const rawBody = await request.json();
    body = FeedbackSchema.parse(rawBody);
  } catch (_error) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Verify message ownership and that it's an assistant message
  const message = await prisma.message.findFirst({
    where: {
      id: body.messageId,
      userId: user.id,
      role: "ASSISTANT",
    },
  });

  if (!message) {
    return Response.json(
      { error: "Message not found or cannot receive feedback" },
      { status: 404 },
    );
  }

  // Update feedback
  await prisma.message.update({
    where: { id: body.messageId },
    data: { feedback: body.feedback },
  });

  return Response.json({
    success: true,
    messageId: body.messageId,
    feedback: body.feedback,
  });
}
