import { generateText, type ModelMessage } from "ai";
import type { Message, Prisma } from "@/generated/prisma";
import { recordAiOperationFailure } from "@/lib/ai/cost-attribution";
import {
  SUB_AGENT_MODEL_ID,
  subAgentModel,
} from "@/lib/ai/providers/openrouter";
import { getOpenRouterProviderOptionsForModel } from "@/lib/ai/providers/openrouter-routing";
import { lockThreadSummaries } from "@/lib/ai/thread-summary-lifecycle";
import { trackSupportAiUsage } from "@/lib/ai/usage-meter";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { publishToQueue } from "@/lib/qstash";
import { getTextFromParts } from "@/lib/utils/message-parts";

const contextLogger = createLogger("ai");
const MAX_MESSAGE_CHARS = 2_000;
const SUMMARY_WORD_LIMIT = 250;
const SUMMARY_BATCH_MESSAGES = 40;
const MAX_SUMMARY_TRANSCRIPT_CHARS = 24_000;
const MAX_SUMMARY_CHARS = 4_000;
const MAX_SUMMARY_OUTPUT_TOKENS = 768;
const SUMMARY_TIMEOUT_MS = 45_000;

const messageSelect = {
  id: true,
  role: true,
  parts: true,
  createdAt: true,
} as const;

const summarySelect = {
  id: true,
  version: true,
  summary: true,
  throughMessageId: true,
  throughMessageCreatedAt: true,
} as const;

type SummarySnapshot = Prisma.ConversationThreadSummaryGetPayload<{
  select: typeof summarySelect;
}>;

type Checkpoint = { id: string; createdAt: Date };

export type ThreadSummaryJob = {
  conversationThreadId: string;
  userId: string;
  continuation?: {
    summaryId: string | null;
    version: number;
    // A separate scan cursor lets a bounded job cross orphan/incomplete rows
    // without claiming that they were included in the summary.
    after?: { id: string; createdAt: string };
    pendingUserId?: string;
  };
};

const activeThreadWhere: Prisma.ConversationThreadWhereInput = {
  user: { deletedAt: null },
  OR: [{ chatId: null }, { chat: { deletedAt: null } }],
};

type ContextMessage = Pick<Message, "id" | "role" | "parts" | "createdAt">;

type Turn = {
  user: ContextMessage;
  assistant: ContextMessage;
  chars: number;
};

export type ThreadContextPolicy = {
  includeSummary: boolean;
  maxRawTurns: number;
  maxRawChars: number;
};

export type ThreadContext = {
  messages: ModelMessage[];
  includedMessageIds: string[];
  rawTurnCount: number;
  rawChars: number;
  summaryMessageId?: string;
};

