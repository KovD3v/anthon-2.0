const EXACT_STABLE_MEMORY_KEY = /^[a-z][a-z0-9_]{0,127}$/;

const EXPLICIT_FORGET =
  /\b(?:dimentica|forget)\b[^.!?]{0,100}(?:\bche\b|\b(?:questa|questo|quella|quello|this|that)\s+(?:memoria|ricordo|dato|informazione|preferenza|fatto|memory|fact|preference)\b|\b(?:la mia|il mio|le mie|i miei|my)\b|\b(?:memoria|ricordo|dato|informazione|profilo|preferenza|fatto|memory|fact|preference|profile)\b)|\b(?:cancella|elimina|rimuovi|delete|remove)\b[^.!?]{0,100}\b(?:memoria|ricordo|dato|informazione|profilo|preferenza|fatto|memory|fact|preference|profile)\b/i;
const ANAPHORIC_FORGET =
  /^\s*(?:per favore\s+|please\s+)?(?:dimentica|forget)\s+(?:questa|questo|quella|quello|this|that)(?:\s+(?:cosa|memoria|ricordo|dato|informazione|preferenza|fatto|thing|memory|fact|information|preference))?\s*[.!?]*\s*$/i;
const NON_TARGET_WORDS = new Set([
  "che",
  "questa",
  "questo",
  "quella",
  "quello",
  "cosa",
  "dato",
  "dati",
  "informazione",
  "informazioni",
  "memoria",
  "ricordo",
  "ricordi",
  "profilo",
  "mia",
  "mio",
  "mie",
  "miei",
  "dimentica",
  "cancella",
  "elimina",
  "rimuovi",
  "forget",
  "delete",
  "remove",
  "the",
  "this",
  "that",
  "about",
]);
const CATEGORY_ALIASES: Record<string, string[]> = {
  identity: ["identita", "nome"],
  sport: ["sport", "disciplina"],
  goal: ["goal", "obiettivo"],
  preference: ["preferenza", "preferisco"],
  health: ["salute", "infortunio", "dolore"],
  diagnosis: ["diagnosi", "patologia"],
  trauma: ["trauma", "traumatico"],
  intimate: ["intimo", "intima"],
  schedule: ["orario", "programma", "allenamento"],
  conversation_topic: ["argomento", "tema"],
};
const BROAD_STABLE_KEYS = new Set([
  "all",
  "identity",
  "sport",
  "goal",
  "preference",
  "health",
  "diagnosis",
  "trauma",
  "intimate",
  "schedule",
  "conversation_topic",
  "other",
]);

export function isExactStableMemoryKey(target: unknown): target is string {
  return typeof target === "string" && EXACT_STABLE_MEMORY_KEY.test(target);
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it-IT");
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !NON_TARGET_WORDS.has(token));
}

function memoryContent(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const content = (value as Record<string, unknown>).content;
    if (typeof content === "string") return content;
  }
  return typeof value === "string" ? value : "";
}

function compactText(value: string) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasStrongContextMatch(content: string, context: string) {
  const compactContent = compactText(content);
  if (!compactContent) return false;

  const compactContext = compactText(context);
  if (
    compactContent.length >= 5 &&
    ` ${compactContext} `.includes(` ${compactContent} `)
  ) {
    return true;
  }

  const contentTokens = [...new Set(tokenize(content))];
  if (contentTokens.length < 2) return false;

  const contextTokens = new Set(tokenize(context));
  const overlap = contentTokens.filter((token) => contextTokens.has(token));
  return overlap.length >= 2 && overlap.length / contentTokens.length >= 0.8;
}

