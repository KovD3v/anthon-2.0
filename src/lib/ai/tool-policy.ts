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
  searchRag: { class: "read", maxCalls: 1, requires: [], privacy: "private", sideEffect: "none" },
  tinyfishSearch: { class: "read", maxCalls: 1, requires: [], privacy: "public", sideEffect: "none" },
  tinyfishFetch: { class: "read", maxCalls: 2, requires: ["tinyfishSearch"], privacy: "public", sideEffect: "none" },
  recallFacts: { class: "read", maxCalls: 1, requires: [], privacy: "private", sideEffect: "none" },
  searchPastConversations: { class: "read", maxCalls: 1, requires: [], privacy: "private", sideEffect: "none" },
  expandConversationEvidence: { class: "read", maxCalls: 2, requires: ["searchPastConversations"], privacy: "private", sideEffect: "none" },
  rememberFact: { class: "mutation", maxCalls: 1, requires: [], privacy: "sensitive", sideEffect: "user_data" },
  reviseFact: { class: "mutation", maxCalls: 1, requires: [], privacy: "sensitive", sideEffect: "user_data" },
  forgetFact: { class: "required", maxCalls: 1, requires: [], privacy: "sensitive", sideEffect: "user_data" },
  requestMemoryApproval: { class: "required", maxCalls: 1, requires: [], privacy: "sensitive", sideEffect: "user_data" },
  resolveMemoryApproval: { class: "required", maxCalls: 1, requires: [], privacy: "sensitive", sideEffect: "user_data" },
  proposeRoutine: { class: "proposal", maxCalls: 1, requires: [], privacy: "private", sideEffect: "proposal" },
};

export function resolveToolPolicy(
  name: string,
  state: {
    isGuest: boolean;
    recallActive: boolean;
    capabilities: Partial<CapabilityDecision>;
  },
): ToolPolicy | null {
  const entry = registry[name];
  if (!entry) return null;
  if (state.isGuest && (entry.sideEffect === "user_data" || name.includes("Conversation") || name === "recallFacts")) return null;
  if (!state.recallActive && (name === "recallFacts" || name.includes("Conversation"))) return null;
  if (name === "rememberFact" && state.capabilities.memoryWrite !== true) return null;
  if (name === "forgetFact" && state.capabilities.memoryDelete !== true) return null;
  if (name === "proposeRoutine" && state.capabilities.routineProposal !== true) return null;
  if (name === "tinyfishSearch" && state.capabilities.webSearch !== true) return null;
  if (name === "tinyfishFetch" && state.capabilities.webFetch !== true) return null;
  return Object.freeze({ name, ...entry, requires: Object.freeze([...entry.requires]) });
}