export async function buildThreadContext(
  conversationThreadId: string,
  policy: ThreadContextPolicy,
  excludeMessageId?: string,
): Promise<ThreadContext> {
  if (policy.maxRawTurns <= 0 || policy.maxRawChars <= 0) {
    return {
      messages: [],
      includedMessageIds: [],
      rawTurnCount: 0,
      rawChars: 0,
    };
  }

  const [summary, recentMessages] = await Promise.all([
    policy.includeSummary
      ? prisma.conversationThreadSummary.findUnique({
          where: {
            conversationThreadId,
            conversationThread: activeThreadWhere,
          },
          select: {
            summary: true,
            throughMessageId: true,
            throughMessageCreatedAt: true,
          },
        })
      : Promise.resolve(null),
    prisma.message.findMany({
      where: {
        conversationThreadId,
        conversationThread: activeThreadWhere,
        deletedAt: null,
        role: { in: ["USER", "ASSISTANT"] },
        ...(excludeMessageId ? { id: { not: excludeMessageId } } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: Math.max(policy.maxRawTurns * 8, 40),
      select: messageSelect,
    }),
  ]);

  const turns = toCompleteTurns(recentMessages.reverse());
  const selected = selectRecentTurns(turns, policy);
  const rawMessages = selected.flatMap((turn) => [turn.user, turn.assistant]);
  const oldestRaw = rawMessages[0];
  const checkpointIsInRaw = rawMessages.some(
    (message) => message.id === summary?.throughMessageId,
  );
  // Check the source still exists, and compare ties in the database's ordering
  // rather than relying on the JavaScript locale's string comparison.
  const summaryIsBeforeRaw = Boolean(
    summary?.throughMessageId &&
      summary.throughMessageCreatedAt &&
      !checkpointIsInRaw &&
      (!oldestRaw || summary.throughMessageCreatedAt <= oldestRaw.createdAt) &&
      (await prisma.message.findFirst({
        where: {
          id: summary.throughMessageId,
          createdAt: summary.throughMessageCreatedAt,
          conversationThreadId,
          deletedAt: null,
          ...(oldestRaw
            ? {
                OR: [
                  { createdAt: { lt: oldestRaw.createdAt } },
                  {
                    createdAt: oldestRaw.createdAt,
                    id: { lt: oldestRaw.id },
                  },
                ],
              }
            : {}),
        },
        select: { id: true },
      })),
  );
  const messages: ModelMessage[] = [];

  if (summary && summaryIsBeforeRaw) {
    messages.push({
      role: "system",
      content: `[Riassunto del thread precedente]\n${summary.summary.slice(0, MAX_SUMMARY_CHARS)}`,
    } as ModelMessage);
  }
  messages.push(...rawMessages.map(toModelMessage));

  return {
    messages,
    includedMessageIds: rawMessages.map((message) => message.id),
    rawTurnCount: selected.length,
    rawChars: selected.reduce((total, turn) => total + turn.chars, 0),
    ...(summary && summaryIsBeforeRaw && summary.throughMessageId
      ? { summaryMessageId: summary.throughMessageId }
      : {}),
  };
}

/** One model call at most. QStash deliveries continue a backlog in bounded jobs. */
export async function processThreadSummaryJob(job: ThreadSummaryJob) {
  const { conversationThreadId, userId, continuation } = job;
  const ownerWhere: Prisma.ConversationThreadWhereInput = {
    id: conversationThreadId,
    userId,
    user: { deletedAt: null },
    OR: [{ chatId: null }, { chat: { userId, deletedAt: null } }],
  };
  if (
    !(await prisma.conversationThread.findFirst({
      where: ownerWhere,
      select: { id: true },
    }))
  ) {
    return "unavailable";
  }
  const existing = await prisma.conversationThreadSummary.findUnique({
    where: { conversationThreadId },
    select: summarySelect,
  });
  const sourceWhere = {
    conversationThreadId,
    userId,
    deletedAt: null,
  };
  const checkpoint =
    existing?.throughMessageId && existing.throughMessageCreatedAt
      ? await prisma.message.findFirst({
          where: {
            ...sourceWhere,
            id: existing.throughMessageId,
            createdAt: existing.throughMessageCreatedAt,
            role: "ASSISTANT",
          },
          select: { id: true, createdAt: true },
        })
      : null;
  // A missing/legacy checkpoint cannot prove that the previous summary's
  // sources survive. Rebuild from the remaining messages instead of reusing it.
  let after: Checkpoint | null = checkpoint;
  let pendingUser: ContextMessage | null = null;
  if (
    continuation?.after &&
    continuation.summaryId === (existing?.id ?? null) &&
    continuation.version === (existing?.version ?? 0)
  ) {
    const scanCheckpoint = await prisma.message.findFirst({
      where: {
        ...sourceWhere,
        id: continuation.after.id,
        createdAt: new Date(continuation.after.createdAt),
        ...(checkpoint ? afterCheckpoint(checkpoint) : {}),
      },
      select: { id: true, createdAt: true },
    });
    if (scanCheckpoint) {
      after = scanCheckpoint;
      if (continuation.pendingUserId) {
        pendingUser = await prisma.message.findFirst({
          where: {
            ...sourceWhere,
            id: continuation.pendingUserId,
            role: "USER",
            ...(checkpoint ? afterCheckpoint(checkpoint) : {}),
          },
          select: messageSelect,
        });
      }
    }
  }
  const messages = await prisma.message.findMany({
    where: {
      ...sourceWhere,
      role: { in: ["USER", "ASSISTANT"] },
      ...(after ? afterCheckpoint(after) : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: SUMMARY_BATCH_MESSAGES,
    select: messageSelect,
  });
  const candidates = pendingUser ? [pendingUser, ...messages] : messages;
  const turns = selectSummaryTurns(toCompleteTurns(candidates));
  const chars = turns.reduce((total, turn) => total + turn.chars, 0);
  const lastMessage = turns.at(-1)?.assistant;
  if (!lastMessage) {
    const scanEnd = messages.at(-1);
    if (scanEnd && messages.length === SUMMARY_BATCH_MESSAGES) {
      await continueSummary(job, existing, {
        after: { id: scanEnd.id, createdAt: scanEnd.createdAt.toISOString() },
        ...(scanEnd.role === "USER" ? { pendingUserId: scanEnd.id } : {}),
      });
      return "continued";
    }
    return "unchanged";
  }
  if (
    !continuation &&
    messages.length < SUMMARY_BATCH_MESSAGES &&
    turns.length < 6 &&
    chars < 8_000
  ) {
    return "unchanged";
  }
  const transcript = turns.map(turnTranscript).join("\n");
  const result = await generateText({
    model: subAgentModel,
    instructions: `Aggiorna un riassunto di un singolo thread di coaching. Mantieni obiettivi, decisioni, vincoli e richieste aperte. Non inventare dati. Scrivi in italiano, massimo ${SUMMARY_WORD_LIMIT} parole.`,
    prompt: `Riassunto precedente:\n${checkpoint ? existing?.summary.slice(0, MAX_SUMMARY_CHARS) : "(nessuno)"}\n\nNuovi turni:\n${transcript}`,
    maxOutputTokens: MAX_SUMMARY_OUTPUT_TOKENS,
    abortSignal: AbortSignal.timeout(SUMMARY_TIMEOUT_MS),
    providerOptions: {
      openrouter: getOpenRouterProviderOptionsForModel(SUB_AGENT_MODEL_ID),
    },
  }).catch(async (error: unknown) => {
    await recordAiOperationFailure("thread_summary", SUB_AGENT_MODEL_ID, error);
    throw error;
  });
  await trackSupportAiUsage({
    operation: "thread_summary",
    userId,
    modelId: SUB_AGENT_MODEL_ID,
    usage: result.usage,
    providerMetadata: result.providerMetadata,
  });
  const committed = await prisma.$transaction(async (tx) => {
    await lockThreadSummaries(tx, [conversationThreadId]);
    if (
      !(await tx.conversationThread.findFirst({
        where: ownerWhere,
        select: { id: true },
      }))
    ) {
      return null;
    }
    const current = await tx.conversationThreadSummary.findUnique({
      where: { conversationThreadId },
      select: { id: true, version: true },
    });
    if (
      current?.id !== existing?.id ||
      current?.version !== existing?.version
    ) {
      return null;
    }
    const sourceIds = turns.flatMap((turn) => [
      turn.user.id,
      turn.assistant.id,
    ]);
    if (checkpoint) sourceIds.push(checkpoint.id);
    if (
      (await tx.message.count({
        where: { ...sourceWhere, id: { in: sourceIds } },
      })) !== sourceIds.length
    ) {
      return null;
    }
    const data = {
      summary: result.text.trim().slice(0, MAX_SUMMARY_CHARS),
      throughMessageId: lastMessage.id,
      throughMessageCreatedAt: lastMessage.createdAt,
    };
    if (existing) {
      const updated = await tx.conversationThreadSummary.updateMany({
        where: { id: existing.id, version: existing.version },
        data: { ...data, version: { increment: 1 } },
      });
      return updated.count === 1
        ? { id: existing.id, version: existing.version + 1 }
        : null;
    }
    // The parent-thread lock also serializes concurrent first creation. The
    // unique thread key remains the database backstop; there is no upsert that
    // could overwrite another worker's newly created summary.
    return tx.conversationThreadSummary.create({
      data: { ...data, conversationThreadId },
      select: { id: true, version: true },
    });
  });
  if (!committed) return "stale";

  if (
    messages.length === SUMMARY_BATCH_MESSAGES ||
    lastMessage.id !== messages.at(-1)?.id
  ) {
    await continueSummary(job, committed);
  }
  return "updated";
}

function afterCheckpoint(checkpoint: Checkpoint): Prisma.MessageWhereInput {
  return {
    OR: [
      { createdAt: { gt: checkpoint.createdAt } },
      { createdAt: checkpoint.createdAt, id: { gt: checkpoint.id } },
    ],
  };
}

async function continueSummary(
  job: ThreadSummaryJob,
  snapshot: Pick<SummarySnapshot, "id" | "version"> | null,
  scan: Pick<
    NonNullable<ThreadSummaryJob["continuation"]>,
    "after" | "pendingUserId"
  > = {},
) {
  const continuation = {
    summaryId: snapshot?.id ?? null,
    version: snapshot?.version ?? 0,
    ...scan,
  };
  await publishToQueue(
    "api/queues/thread-summary",
    {
      conversationThreadId: job.conversationThreadId,
      userId: job.userId,
      continuation,
    } satisfies ThreadSummaryJob,
    {
      retries: 3,
      deduplicationId: `thread-summary-${job.conversationThreadId}-${continuation.summaryId ?? "initial"}-${continuation.version}-${scan.after?.id ?? "next"}`,
    },
  );
}

function turnTranscript(turn: Turn) {
  return `Utente: ${contextText(turn.user)}\nAssistente: ${contextText(turn.assistant)}`;
}

function selectSummaryTurns(turns: Turn[]): Turn[] {
  const selected: Turn[] = [];
  let chars = 0;
  for (const turn of turns) {
    const nextChars = turnTranscript(turn).length + (selected.length ? 1 : 0);
    if (chars + nextChars > MAX_SUMMARY_TRANSCRIPT_CHARS) break;
    selected.push(turn);
    chars += nextChars;
  }
  return selected;
}

function toCompleteTurns(messages: ContextMessage[]): Turn[] {
  const turns: Turn[] = [];
  let pendingUser: ContextMessage | undefined;
  for (const message of messages) {
    if (message.role === "USER") {
      pendingUser = message;
      continue;
    }
    if (message.role === "ASSISTANT" && pendingUser) {
      turns.push({
        user: pendingUser,
        assistant: message,
        chars: contextText(pendingUser).length + contextText(message).length,
      });
      pendingUser = undefined;
    }
  }
  return turns;
}

function selectRecentTurns(turns: Turn[], policy: ThreadContextPolicy): Turn[] {
  const selected: Turn[] = [];
  let chars = 0;
  for (let index = turns.length - 1; index >= 0; index--) {
    const turn = turns[index];
    if (selected.length >= policy.maxRawTurns) break;
    if (selected.length > 0 && chars + turn.chars > policy.maxRawChars) break;
    selected.unshift(turn);
    chars += turn.chars;
  }
  return selected;
}

function contextText(message: ContextMessage): string {
  const text = getTextFromParts(message.parts);
  return text.length <= MAX_MESSAGE_CHARS
    ? text
    : `${text.slice(0, MAX_MESSAGE_CHARS - 14)}\n[truncated]`;
}

function toModelMessage(message: ContextMessage): ModelMessage {
  return {
    role: message.role === "USER" ? "user" : "assistant",
    content: contextText(message),
  } as ModelMessage;
}

export async function safelyRefreshConversationThreadSummary(
  conversationThreadId: string,
  userId: string,
) {
  try {
    await processThreadSummaryJob({ conversationThreadId, userId });
  } catch (error) {
    contextLogger.error(
      "thread_summary.refresh_failed",
      "Failed refreshing conversation thread summary",
      {
        errorName: error instanceof Error ? error.name : "unknown",
        conversationThreadId,
        userId,
      },
    );
  }
}
