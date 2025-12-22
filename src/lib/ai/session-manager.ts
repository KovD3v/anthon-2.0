import { generateText, type ModelMessage } from "ai";
import type { Message } from "@/generated/prisma/client";
import { SESSION } from "@/lib/ai/constants";
import { subAgentModel } from "@/lib/ai/providers/openrouter";
import { cacheSummary, getCachedSummary } from "@/lib/ai/session-cache";
import { prisma } from "@/lib/db";

// Define a subset of Message that we actually need for context building
// This allows us to use `select` in Prisma to avoid fetching large JSON fields
type ContextMessage = Pick<
  Message,
  "id" | "role" | "content" | "createdAt" | "userId"
>;

interface Session {
  messages: ContextMessage[];
  startTime: Date;
  endTime: Date;
  userMessageCount: number;
}

/**
 * Groups messages into sessions based on time gaps.
 * A new session starts when there's more than 15 minutes between consecutive messages.
 */
function groupMessagesIntoSessions(messages: ContextMessage[]): Session[] {
  if (messages.length === 0) return [];

  const sessions: Session[] = [];
  let currentSession: ContextMessage[] = [messages[0]];

  for (let i = 1; i < messages.length; i++) {
    const prevTime = new Date(messages[i - 1].createdAt).getTime();
    const currTime = new Date(messages[i].createdAt).getTime();

    if (currTime - prevTime > SESSION.GAP_MS) {
      // Start a new session
      sessions.push(createSession(currentSession));
      currentSession = [messages[i]];
    } else {
      currentSession.push(messages[i]);
    }
  }

  // Don't forget the last session
  if (currentSession.length > 0) {
    sessions.push(createSession(currentSession));
  }

  return sessions;
}

function createSession(messages: ContextMessage[]): Session {
  return {
    messages,
    startTime: new Date(messages[0].createdAt),
    endTime: new Date(messages[messages.length - 1].createdAt),
    userMessageCount: messages.filter((m) => m.role === "USER").length,
  };
}

/**
 * Generates an on-demand summary of a session using Gemini sub-agent.
 * Uses database-backed cache to persist across serverless cold starts.
 */
async function summarizeSession(
  userId: string,
  session: Session,
): Promise<string> {
  // Generate a unique ID for this session based on start/end times
  const sessionId = `${userId}_${session.startTime.getTime()}_${session.endTime.getTime()}`;

  // Check database cache first
  const cached = await getCachedSummary(sessionId);
  if (cached) {
    return cached;
  }

  const conversationText = session.messages
    .map((m) => {
      const role = m.role === "USER" ? "Utente" : "Assistente";
      return `${role}: ${m.content || "[media]"}`;
    })
    .join("\n");

  const { text } = await generateText({
    model: subAgentModel,
    system: `Sei un assistente che crea riassunti concisi di conversazioni. 
Estrai i punti chiave, le richieste dell'utente, le risposte importanti e qualsiasi informazione rilevante.
Il riassunto deve essere in italiano e non superare 200 parole.
Mantieni il contesto importante per continuare la conversazione.`,
    prompt: `Riassumi questa conversazione:\n\n${conversationText}`,
  });

  // Cache the summary in database
  await cacheSummary(userId, sessionId, text);

  return text;
}

/**
 * Converts a Message from database to ModelMessage for AI SDK.
 */
function toModelMessage(message: ContextMessage): ModelMessage {
  const role =
    message.role === "USER"
      ? "user"
      : message.role === "ASSISTANT"
        ? "assistant"
        : "system";

  return {
    role,
    content: message.content || "",
  } as ModelMessage;
}

/**
 * Builds the conversation context for the orchestrator.
 *
 * Logic:
 * 1. Fetch recent messages for the user (limited to prevent loading entire history)
 * 2. Group into sessions (15min gap = new session)
 * 3. Start from the most recent session and work backwards
 * 4. Include complete sessions (never cut mid-session)
 * 5. If a session exceeds 25 user messages, summarize it on-demand
 * 6. Stop when we reach 50 total messages cap
 * 7. If the last session is very short (< 3 messages) and seems like an error,
 *    include previous session(s) as context
 */
