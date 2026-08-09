const EXACT_STABLE_MEMORY_KEY = /^[a-z][a-z0-9_]{0,127}$/;

const EXPLICIT_FORGET =
  /\b(?:dimentica|forget)\b[^.!?]{0,100}(?:\bche\b|\b(?:questa|questo|quella|quello|this|that)\s+(?:memoria|ricordo|dato|informazione|preferenza|fatto|memory|fact|preference)\b|\b(?:la mia|il mio|le mie|i miei|my)\b|\b(?:memoria|ricordo|dato|informazione|profilo|preferenza|fatto|memory|fact|preference|profile)\b)|\b(?:cancella|elimina|rimuovi|delete|remove)\b[^.!?]{0,100}\b(?:memoria|ricordo|dato|informazione|profilo|preferenza|fatto|memory|fact|preference|profile)\b/i;
const DIRECT_KEY_FORGET =
  /^\s*(?:dimentica|forget|cancella|elimina|rimuovi|delete|remove)\s+([a-z][a-z0-9_]{0,127})\s*[.!?]*\s*$/i;
const ANAPHORIC_FORGET =
  /^\s*(?:per favore\s+|please\s+)?(?:dimentica|forget)\s+(?:questa|questo|quella|quello|this|that)(?:\s+(?:cosa|memoria|ricordo|dato|informazione|preferenza|fatto|thing|memory|fact|information|preference))?\s*[.!?]*\s*$/i;
const COACHING_CONTINUATION =
  /(?:\be\b|\band\b|[.!?,;:\u2014-])\s*(?:(?:poi|then)\s+)?(?:(?:prova|proviamo|cerca|cerchiamo|try)\s+(?:a|di|to)\s+)?(?:concentr(?:ati|arti|arsi|arci)|focalizz(?:ati|arti|arsi|arci)|ripart(?:i|ire|iamo)|pensa(?:\b|re\b)|guarda\s+avanti\b|vai\s+avanti\b|focus\b|refocus\b|restart\b|think\b|move\s+on\b)/i;
const STABLE_FACT_SIGNAL =
  /\b(?:mi\s+(?:alleno|chiamo|sento|trovo)|(?:vivo|abito|sono|ho|faccio|pratico|preferisco|voglio|lavoro|studio|uso|seguo|mangio|dormo|corro|gioco)|ti\s+(?:alleni|chiami|senti|trovi)|(?:vivi|abiti|sei|hai|fai|pratichi|preferisci|vuoi|lavori|studi|usi|segui|mangi|dormi|corri|giochi)|i\s+(?:am|have|live|train|prefer|want|work|study|use|follow|eat|sleep|run|play)|you\s+(?:are|have|live|train|prefer|want|work|study|use|follow|eat|sleep|run|play))\b/i;
const FACT_TOKEN_CANONICAL: Record<string, string> = {
  alleni: "allenare",
  alleno: "allenare",
  abiti: "abitare",
  abito: "abitare",
  hai: "avere",
  have: "avere",
  sono: "essere",
  sei: "essere",
  vivi: "vivere",
  vivo: "vivere",
  voglio: "volere",
  vuoi: "volere",
};
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

export function matchesMemoryDeleteIntent(message: string) {
  return (
    !COACHING_CONTINUATION.test(message) &&
    (ANAPHORIC_FORGET.test(message) ||
      EXPLICIT_FORGET.test(message) ||
      DIRECT_KEY_FORGET.test(message))
  );
}

export function isExactStableMemoryKey(target: unknown): target is string {
  return typeof target === "string" && EXACT_STABLE_MEMORY_KEY.test(target);
}

