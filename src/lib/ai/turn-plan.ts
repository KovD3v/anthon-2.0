import {
  matchesAtomicCoachingIntent,
  matchesBriefResponseIntent,
  matchesComplexCoachingIntent,
  matchesMemoryDeleteIntent,
  matchesMemoryReadIntent,
  matchesMemoryWriteIntent,
  matchesNotesWriteIntent,
  matchesPreferenceWriteIntent,
  matchesProfileWriteIntent,
  matchesRagIntent,
  matchesRoutineProposalIntent,
  matchesSimpleFastIntent,
  matchesVoiceIntent,
} from "./intent";
import { isDeletableStableMemoryKey } from "./memory-target";

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
    memoryDelete: boolean;
    routineProposal: boolean;
    voiceOutput: boolean;
    profileWrite: boolean;
    preferenceWrite: boolean;
    notesWrite: boolean;
  };
  memoryDeleteTarget: string | null;
  source: "rule" | "classifier" | "mixed";
  reasonCodes: TurnPlanReasonCode[];
};

export type TurnPlanClassifierDecision = {
  webSearch?: boolean;
  webFetch?: boolean;
  rag?: boolean;
  userContext?: "needed" | "not_needed";
  memoryRead?: boolean;
  memoryWrite?: boolean;
  memoryDelete?: boolean;
  routineProposal?: boolean;
  voiceOutput?: boolean;
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
  capabilityMode?: "legacy" | "agentic";
  allowConcurrentRagAndWeb?: boolean;
  capabilityDecision?: {
    rag: boolean;
    webSearch: boolean;
    webFetch: boolean;
    userContext: boolean;
    memoryRead: boolean;
    memoryWrite: boolean;
    memoryDelete: boolean;
    routineProposal: boolean;
    voiceOutput: boolean;
  };
  persistentToolsAllowed?: boolean;
  routineProposalAllowed?: boolean;
  memoryDeleteEnabled?: boolean;
  memoryDeleteTarget?: string | null;
  classifier?: TurnPlanClassifierDecision | null;
  fullMaxRawTurns: number;
};

