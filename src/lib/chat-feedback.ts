import { z } from "zod";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";

export const FeedbackReasonSchema = z.enum([
  "linguistic_error",
  "wrong_fact",
  "context_missed",
  "too_generic",
  "tool_search_problem",
  "other",
]);

export const FeedbackSchema = z.object({
  messageId: z.string().min(1),
  feedback: z.number().int().min(-1).max(1),
  reason: FeedbackReasonSchema.optional(),
});

export type FeedbackReason = z.infer<typeof FeedbackReasonSchema>;
export type FeedbackInput = z.infer<typeof FeedbackSchema>;

export function getFeedbackReasonFromMetadata(
  metadata: unknown,
): FeedbackReason | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const feedback = (metadata as Record<string, unknown>).feedback;
  if (!feedback || typeof feedback !== "object" || Array.isArray(feedback)) {
    return undefined;
  }

  const reason = (feedback as Record<string, unknown>).reason;
  const parsedReason = FeedbackReasonSchema.safeParse(reason);
  return parsedReason.success ? parsedReason.data : undefined;
}

export async function saveMessageFeedback({
  userId,
  input,
}: {
  userId: string;
  input: FeedbackInput;
}) {
  const message = await prisma.message.findFirst({
    where: {
      id: input.messageId,
      userId,
      role: "ASSISTANT",
    },
  });

  if (!message) return null;

  const metadata = buildFeedbackMetadata(
    message.metadata,
    input.feedback,
    input.reason,
  );

  await prisma.message.update({
    where: { id: input.messageId },
    data: {
      feedback: input.feedback,
      metadata,
    },
  });

  return {
    success: true as const,
    messageId: input.messageId,
    feedback: input.feedback,
    reason: input.reason,
  };
}

function buildFeedbackMetadata(
  metadata: unknown,
  feedback: number,
  reason: FeedbackReason | undefined,
): Prisma.InputJsonValue {
  const next =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};

  if (feedback === -1 && reason) {
    next.feedback = { reason };
  } else {
    delete next.feedback;
  }

  return next as Prisma.InputJsonValue;
}
