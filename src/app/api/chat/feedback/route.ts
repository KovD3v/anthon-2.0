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
import {
  captureModelComparisonEvent,
  MODEL_COMPARISON_EVENTS,
} from "@/lib/model-experiments/analytics";

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

  const comparison = await prisma.modelExperimentPair.findUnique({
    where: { canonicalMessageId: body.messageId },
    select: { id: true, experimentId: true, countryCode: true },
  });
  if (comparison) {
    captureModelComparisonEvent(
      MODEL_COMPARISON_EVENTS.canonicalFeedback,
      clerkId,
      {
        experiment_id: comparison.experimentId,
        pair_id: comparison.id,
        country: comparison.countryCode,
        feedback: body.feedback,
        reason: body.reason ?? null,
      },
    );
  }

  return Response.json(result);
}