export function planTurn(input: TurnPlanInput): TurnPlan {
  const text = input.userMessage.trim();
  const reasonCodes: TurnPlanReasonCode[] = [];
  const classifier = input.classifier;
  const agenticCapabilityMode =
    input.capabilityMode === "agentic" ||
    input.allowConcurrentRagAndWeb === true;
  const agenticDecision = agenticCapabilityMode
    ? input.capabilityDecision
    : undefined;
  const classifierUsed = Boolean(
    classifier?.accepted &&
      (classifier.webSearch ||
        classifier.webFetch ||
        classifier.rag ||
        classifier.userContext === "needed" ||
        classifier.memoryRead ||
        classifier.memoryWrite ||
        classifier.memoryDelete ||
        classifier.routineProposal ||
        classifier.voiceOutput),
  );

  const responseLength = matchesBriefResponseIntent(text) ? "brief" : "normal";
  if (responseLength === "brief") reasonCodes.push("BRIEF_REQUEST");
  if (input.isFirstTurn) reasonCodes.push("FIRST_TURN");
  if (input.outputMode === "voice") reasonCodes.push("VOICE_OUTPUT");

  if (input.isGuest) {
    reasonCodes.push("GUEST");
    const webSearch =
      agenticDecision?.webSearch ??
      (input.webSearchEnabled ||
        Boolean(classifier?.accepted && classifier.webSearch));
    const webFetch =
      webSearch &&
      (agenticDecision?.webFetch ??
        (input.webFetchEnabled ||
          Boolean(classifier?.accepted && classifier.webFetch)));
    const routineProposal =
      (agenticDecision?.routineProposal ??
        matchesRoutineProposalIntent(text)) &&
      input.routineProposalAllowed !== false;
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
      capabilities: {
        ...emptyCapabilities(),
        webSearch,
        webFetch,
        routineProposal,
        voiceOutput:
          agenticDecision?.voiceOutput ?? input.outputMode === "voice",
      },
      memoryDeleteTarget: null,
      source: classifierUsed ? "mixed" : "rule",
      reasonCodes,
    };
  }

  const directMedia = input.inputOrigin === "direct_media";
  const memoryRead =
    agenticDecision?.memoryRead ?? matchesMemoryReadIntent(text);
  const memoryWrite =
    agenticDecision?.memoryWrite ?? matchesMemoryWriteIntent(text);
  const profileWrite = matchesProfileWriteIntent(text);
  const preferenceWrite = matchesPreferenceWriteIntent(text);
  const notesWrite = matchesNotesWriteIntent(text);
  const memoryDelete =
    (agenticDecision?.memoryDelete ?? input.memoryDeleteEnabled === true) &&
    isDeletableStableMemoryKey(input.memoryDeleteTarget);
  const persistentWrite =
    memoryWrite ||
    profileWrite ||
    preferenceWrite ||
    notesWrite ||
    memoryDelete;
  const webSearch =
    agenticDecision?.webSearch ??
    (input.webSearchEnabled ||
      Boolean(classifier?.accepted && classifier.webSearch));
  const webFetch =
    webSearch &&
    (agenticDecision?.webFetch ??
      (input.webFetchEnabled ||
        Boolean(classifier?.accepted && classifier.webFetch)));
  const routineProposal =
    (agenticDecision?.routineProposal ??
      (matchesRoutineProposalIntent(text) &&
        !webSearch &&
        input.inputOrigin === "text" &&
        input.outputMode !== "voice" &&
        !matchesVoiceIntent(text))) &&
    input.routineProposalAllowed !== false;
  const voiceOutput =
    agenticDecision?.voiceOutput ?? input.outputMode === "voice";
  const persistentToolsAllowed = input.persistentToolsAllowed !== false;
  const requestedUserContext =
    agenticDecision?.userContext ??
    (memoryRead ||
      persistentWrite ||
      Boolean(classifier?.accepted && classifier.userContext === "needed"));

  if (directMedia) reasonCodes.push("DIRECT_MEDIA");
  if (webSearch) reasonCodes.push("WEB_SEARCH");
  if (matchesRagIntent(text)) reasonCodes.push("RAG_RULE");
  if (classifier?.accepted && classifier.rag)
    reasonCodes.push("RAG_CLASSIFIER");
  if (classifier?.accepted && classifier.userContext === "needed") {
    reasonCodes.push("USER_CONTEXT_CLASSIFIER");
  }
  if (memoryRead) reasonCodes.push("PERSISTENT_READ");
  if (persistentWrite) reasonCodes.push("PERSISTENT_WRITE");

  const deterministicRag =
    !input.webSearchEnabled &&
    (matchesRagIntent(text) || Boolean(classifier?.accepted && classifier.rag));
  const selectedRag = agenticDecision?.rag ?? deterministicRag;
  const requiresFull =
    directMedia ||
    webSearch ||
    selectedRag ||
    requestedUserContext ||
    persistentWrite ||
    matchesComplexCoachingIntent(text);
  const compact = !requiresFull && matchesAtomicCoachingIntent(text);
  if (compact) reasonCodes.push("ATOMIC_COACHING");
  const rag =
    !compact &&
    (agenticDecision
      ? agenticDecision.rag
      : !webSearch || agenticCapabilityMode);
  const userContext = agenticDecision
    ? !compact && agenticDecision.userContext
    : !compact && (!webSearch || requestedUserContext);
  const persistentCapabilityAllowed = persistentToolsAllowed && !compact;

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
      memoryRead: persistentCapabilityAllowed ? memoryRead : false,
      memoryWrite: persistentCapabilityAllowed ? memoryWrite : false,
      memoryDelete: persistentCapabilityAllowed ? memoryDelete : false,
      routineProposal,
      voiceOutput,
      profileWrite: persistentCapabilityAllowed ? profileWrite : false,
      preferenceWrite: persistentCapabilityAllowed ? preferenceWrite : false,
      notesWrite: persistentCapabilityAllowed ? notesWrite : false,
    },
    memoryDeleteTarget:
      persistentCapabilityAllowed && memoryDelete
        ? (input.memoryDeleteTarget ?? null)
        : null,
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
  const agenticCapabilities =
    input.capabilityMode === "agentic" ||
    input.allowConcurrentRagAndWeb === true;
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
        ...(agenticCapabilities
          ? plan.capabilities
          : {
              ...plan.capabilities,
              rag: true,
              userContext: true,
              voiceOutput: true,
            }),
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
    capabilities: agenticCapabilities ? plan.capabilities : emptyCapabilities(),
    memoryDeleteTarget: agenticCapabilities ? plan.memoryDeleteTarget : null,
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
    memoryDelete: false,
    routineProposal: false,
    voiceOutput: false,
    profileWrite: false,
    preferenceWrite: false,
    notesWrite: false,
  };
}
