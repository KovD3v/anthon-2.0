import {
  matchesBriefResponseIntent,
  matchesMemoryDeleteIntent,
  matchesMemoryReadIntent,
  matchesMemoryWriteIntent,
  matchesNotesWriteIntent,
  matchesPreferenceWriteIntent,
  matchesProfileWriteIntent,
  matchesRagIntent,
  matchesRoutineProposalIntent,
  matchesVoiceIntent,
} from "./intent";
import { isDeletableStableMemoryKey } from "./memory-target";

export type TurnPlanReasonCode =
  | "GUEST"
  | "FIRST_TURN"
  | "BRIEF_REQUEST"
  | "DIRECT_MEDIA"
  | "WEB_SEARCH"
  | "RAG_RULE"
  | "PERSISTENT_READ"
  | "PERSISTENT_WRITE"
  | "VOICE_OUTPUT";

export type TurnPlan = {
  version: 2;
  /** Full is the only authenticated prompt mode; guest only changes persistence. */
  promptProfile: "full" | "guest";
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
  source: "fallback" | "rule" | "classifier" | "mixed";
  reasonCodes: TurnPlanReasonCode[];
};

/** Historical input shape retained so old callers can be migrated safely. */
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
    source?: "fallback" | "rule" | "classifier" | "mixed";
  };
  persistentToolsAllowed?: boolean;
  routineProposalAllowed?: boolean;
  memoryDeleteEnabled?: boolean;
  memoryDeleteTarget?: string | null;
  /** @deprecated Live turns no longer invoke or consume a classifier. */
  classifier?: TurnPlanClassifierDecision | null;
  fullMaxRawTurns: number;
};

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

type CapabilityFlag = Exclude<
  keyof NonNullable<TurnPlanInput["capabilityDecision"]>,
  "source"
>;

function selectedCapability(
  input: TurnPlanInput,
  capability: CapabilityFlag,
  fallback: boolean,
): boolean {
  return input.capabilityDecision?.[capability] ?? fallback;
}

export function planTurn(input: TurnPlanInput): TurnPlan {
  const text = input.userMessage.trim();
  const reasonCodes: TurnPlanReasonCode[] = [];
  const responseLength = matchesBriefResponseIntent(text) ? "brief" : "normal";
  if (responseLength === "brief") reasonCodes.push("BRIEF_REQUEST");
  if (input.isFirstTurn) reasonCodes.push("FIRST_TURN");
  if (input.outputMode === "voice") reasonCodes.push("VOICE_OUTPUT");

  if (input.isGuest) {
    reasonCodes.push("GUEST");
    const webSearch = selectedCapability(
      input,
      "webSearch",
      input.webSearchEnabled,
    );
    const webFetch =
      webSearch && selectedCapability(input, "webFetch", input.webFetchEnabled);
    const routineProposal =
      selectedCapability(
        input,
        "routineProposal",
        matchesRoutineProposalIntent(text),
      ) && input.routineProposalAllowed !== false;
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
        voiceOutput: selectedCapability(
          input,
          "voiceOutput",
          input.outputMode === "voice",
        ),
      },
      memoryDeleteTarget: null,
      source: input.capabilityDecision?.userContext ? "mixed" : "rule",
      reasonCodes,
    };
  }

  const directMedia = input.inputOrigin === "direct_media";
  const memoryRead = selectedCapability(
    input,
    "memoryRead",
    matchesMemoryReadIntent(text),
  );
  const memoryWrite = selectedCapability(
    input,
    "memoryWrite",
    matchesMemoryWriteIntent(text),
  );
  const profileWrite = matchesProfileWriteIntent(text);
  const preferenceWrite = matchesPreferenceWriteIntent(text);
  const notesWrite = matchesNotesWriteIntent(text);
  const memoryDelete =
    selectedCapability(
      input,
      "memoryDelete",
      input.memoryDeleteEnabled === true || matchesMemoryDeleteIntent(text),
    ) && isDeletableStableMemoryKey(input.memoryDeleteTarget);
  const persistentWrite =
    memoryWrite ||
    profileWrite ||
    preferenceWrite ||
    notesWrite ||
    memoryDelete;
  const webSearch = selectedCapability(
    input,
    "webSearch",
    input.webSearchEnabled,
  );
  const webFetch =
    webSearch && selectedCapability(input, "webFetch", input.webFetchEnabled);
  const routineProposal =
    selectedCapability(
      input,
      "routineProposal",
      matchesRoutineProposalIntent(text) &&
        !webSearch &&
        input.inputOrigin === "text" &&
        input.outputMode !== "voice" &&
        !matchesVoiceIntent(text),
    ) && input.routineProposalAllowed !== false;
  const voiceOutput = selectedCapability(
    input,
    "voiceOutput",
    input.outputMode === "voice",
  );
  const persistentToolsAllowed = input.persistentToolsAllowed !== false;
  const userContext = selectedCapability(
    input,
    "userContext",
    memoryRead || persistentWrite,
  );
  const rag = selectedCapability(input, "rag", matchesRagIntent(text));

  if (directMedia) reasonCodes.push("DIRECT_MEDIA");
  if (webSearch) reasonCodes.push("WEB_SEARCH");
  if (rag) reasonCodes.push("RAG_RULE");
  if (memoryRead) reasonCodes.push("PERSISTENT_READ");
  if (persistentWrite) reasonCodes.push("PERSISTENT_WRITE");

  const persistentCapabilityAllowed = persistentToolsAllowed;
  return {
    version: 2,
    promptProfile: "full",
    responseLength,
    inputOrigin: input.inputOrigin,
    outputMode: input.outputMode,
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
      memoryRead: persistentCapabilityAllowed && memoryRead,
      memoryWrite: persistentCapabilityAllowed && memoryWrite,
      memoryDelete: persistentCapabilityAllowed && memoryDelete,
      routineProposal,
      voiceOutput,
      profileWrite: persistentCapabilityAllowed && profileWrite,
      preferenceWrite: persistentCapabilityAllowed && preferenceWrite,
      notesWrite: persistentCapabilityAllowed && notesWrite,
    },
    memoryDeleteTarget:
      persistentCapabilityAllowed && memoryDelete
        ? (input.memoryDeleteTarget ?? null)
        : null,
    source: input.capabilityDecision?.source ?? "rule",
    reasonCodes,
  };
}