export function isDeletableStableMemoryKey(target: unknown): target is string {
  return isExactStableMemoryKey(target) && !BROAD_STABLE_KEYS.has(target);
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

function directMemoryKey(message: string) {
  const match = message.match(DIRECT_KEY_FORGET);
  const key = match?.[1]?.toLocaleLowerCase("en-US");
  if (
    !key ||
    NON_TARGET_WORDS.has(key) ||
    Object.values(CATEGORY_ALIASES).some((aliases) => aliases.includes(key))
  ) {
    return null;
  }
  return isDeletableStableMemoryKey(key) ? key : null;
}

function stableFactCandidates(value: string) {
  return value
    .split(/(?:\r?\n|[,.!?;]+|\s+(?:e|and|ma|but)\s+)/i)
    .map((candidate) => candidate.trim())
    .filter(
      (candidate) =>
        tokenize(candidate).length >= 2 && STABLE_FACT_SIGNAL.test(candidate),
    );
}

function uniqueStableFactCandidates(...values: string[]) {
  const unique: string[] = [];
  for (const candidate of values.flatMap(stableFactCandidates)) {
    const candidateTokens = new Set(
      tokenize(candidate).map((token) => FACT_TOKEN_CANONICAL[token] ?? token),
    );
    const isDuplicate = unique.some((existing) => {
      const existingTokens = new Set(
        tokenize(existing).map((token) => FACT_TOKEN_CANONICAL[token] ?? token),
      );
      const overlap = [...candidateTokens].filter((token) =>
        existingTokens.has(token),
      ).length;
      return (
        overlap >= 2 &&
        overlap / Math.min(candidateTokens.size, existingTokens.size) >= 0.8
      );
    });
    if (!isDuplicate) unique.push(candidate);
  }
  return unique;
}

async function getImmediatelyPrecedingContext(input: {
  userId: string;
  conversationThreadId: string;
  currentUserMessageId: string;
}): Promise<string[] | null> {
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

  const tiedInboundMessage = await prisma.message.findFirst({
    where: {
      id: { not: input.currentUserMessageId },
      userId: input.userId,
      conversationThreadId: input.conversationThreadId,
      direction: "INBOUND",
      role: "USER",
      deletedAt: null,
      createdAt: currentMessage.createdAt,
    },
    select: { id: true },
  });
  if (tiedInboundMessage) return null;

  const precedingInboundMessages = await prisma.message.findMany({
    where: {
      userId: input.userId,
      conversationThreadId: input.conversationThreadId,
      direction: "INBOUND",
      role: "USER",
      deletedAt: null,
      createdAt: { lt: currentMessage.createdAt },
    },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: {
      createdAt: true,
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
  const previousInboundMessage = precedingInboundMessages[0];
  if (!previousInboundMessage) return null;

  const nextMostRecentInboundMessage = precedingInboundMessages[1];
  if (
    nextMostRecentInboundMessage &&
    nextMostRecentInboundMessage.createdAt.getTime() ===
      previousInboundMessage.createdAt.getTime()
  ) {
    return null;
  }

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
  const inboundText = getTextFromParts(previousInboundMessage.parts);
  const responseText = response ? getTextFromParts(response.parts) : "";
  return uniqueStableFactCandidates(inboundText, responseText);
}

export async function resolveExactMemoryDeleteTarget(input: {
  userId: string;
  userMessage: string;
  conversationThreadId?: string;
  currentUserMessageId?: string;
}): Promise<string | null> {
  if (!matchesMemoryDeleteIntent(input.userMessage)) return null;

  if (ANAPHORIC_FORGET.test(input.userMessage)) {
    if (!input.conversationThreadId || !input.currentUserMessageId) return null;

    const factCandidates = await getImmediatelyPrecedingContext({
      userId: input.userId,
      conversationThreadId: input.conversationThreadId,
      currentUserMessageId: input.currentUserMessageId,
    });
    if (!factCandidates || factCandidates.length !== 1) return null;

    const { prisma } = await import("@/lib/db");
    const memories = await prisma.memory.findMany({
      where: { userId: input.userId },
      select: { key: true, category: true, value: true },
    });
    const matches = memories.filter(
      (memory) =>
        isDeletableStableMemoryKey(memory.key) &&
        hasStrongContextMatch(
          memoryContent(memory.value),
          factCandidates[0] ?? "",
        ),
    );

    return matches.length === 1 ? (matches[0]?.key ?? null) : null;
  }

  const queryTokens = new Set(tokenize(input.userMessage));

  const { prisma } = await import("@/lib/db");
  const memories = await prisma.memory.findMany({
    where: { userId: input.userId },
    select: { key: true, category: true, value: true },
  });

  const requestedKey = directMemoryKey(input.userMessage);
  if (requestedKey) {
    const exactMatches = memories.filter(
      (memory) => memory.key === requestedKey,
    );
    return exactMatches.length === 1 ? requestedKey : null;
  }

  if (queryTokens.size === 0) return null;

  const normalizedMessage = normalizeText(input.userMessage);
  const scored = memories
    .filter((memory) => isDeletableStableMemoryKey(memory.key))
    .map((memory) => {
      const keyPhrase = normalizeText(memory.key.replaceAll("_", " "));
      const content = memoryContent(memory.value);
      const contentMatch = hasStrongContextMatch(content, input.userMessage);
      const keyMatch = normalizedMessage.includes(keyPhrase);
      const searchableKey = new Set(tokenize(memory.key));
      const keyOverlap = [...queryTokens].filter((token) =>
        searchableKey.has(token),
      );
      const exactKeyScore = normalizedMessage.includes(keyPhrase) ? 10 : 0;
      const contentScore = contentMatch ? 5 : 0;
      return {
        key: memory.key,
        score: exactKeyScore + contentScore + keyOverlap.length,
        strongMatch: keyMatch || contentMatch,
      };
    })
    .filter((candidate) => candidate.strongMatch)
    .sort((left, right) => right.score - left.score);

  if (scored.length !== 1) return null;
  return scored[0]?.key ?? null;
}
