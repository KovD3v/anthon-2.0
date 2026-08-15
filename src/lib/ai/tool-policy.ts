import type { CapabilityDecision } from "@/lib/ai/capability-arbitration";

export type ToolClass = "required" | "read" | "mutation" | "proposal";
export type ToolPolicy = Readonly<{
  name: string;
  class: ToolClass;
  maxCalls: number;
  requires: readonly string[];
  privacy: "public" | "private" | "sensitive";
  sideEffect: "none" | "user_data" | "proposal";
}>;

const registry: Record<string, Omit<ToolPolicy, "name">> = {
  searchRag: {
    class: "read",
    maxCalls: 1,
    requires: [],
    privacy: "private",
    sideEffect: "none",
  },
  tinyfishSearch: {
    class: "read",
    maxCalls: 1,
    requires: [],
    privacy: "public",
    sideEffect: "none",
  },
  tinyfishFetch: {
    class: "read",
    maxCalls: 2,
    requires: ["tinyfishSearch"],
    privacy: "public",
    sideEffect: "none",
  },
  recallFacts: {
    class: "read",
    maxCalls: 1,
    requires: [],
    privacy: "private",
    sideEffect: "none",
  },
  getMemories: {
    class: "read",
    maxCalls: 1,
    requires: [],
    privacy: "private",
    sideEffect: "none",
  },
  getUserContext: {
    class: "read",
    maxCalls: 1,
    requires: [],
    privacy: "private",
    sideEffect: "none",
  },
  searchPastConversations: {
    class: "read",
    maxCalls: 1,
    requires: [],
    privacy: "private",
    sideEffect: "none",
  },
  expandConversationEvidence: {
    class: "read",
    maxCalls: 2,
    requires: ["searchPastConversations"],
    privacy: "private",
    sideEffect: "none",
  },
  rememberFact: {
    class: "mutation",
    maxCalls: 1,
    requires: [],
    privacy: "sensitive",
    sideEffect: "user_data",
  },
  saveMemory: {
    class: "mutation",
    maxCalls: 1,
    requires: [],
    privacy: "sensitive",
    sideEffect: "user_data",
  },
  reviseFact: {
    class: "mutation",
    maxCalls: 1,
    requires: [],
    privacy: "sensitive",
    sideEffect: "user_data",
  },
  forgetFact: {
    class: "required",
    maxCalls: 1,
    requires: [],
    privacy: "sensitive",
    sideEffect: "user_data",
  },
  deleteMemory: {
    class: "required",
    maxCalls: 1,
    requires: [],
    privacy: "sensitive",
    sideEffect: "user_data",
  },
  requestMemoryApproval: {
    class: "required",
    maxCalls: 1,
    requires: [],
    privacy: "sensitive",
    sideEffect: "user_data",
  },
  resolveMemoryApproval: {
    class: "required",
    maxCalls: 1,
    requires: [],
    privacy: "sensitive",
    sideEffect: "user_data",
  },
  proposeRoutine: {
    class: "proposal",
    maxCalls: 1,
    requires: [],
    privacy: "private",
    sideEffect: "proposal",
  },
  updateProfile: {
    class: "mutation",
    maxCalls: 1,
    requires: [],
    privacy: "sensitive",
    sideEffect: "user_data",
  },
  updatePreferences: {
    class: "mutation",
    maxCalls: 1,
    requires: [],
    privacy: "sensitive",
    sideEffect: "user_data",
  },
  addNotes: {
    class: "mutation",
    maxCalls: 1,
    requires: [],
    privacy: "sensitive",
    sideEffect: "user_data",
  },
};

export function resolveToolPolicy(
  name: string,
  state: {
    isGuest: boolean;
    recallActive: boolean;
    capabilities: Partial<CapabilityDecision>;
    modelSelectsTools?: boolean;
  },
): ToolPolicy | null {
  const entry = registry[name];
  const modelSelectsTools = state.modelSelectsTools === true;
  if (!entry) return null;
  if (
    state.isGuest &&
    (entry.sideEffect === "user_data" ||
      name === "getMemories" ||
      name === "getUserContext" ||
      name.includes("Conversation") ||
      name === "recallFacts")
  )
    return null;
  if (
    !state.recallActive &&
    (name === "recallFacts" || name.includes("Conversation"))
  )
    return null;
  if (
    ["rememberFact", "saveMemory"].includes(name) &&
    state.capabilities.memoryWrite !== true &&
    !modelSelectsTools
  )
    return null;
  if (
    ["forgetFact", "deleteMemory"].includes(name) &&
    state.capabilities.memoryDelete !== true &&
    !modelSelectsTools
  )
    return null;
  if (
    name === "proposeRoutine" &&
    state.capabilities.routineProposal !== true &&
    !modelSelectsTools
  )
    return null;
  if (
    name === "tinyfishSearch" &&
    state.capabilities.webSearch !== true &&
    !modelSelectsTools
  )
    return null;
  if (
    name === "tinyfishFetch" &&
    state.capabilities.webFetch !== true &&
    !modelSelectsTools
  )
    return null;
  return Object.freeze({
    name,
    ...entry,
    requires: Object.freeze([...entry.requires]),
  });
}