export async function buildConversationContext(
  userId: string,
  maxContextMessages: number = SESSION.MAX_CONTEXT_MESSAGES,
): Promise<ModelMessage[]> {
  // Fetch recent messages for the user (limited for scalability)
  // Ordered desc, then reversed to get chronological order
  // Optimization: Select only fields needed for context building to avoid fetching large JSON fields
  const recentMessages = await prisma.message
    .findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: SESSION.RECENT_MESSAGES_LIMIT,
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
        userId: true,
      },
    })
    .then((msgs) => msgs.reverse());

  if (recentMessages.length === 0) {
    return [];
  }

  // Group into sessions
  const sessions = groupMessagesIntoSessions(recentMessages);

  if (sessions.length === 0) {
    return [];
  }

  const contextMessages: ModelMessage[] = [];
  let totalMessageCount = 0;

  // Process sessions from most recent to oldest
  for (let i = sessions.length - 1; i >= 0; i--) {
    const session = sessions[i];

    // Check if adding this session would exceed the cap
    if (
      totalMessageCount + session.messages.length > maxContextMessages &&
      totalMessageCount > 0
    ) {
      // We can't add this full session, stop here
      break;
    }

    // Check if this session needs summarization (too many user messages)
    if (session.userMessageCount > SESSION.MAX_USER_MESSAGES_PER_SESSION) {
      // Generate session ID for cache lookup
      const sessionId = `${userId}_${session.startTime.getTime()}_${session.endTime.getTime()}`;

      // Check cache first (fast path - no blocking)
      const cachedSummary = await getCachedSummary(sessionId);

      if (cachedSummary) {
        // Cache hit: use the cached summary
        contextMessages.unshift({
          role: "system",
          content: `[Riassunto della sessione precedente (${session.startTime.toLocaleDateString(
            "it-IT",
          )})]: ${cachedSummary}`,
        } as ModelMessage);
        totalMessageCount += 1;
      } else {
        // Cache miss: trigger background summarization for next time
        // Fire-and-forget - don't await
        summarizeSession(userId, session).catch((err) => {
          console.error("Background summarization failed:", err);
        });

        // Use quick fallback: include only the last few messages from this session
        const recentFromSession = session.messages.slice(
          -SESSION.FALLBACK_RECENT_MESSAGES,
        );
        const fallbackMessages = recentFromSession.map(toModelMessage);
        contextMessages.unshift(...fallbackMessages);
        totalMessageCount += fallbackMessages.length;
      }
    } else {
      // Add all messages from this session
      const sessionModelMessages = session.messages.map(toModelMessage);
      contextMessages.unshift(...sessionModelMessages);
      totalMessageCount += session.messages.length;
    }

    // Special case: if we only have the last session and it's very short,
    // try to include more context from previous sessions
    if (
      i === sessions.length - 1 &&
      session.messages.length < 3 &&
      sessions.length > 1
    ) {
      // Continue to include previous sessions
      continue;
    }

    // If we've reached a reasonable amount of context, we can stop
    // (but always include at least the current session)
    if (
      totalMessageCount >= maxContextMessages / 2 &&
      i < sessions.length - 1
    ) {
      break;
    }
  }

  return contextMessages;
}

/**
 * Gets the timestamp of the last message for a user.
 * Useful for determining if we're in an active session.
 */
async function getLastMessageTime(userId: string): Promise<Date | null> {
  const lastMessage = await prisma.message.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  return lastMessage?.createdAt ?? null;
}

/**
 * Checks if the user is currently in an active session.
 * Returns true if the last message was within 15 minutes.
 */
async function _isInActiveSession(userId: string): Promise<boolean> {
  const lastMessageTime = await getLastMessageTime(userId);
  if (!lastMessageTime) return false;

  const now = Date.now();
  const lastTime = new Date(lastMessageTime).getTime();

  return now - lastTime < SESSION.GAP_MS;
}
