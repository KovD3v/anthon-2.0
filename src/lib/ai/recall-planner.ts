import type { MemoryRecallDecision } from "@/lib/ai/memory-recall-release";

export type RecallPlan = Readonly<{
  facts: { enabled: boolean; limit: number; deadlineMs: number };
  conversations: {
    enabled: boolean;
    initialScope: "current_thread";
    allowCrossChannel: boolean;
    limit: number;
    currentDeadlineMs: number;
    globalDeadlineMs: number;
  };
  reasonCodes: readonly string[];
}>;

const atomicPattern = /^(ciao|salve|hey|hi|ok|okay|grazie|thanks|s[iì]|no)[.!?\s]*$/i;
const historyPattern = /\b(ricord\w*|avevamo parlato|ne avevamo|l'altra volta|in passato|tempo fa|prima volta|scorsa volta|previously|last time|we discussed|before)\b/i;
const continuityPattern = /\b(ancora|di nuovo|continua|riprend\w*|progress\w*|funzionat\w*|risultat\w*|impegn\w*|promess\w*|again|continue|progress|worked|outcome|commitment)\b/i;

export function planRecall(input: {
  message: string;
  decision: MemoryRecallDecision;
  isGuest: boolean;
}): RecallPlan {
  const message = input.message.trim();
  const eligible = !input.isGuest && input.decision.mode !== "off" && !atomicPattern.test(message);
  const explicitHistory = historyPattern.test(message);
  const continuity = continuityPattern.test(message);
  const conversationEnabled = eligible && (explicitHistory || continuity);
  const reasonCodes = [
    ...(eligible ? ["coaching_personalization"] : []),
    ...(explicitHistory ? ["explicit_history"] : []),
    ...(continuity ? ["continuity"] : []),
  ];
  return Object.freeze({
    facts: { enabled: eligible, limit: 8, deadlineMs: 100 },
    conversations: {
      enabled: conversationEnabled,
      initialScope: "current_thread",
      allowCrossChannel: conversationEnabled && explicitHistory,
      limit: 4,
      currentDeadlineMs: 100,
      globalDeadlineMs: 250,
    },
    reasonCodes: Object.freeze(reasonCodes),
  });
}