async function getImmediatelyPrecedingContext(input: {
  userId: string;
  conversationThreadId: string;
  currentUserMessageId: string;
}): Promise<string | null> {
  const { prisma } = await import("@/lib/db");
  const currentMessage = await prisma.message.findFirst({
    where: {
      id: input.currentUserMessageId,
      userId: input.userId,
      conversationThreadId: input.conversationThreadId,
      direction: "INBOUND",
      role: "USER",
      deletedAt: null,
    },
    select: { createdAt: true },
  });
  if (!currentMessage) return null;

  const previousInboundMessage = await prisma.message.findFirst({
    where: {
      userId: input.userId,
      conversationThreadId: input.conversationThreadId,
      direction: "INBOUND",
      role: "USER",
      deletedAt: null,
      createdAt: { lt: currentMessage.createdAt },
    },
    orderBy: { createdAt: "desc" },
    select: {
      parts: true,
      generatedResponse: {
        select: {
          userId: true,
          conversationThreadId: true,
          direction: true,
          role: true,
          deletedAt: true,
          parts: true,
        },
      },
    },
  });
  if (!previousInboundMessage) return null;

  const response = previousInboundMessage.generatedResponse;
  if (
    response &&
    (response.userId !== input.userId ||
      response.conversationThreadId !== input.conversationThreadId ||
      response.direction !== "OUTBOUND" ||
      response.role !== "ASSISTANT" ||
      response.deletedAt !== null)
  ) {
    return null;
  }

  const { getTextFromParts } = await import("@/lib/utils/message-parts");
  return [
    getTextFromParts(previousInboundMessage.parts),
    response ? getTextFromParts(response.parts) : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function resolveExactMemoryDeleteTarget(input: {
  userId: string;
  userMessage: string;
  conversationThreadId?: string;
  currentUserMessageId?: string;
}): Promise<string | null> {
  if (ANAPHORIC_FORGET.test(input.userMessage)) {
    if (!input.conversationThreadId || !input.currentUserMessageId) return null;

    const context = await getImmediatelyPrecedingContext({
      userId: input.userId,
      conversationThreadId: input.conversationThreadId,
      currentUserMessageId: input.currentUserMessageId,
    });
    if (!context) return null;

    const { prisma } = await import("@/lib/db");
    const memories = await prisma.memory.findMany({
      where: { userId: input.userId },
      select: { key: true, category: true, value: true },
    });
    const matches = memories.filter(
      (memory) =>
        isExactStableMemoryKey(memory.key) &&
        !BROAD_STABLE_KEYS.has(memory.key) &&
        hasStrongContextMatch(memoryContent(memory.value), context),
    );

    return matches.length === 1 ? (matches[0]?.key ?? null) : null;
  }

  if (!EXPLICIT_FORGET.test(input.userMessage)) return null;

  const queryTokens = new Set(tokenize(input.userMessage));
  if (queryTokens.size === 0) return null;

  const { prisma } = await import("@/lib/db");
  const memories = await prisma.memory.findMany({
    where: { userId: input.userId },
    select: { key: true, category: true, value: true },
  });
  const normalizedMessage = normalizeText(input.userMessage);
  const scored = memories
    .filter(
      (memory) =>
        isExactStableMemoryKey(memory.key) &&
        !BROAD_STABLE_KEYS.has(memory.key),
    )
    .map((memory) => {
      const keyPhrase = normalizeText(memory.key.replaceAll("_", " "));
      const searchable = new Set([
        ...tokenize(memory.key),
        ...tokenize(memory.category),
        ...(CATEGORY_ALIASES[memory.category] ?? []).flatMap(tokenize),
        ...tokenize(memoryContent(memory.value)),
      ]);
      const overlap = [...queryTokens].filter((token) => searchable.has(token));
      const exactKeyScore = normalizedMessage.includes(keyPhrase) ? 10 : 0;
      const categoryScore = (CATEGORY_ALIASES[memory.category] ?? []).some(
        (alias) => normalizedMessage.includes(alias),
      )
        ? 2
        : 0;
      return {
        key: memory.key,
        score: exactKeyScore + categoryScore + overlap.length,
        overlap: overlap.length,
      };
    })
    .filter((candidate) => candidate.score >= 2 && candidate.overlap > 0)
    .sort((left, right) => right.score - left.score);

  if (scored.length !== 1 && scored[0]?.score === scored[1]?.score) return null;
  return scored[0]?.key ?? null;
}
