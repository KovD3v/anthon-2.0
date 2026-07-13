/**
 * Guest Message Feedback API
 *
 * Allows a guest to rate assistant messages from their own chat.
 */

import {
  type FeedbackInput,
  FeedbackSchema,
  saveMessageFeedback,
} from "@/lib/chat-feedback";
import { getExistingGuestUser } from "@/lib/guest-auth";

export async function POST(request: Request) {
  const user = await getExistingGuestUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: FeedbackInput;
  try {
    body = FeedbackSchema.parse(await request.json());
  } catch {
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
