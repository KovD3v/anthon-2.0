import {
  deterministicMemoryGate,
  MEMORY_GATE_CRITERIA,
  MEMORY_GATE_INSTRUCTIONS,
  memoryGateAllowsExtraction,
} from "./memory-candidate-gate-policy";
import { JEV_MODEL_ID, requestTypedDecision } from "./typed-decisions";
import { scheduleTypedDecisionUsage } from "./usage-meter";

export { deterministicMemoryGate } from "./memory-candidate-gate-policy";

export async function shouldExtractMemory(input: {
  userId: string;
  userText: string;
  assistantText?: string;
  abortSignal?: AbortSignal;
  waitUntil?: (promise: Promise<unknown>) => void;
}): Promise<boolean> {
  const mode = process.env.AI_MEMORY_GATE_MODE ?? "active";
  if (mode !== "active" && mode !== "shadow") return true;
  const deterministic = deterministicMemoryGate(input);
  if (deterministic !== null) return mode === "shadow" || deterministic;
  const decision = await requestTypedDecision({
    modelId: process.env.MEMORY_GATE_MODEL_ID || JEV_MODEL_ID,
    instructions: MEMORY_GATE_INSTRUCTIONS,
    criteria: MEMORY_GATE_CRITERIA,
    state: {
      userMessage: input.userText,
      assistantContext: input.assistantText?.slice(0, 1000),
    },
    abortSignal: input.abortSignal,
  });
  scheduleTypedDecisionUsage(decision, {
    operation: "memory_gate",
    userId: input.userId,
    waitUntil: input.waitUntil,
  });
  input.abortSignal?.throwIfAborted();
  return mode === "shadow" || !decision.ok
    ? true
    : memoryGateAllowsExtraction(decision.choice, decision.confidence);
}
