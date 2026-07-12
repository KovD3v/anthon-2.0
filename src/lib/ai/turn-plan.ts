import {
  matchesAtomicCoachingIntent,
  matchesBriefResponseIntent,
  matchesComplexCoachingIntent,
  matchesHealthRiskIntent,
  matchesMemoryDeleteIntent,
  matchesMemoryReadIntent,
  matchesMemoryWriteIntent,
  matchesNotesWriteIntent,
  matchesPreferenceWriteIntent,
  matchesProfileWriteIntent,
  matchesRagIntent,
  matchesSimpleFastIntent,
  matchesVoiceIntent,
} from "./intent";

export type TurnPlanReasonCode =
  | "GUEST"
  | "FIRST_TURN"
  | "ATOMIC_COACHING"
  | "BRIEF_REQUEST"
  | "DIRECT_MEDIA"
  | "WEB_SEARCH"
  | "RAG_RULE"
  | "RAG_CLASSIFIER"
  | "USER_CONTEXT_CLASSIFIER"
  | "PERSISTENT_READ"
  | "PERSISTENT_WRITE"
  | "HEALTH_OR_SAFETY"
  | "VOICE_OUTPUT";

export type TurnPlan = {
  version: 2;
  promptProfile: "compact" | "full" | "guest";
  responseLength: "brief" | "normal" | "extended";
  inputOrigin: "text" | "transcribed_voice" | "direct_media";
  outputMode: "text" | "voice";
  history: {
    scope: "none" | "thread";
    includeSummary: boolean;
    maxRawTurns: number;
    maxRawChars: number;
  };
  capabilities: {
    webSearch: boolean;
    webFetch: boolean;
    rag: boolean;
    userContext: boolean;
    memoryRead: boolean;
    memoryWrite: boolean;
    profileWrite: boolean;
    preferenceWrite: boolean;
    notesWrite: boolean;
  };
  source: "rule" | "classifier" | "mixed";
  reasonCodes: TurnPlanReasonCode[];
};

export type TurnPlanClassifierDecision = {
  webSearch?: boolean;
  webFetch?: boolean;
  rag?: boolean;
  userContext?: "needed" | "not_needed";
  accepted?: boolean;
};

export type TurnPlanInput = {
  userMessage: string;
  isGuest: boolean;
  isFirstTurn: boolean;
  inputOrigin: TurnPlan["inputOrigin"];
  outputMode: TurnPlan["outputMode"];
  webSearchEnabled: boolean;
  webFetchEnabled: boolean;
  classifier?: TurnPlanClassifierDecision | null;
  fullMaxRawTurns: number;
};

export function planTurn(input: TurnPlanInput): TurnPlan {
  const text = input.userMessage.trim();
  const reasonCodes: TurnPlanReasonCode[] = [];
  const classifier = input.classifier;
  const classifierUsed = Boolean(
    classifier?.accepted &&
      (classifier.webSearch ||
        classifier.webFetch ||
        classifier.rag ||
        classifier.userContext === "needed"),
  );

  const responseLength = matchesBriefResponseIntent(text) ? "brief" : "normal";
  if (responseLength === "brief") reasonCodes.push("BRIEF_REQUEST");
  if (input.isFirstTurn) reasonCodes.push("FIRST_TURN");
  if (input.outputMode === "voice") reasonCodes.push("VOICE_OUTPUT");

  if (input.isGuest) {
    reasonCodes.push("GUEST");
    const webSearch =
      input.webSearchEnabled ||
      Boolean(classifier?.accepted && classifier.webSearch);
    const webFetch =
      webSearch &&
      (input.webFetchEnabled ||
        Boolean(classifier?.accepted && classifier.webFetch));
    if (webSearch) reasonCodes.push("WEB_SEARCH");
    return {
      version: 2,
      promptProfile: "guest",
      responseLength,
      inputOrigin: input.inputOrigin,
      outputMode: input.outputMode,
      history: {
        scope: input.isFirstTurn ? "none" : "thread",
        includeSummary: false,
        maxRawTurns: 2,
        maxRawChars: 4_000,
      },
      capabilities: { ...emptyCapabilities(), webSearch, webFetch },
      source: classifierUsed ? "mixed" : "rule",
      reasonCodes,
    };
  }

  const directMedia = input.inputOrigin === "direct_media";
  const health = matchesHealthRiskIntent(text);
  const memoryRead = matchesMemoryReadIntent(text);
  const memoryWrite = matchesMemoryWriteIntent(text);
  const profileWrite = matchesProfileWriteIntent(text);
  const preferenceWrite = matchesPreferenceWriteIntent(text);
  const notesWrite = matchesNotesWriteIntent(text);
  const persistentWrite =
    memoryWrite ||
    profileWrite ||
    preferenceWrite ||
    notesWrite ||
    matchesMemoryDeleteIntent(text);
  const deterministicRag =
    !input.webSearchEnabled &&
    (matchesRagIntent(text) || Boolean(classifier?.accepted && classifier.rag));
  const webSearch =
    input.webSearchEnabled ||
    Boolean(classifier?.accepted && classifier.webSearch);
  const webFetch =
    webSearch &&
    (input.webFetchEnabled ||
      Boolean(classifier?.accepted && classifier.webFetch));
  const requestedUserContext =
    memoryRead ||
    persistentWrite ||
    Boolean(classifier?.accepted && classifier.userContext === "needed");

  if (directMedia) reasonCodes.push("DIRECT_MEDIA");
  if (health) reasonCodes.push("HEALTH_OR_SAFETY");
  if (webSearch) reasonCodes.push("WEB_SEARCH");
  if (matchesRagIntent(text)) reasonCodes.push("RAG_RULE");
  if (classifier?.accepted && classifier.rag)
    reasonCodes.push("RAG_CLASSIFIER");
  if (classifier?.accepted && classifier.userContext === "needed") {
    reasonCodes.push("USER_CONTEXT_CLASSIFIER");
  }
  if (memoryRead) reasonCodes.push("PERSISTENT_READ");
  if (persistentWrite) reasonCodes.push("PERSISTENT_WRITE");

  const requiresFull =
    directMedia ||
    health ||
    webSearch ||
    deterministicRag ||
    requestedUserContext ||
    persistentWrite ||
    matchesComplexCoachingIntent(text);
  const compact = !requiresFull && matchesAtomicCoachingIntent(text);
  // Full authenticated turns retain the RAG capability. The RAG subsystem then
  // decides whether it has useful indexed material; compact and web turns do
  // not start that enrichment at all.
  const rag = !webSearch && !compact;
  if (compact) reasonCodes.push("ATOMIC_COACHING");
  const userContext = !compact && (!webSearch || requestedUserContext);

  return {
    version: 2,
    promptProfile: compact ? "compact" : "full",
    responseLength,
    inputOrigin: input.inputOrigin,
    outputMode: input.outputMode,
    history: input.isFirstTurn
      ? { scope: "none", includeSummary: false, maxRawTurns: 0, maxRawChars: 0 }
      : compact
        ? {
            scope: "thread",
            includeSummary: true,
            maxRawTurns: 3,
            maxRawChars: 4_000,
          }
        : {
            scope: "thread",
            includeSummary: true,
            maxRawTurns: webSearch
              ? Math.min(2, Math.max(1, input.fullMaxRawTurns))
              : Math.max(1, input.fullMaxRawTurns),
            maxRawChars: 12_000,
          },
    capabilities: {
      webSearch,
      webFetch,
      rag,
      userContext,
      memoryRead,
      memoryWrite,
      profileWrite,
      preferenceWrite,
      notesWrite,
    },
    source: classifierUsed
      ? reasonCodes.some((code) => code.endsWith("CLASSIFIER"))
        ? "mixed"
        : "classifier"
      : "rule",
    reasonCodes,
  };
}

