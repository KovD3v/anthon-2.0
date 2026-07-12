import { generateText, type ModelMessage } from "ai";
import type { Message } from "@/generated/prisma";
import {
  SUB_AGENT_MODEL_ID,
  subAgentModel,
} from "@/lib/ai/providers/openrouter";
import { getOpenRouterProviderOptionsForModel } from "@/lib/ai/providers/openrouter-routing";
import { trackSupportAiUsage } from "@/lib/ai/usage-meter";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { getTextFromParts } from "@/lib/utils/message-parts";

const contextLogger = createLogger("ai");
const MAX_MESSAGE_CHARS = 2_000;
const SUMMARY_WORD_LIMIT = 250;

type Turn = {
  user: Message;
  assistant: Message;
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
          where: { conversationThreadId },
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
        deletedAt: null,
        role: { in: ["USER", "ASSISTANT"] },
        ...(excludeMessageId ? { id: { not: excludeMessageId } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.max(policy.maxRawTurns * 8, 40),
    }),
  ]);

  const turns = toCompleteTurns(recentMessages.reverse());
  const selected = selectRecentTurns(turns, policy);
  const rawMessages = selected.flatMap((turn) => [turn.user, turn.assistant]);
  const oldestRaw = rawMessages[0];
  const summaryIsBeforeRaw =
    summary?.throughMessageCreatedAt && oldestRaw
      ? summary.throughMessageCreatedAt < oldestRaw.createdAt
      : Boolean(summary?.throughMessageId && rawMessages.length === 0);
  const messages: ModelMessage[] = [];

  if (summary && summaryIsBeforeRaw) {
    messages.push({
      role: "system",
      content: `[Riassunto del thread precedente]\n${summary.summary}`,
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

export async function refreshConversationThreadSummary(
  conversationThreadId: string,
  userId: string,
): Promise<void> {
  const existing = await prisma.conversationThreadSummary.findUnique({
    where: { conversationThreadId },
    select: { summary: true, throughMessageCreatedAt: true },
  });
  const messages = await prisma.message.findMany({
    where: {
      conversationThreadId,
      deletedAt: null,
      role: { in: ["USER", "ASSISTANT"] },
      ...(existing?.throughMessageCreatedAt
        ? { createdAt: { gt: existing.throughMessageCreatedAt } }
        : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  const turns = toCompleteTurns(messages);
  const chars = turns.reduce((total, turn) => total + turn.chars, 0);
  if (turns.length < 6 && chars < 8_000) return;

  const lastMessage = turns.at(-1)?.assistant;
  if (!lastMessage) return;
  const transcript = turns
    .flatMap((turn) => [turn.user, turn.assistant])
    .map(
      (message) =>
        `${message.role === "USER" ? "Utente" : "Assistente"}: ${contextText(message)}`,
    )
    .join("\n");
  const result = await generateText({
    model: subAgentModel,
    instructions: `Aggiorna un riassunto di un singolo thread di coaching. Mantieni obiettivi, decisioni, vincoli e richieste aperte. Non inventare dati. Scrivi in italiano, massimo ${SUMMARY_WORD_LIMIT} parole.`,
    prompt: `Riassunto precedente:\n${existing?.summary ?? "(nessuno)"}\n\nNuovi turni:\n${transcript}`,
    providerOptions: {
      openrouter: getOpenRouterProviderOptionsForModel(SUB_AGENT_MODEL_ID),
    },
  });
  await trackSupportAiUsage({
    userId,
    modelId: SUB_AGENT_MODEL_ID,
    usage: result.usage,
    providerMetadata: result.providerMetadata,
  });
  await prisma.conversationThreadSummary.upsert({
    where: { conversationThreadId },
    update: {
      summary: result.text,
      throughMessageId: lastMessage.id,
      throughMessageCreatedAt: lastMessage.createdAt,
      version: 1,
    },
    create: {
      conversationThreadId,
      summary: result.text,
      throughMessageId: lastMessage.id,
      throughMessageCreatedAt: lastMessage.createdAt,
    },
  });
}

function toCompleteTurns(messages: Message[]): Turn[] {
  const turns: Turn[] = [];
  let pendingUser: Message | undefined;
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

function contextText(message: Message): string {
  const text = getTextFromParts(message.parts);
  return text.length <= MAX_MESSAGE_CHARS
    ? text
    : `${text.slice(0, MAX_MESSAGE_CHARS - 14)}\n[truncated]`;
}

function toModelMessage(message: Message): ModelMessage {
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
    await refreshConversationThreadSummary(conversationThreadId, userId);
  } catch (error) {
    contextLogger.error(
      "thread_summary.refresh_failed",
      "Failed refreshing conversation thread summary",
      {
        error,
        conversationThreadId,
        userId,
      },
    );
  }
}