/**
 * Compatibility planner used only while AI_TURN_PLANNER_MODE=legacy is set.
 * It deliberately preserves the old broad compact matcher so an operator can
 * revert behavior immediately while leaving the v2 data model in place.
 */
export function planLegacyTurn(input: TurnPlanInput): TurnPlan {
  const plan = planTurn(input);
  const classifierRequiresFull = Boolean(
    input.classifier?.accepted &&
      (input.classifier.webSearch ||
        input.classifier.webFetch ||
        input.classifier.rag ||
        input.classifier.userContext === "needed"),
  );
  const legacyFastEligible =
    !input.isGuest &&
    matchesSimpleFastIntent(input.userMessage) &&
    !matchesHealthRiskIntent(input.userMessage) &&
    !matchesRagIntent(input.userMessage) &&
    !matchesMemoryReadIntent(input.userMessage) &&
    !matchesMemoryWriteIntent(input.userMessage) &&
    !matchesMemoryDeleteIntent(input.userMessage) &&
    !matchesProfileWriteIntent(input.userMessage) &&
    !matchesPreferenceWriteIntent(input.userMessage) &&
    !matchesNotesWriteIntent(input.userMessage) &&
    !matchesVoiceIntent(input.userMessage) &&
    input.outputMode !== "voice" &&
    input.inputOrigin !== "direct_media" &&
    !input.webSearchEnabled &&
    !classifierRequiresFull;

  if (
    plan.promptProfile === "compact" &&
    (input.outputMode === "voice" || matchesVoiceIntent(input.userMessage))
  ) {
    return {
      ...plan,
      promptProfile: "full",
      history: input.isFirstTurn
        ? {
            scope: "none",
            includeSummary: false,
            maxRawTurns: 0,
            maxRawChars: 0,
          }
        : {
            scope: "thread",
            includeSummary: true,
            maxRawTurns: Math.max(1, input.fullMaxRawTurns),
            maxRawChars: 12_000,
          },
      capabilities: {
        ...plan.capabilities,
        rag: true,
        userContext: true,
      },
    };
  }

  if (!legacyFastEligible) {
    return plan;
  }

  return {
    ...plan,
    promptProfile: "compact",
    history: input.isFirstTurn
      ? { scope: "none", includeSummary: false, maxRawTurns: 0, maxRawChars: 0 }
      : {
          scope: "thread",
          includeSummary: false,
          maxRawTurns: 3,
          maxRawChars: 4_000,
        },
    capabilities: emptyCapabilities(),
    source: "rule",
    reasonCodes: [...plan.reasonCodes, "ATOMIC_COACHING"],
  };
}

function emptyCapabilities(): TurnPlan["capabilities"] {
  return {
    webSearch: false,
    webFetch: false,
    rag: false,
    userContext: false,
    memoryRead: false,
    memoryWrite: false,
    profileWrite: false,
    preferenceWrite: false,
    notesWrite: false,
  };
}
