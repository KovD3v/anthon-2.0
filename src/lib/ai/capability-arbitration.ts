import { generateText, Output } from "ai";
import { z } from "zod";
import {
  matchesMemoryDeleteIntent,
  matchesMemoryReadIntent,
  matchesMemoryWriteIntent,
  matchesRagIntent,
  matchesRoutineProposalIntent,
  shouldEnableWebFetchTool,
} from "@/lib/ai/intent";
import { LatencyLogger } from "@/lib/latency-logger";
import { createLogger } from "@/lib/logger";
import { isDeletableStableMemoryKey } from "./memory-target";

const capabilityLogger = createLogger("ai");
const CAPABILITY_CLASSIFIER_TIMEOUT_MS = 900;
const CAPABILITY_CLASSIFIER_MIN_CONFIDENCE = 0.7;
const MAX_CLASSIFIER_CONTEXT_CHARS = 2_000;

export type CapabilityDecision = {
  rag: boolean;
  webSearch: boolean;
  webFetch: boolean;
  memoryRead: boolean;
  memoryWrite: boolean;
  memoryDelete: boolean;
  memoryDeleteTarget: string | null;
  routineProposal: boolean;
  userContext: boolean;
  voiceOutput: boolean;
  source: "fallback" | "classifier" | "mixed";
  reasonCodes: string[];
};

export type CapabilityArbitrationInput = {
  userMessage: string;
  isGuest: boolean;
  memoryEnabled: boolean;
  voiceAllowed: boolean;
  responseMode: "text" | "voice";
  explicitWebRule: "required" | "allowed" | "forbidden";
  allowConcurrentRoutineAndWeb?: boolean;
  requireClassifierRoutineProposal?: boolean;
  hasPendingMemoryApproval?: boolean;
  resolvedMemoryTarget?: string | null;
  classifier: Partial<CapabilityDecision> | null;
};

export function freezeCapabilityDecision(
  decision: CapabilityDecision,
): CapabilityDecision {
  if (Object.isFrozen(decision) && Object.isFrozen(decision.reasonCodes)) {
    return decision;
  }

  return Object.freeze({
    ...decision,
    reasonCodes: Object.freeze([...decision.reasonCodes]),
  }) as unknown as CapabilityDecision;
}

const classifierCapabilities = [
  "rag",
  "webSearch",
  "webFetch",
  "memoryRead",
  "memoryWrite",
  "memoryDelete",
  "routineProposal",
  "userContext",
  "voiceOutput",
] as const;

type ClassifierCapability = (typeof classifierCapabilities)[number];

function normalizeResolvedMemoryTarget(target: string | null | undefined) {
  return isDeletableStableMemoryKey(target) ? target : null;
}

const capabilityVoteSchema = z.object({
  decision: z.enum(["yes", "no", "uncertain"]),
  confidence: z.number().min(0).max(1),
});
const capabilityClassifierSchema = z.object(
  Object.fromEntries(
    classifierCapabilities.map((capability) => [capability, capabilityVoteSchema]),
  ) as Record<ClassifierCapability, typeof capabilityVoteSchema>,
);

type ClassifierInput = {
  userMessage: string;
  context: string;
  modelId: string;
  userId?: string;
  abortSignal?: AbortSignal;
};

export function buildCapabilityClassifierPrompt(
  userMessage: string,
  context: string,
) {
  return `Classify optional capabilities for the next Anthon chat turn.

Return an independent decision and confidence for every capability. Return yes
only when that capability is materially useful. One uncertain capability must
not change another capability's confident vote.
memoryWrite may be yes for explicit persistence requests and for clearly stated, ordinary low-risk durable facts that will remain useful in future coaching turns. Keep it no for guesses, transient details, and low-confidence inferences. Sensitive or high-impact facts are always subject to server-side approval policy and cannot be downgraded by this classifier.
Voice output requires an explicit voice response mode.

Context:
${context.slice(0, MAX_CLASSIFIER_CONTEXT_CHARS)}

User message:
${JSON.stringify(userMessage)}`;
}

export function acceptCapabilityVotes(
  output: Partial<
    Record<ClassifierCapability, z.infer<typeof capabilityVoteSchema>>
  >,
): Partial<CapabilityDecision> {
  const accepted: Partial<CapabilityDecision> = {};
  for (const capability of classifierCapabilities) {
    const vote = output[capability];
    if (!vote || vote.confidence < CAPABILITY_CLASSIFIER_MIN_CONFIDENCE) continue;
    if (vote.decision === "yes") accepted[capability] = true;
    if (vote.decision === "no") accepted[capability] = false;
  }
  return accepted;
}

export async function classifyCapabilities({
  userMessage,
  context,
  modelId,
  userId,
  abortSignal,
}: ClassifierInput): Promise<Partial<CapabilityDecision> | null> {
  abortSignal?.throwIfAborted();

  try {
    const [
      { openrouter },
      { getOpenRouterProviderOptionsForModel },
      { trackSupportAiUsage },
    ] = await Promise.all([
      import("@/lib/ai/providers/openrouter"),
      import("@/lib/ai/providers/openrouter-routing"),
      import("@/lib/ai/usage-meter"),
    ]);
    const result = await LatencyLogger.measure(
      "🧭 Orchestrator: Capability classifier",
      () =>
        generateText({
          model: openrouter(modelId),
          output: Output.object({ schema: capabilityClassifierSchema }),
          temperature: 0,
          maxOutputTokens: 120,
          abortSignal,
          timeout: { totalMs: CAPABILITY_CLASSIFIER_TIMEOUT_MS },
          providerOptions: {
            openrouter: getOpenRouterProviderOptionsForModel(modelId),
          },
          prompt: buildCapabilityClassifierPrompt(userMessage, context),
        }),
    );

    if (userId) {
      await trackSupportAiUsage({
        userId,
        modelId,
        usage: result.usage,
        providerMetadata: result.providerMetadata,
      });
    }

    const parsed = capabilityClassifierSchema.safeParse(result.output);
    if (!parsed.success) return null;
    const accepted = acceptCapabilityVotes(parsed.data);
    return Object.keys(accepted).length > 0 ? accepted : null;
  } catch (error) {
    abortSignal?.throwIfAborted();
    capabilityLogger.warn(
      "ai.capability_arbitration.classifier_failed",
      "Capability classifier failed; using deterministic arbitration",
      { error, modelId },
    );
    return null;
  }
}

function addReason(reasonCodes: string[], reason: string) {
  if (!reasonCodes.includes(reason)) {
    reasonCodes.push(reason);
  }
}

export function normalizeCapabilityDecision(
  input: CapabilityArbitrationInput,
): CapabilityDecision {
  const reasonCodes: string[] = [];
  const classifier = input.classifier;
  const proposed = (capability: ClassifierCapability) =>
    classifier?.[capability] === true;
  const hasClassifierProposal = Boolean(
    classifier &&
      classifierCapabilities.some((capability) => proposed(capability)),
  );

  const explicitMemoryRead = matchesMemoryReadIntent(input.userMessage);
  const explicitMemoryWrite = matchesMemoryWriteIntent(input.userMessage);
  const explicitMemoryDelete = matchesMemoryDeleteIntent(input.userMessage);
  const persistentMemoryAllowed = !input.isGuest && input.memoryEnabled;

  let webSearch = input.explicitWebRule === "required";
  if (input.explicitWebRule === "allowed" && proposed("webSearch")) {
    webSearch = true;
  }
  if (input.explicitWebRule === "forbidden") {
    webSearch = false;
    addReason(reasonCodes, "web_rule_forbidden");
  }
  if (input.explicitWebRule === "required") {
    addReason(reasonCodes, "web_rule_required");
  }

  const webFetch =
    webSearch &&
    (shouldEnableWebFetchTool(input.userMessage) || proposed("webFetch"));
  const rag = matchesRagIntent(input.userMessage) || proposed("rag");
  let memoryRead =
    persistentMemoryAllowed && (explicitMemoryRead || proposed("memoryRead"));
  let memoryWrite =
    persistentMemoryAllowed &&
    (explicitMemoryWrite ||
      proposed("memoryWrite") ||
      input.hasPendingMemoryApproval === true);
  const resolvedMemoryTarget = normalizeResolvedMemoryTarget(
    input.resolvedMemoryTarget,
  );
  let memoryDelete =
    persistentMemoryAllowed &&
    explicitMemoryDelete &&
    resolvedMemoryTarget !== null;
  let userContext = !input.isGuest && (memoryRead || proposed("userContext"));

  if (!input.memoryEnabled) {
    memoryRead = false;
    memoryWrite = false;
    memoryDelete = false;
    addReason(reasonCodes, "memory_disabled");
  }
  if (input.isGuest) {
    memoryRead = false;
    memoryWrite = false;
    memoryDelete = false;
    userContext = false;
    if (
      explicitMemoryRead ||
      explicitMemoryWrite ||
      explicitMemoryDelete ||
      proposed("memoryRead") ||
      proposed("memoryWrite") ||
      proposed("memoryDelete") ||
      proposed("userContext")
    ) {
      addReason(reasonCodes, "guest_memory_denied");
    }
  }
  if (!explicitMemoryDelete && proposed("memoryDelete")) {
    memoryDelete = false;
    addReason(reasonCodes, "delete_requires_explicit_intent");
  }
  if (explicitMemoryDelete && !resolvedMemoryTarget) {
    memoryDelete = false;
    addReason(reasonCodes, "delete_requires_exact_target");
  }

  const routineProposal =
    (matchesRoutineProposalIntent(input.userMessage) ||
      proposed("routineProposal")) &&
    (input.requireClassifierRoutineProposal !== true ||
      proposed("routineProposal")) &&
    (input.allowConcurrentRoutineAndWeb === true || !webSearch) &&
    input.responseMode !== "voice";
  const voiceOutput = input.responseMode === "voice" && input.voiceAllowed;
  if (input.responseMode === "voice" && !input.voiceAllowed) {
    addReason(reasonCodes, "voice_guard_denied");
  }
  if (!classifier) {
    addReason(reasonCodes, "classifier_unavailable");
  }

  const deterministicSelection =
    input.explicitWebRule !== "allowed" ||
    matchesRagIntent(input.userMessage) ||
    explicitMemoryRead ||
    explicitMemoryWrite ||
    explicitMemoryDelete ||
    input.responseMode === "voice";
  const source = !classifier
    ? "fallback"
    : hasClassifierProposal && deterministicSelection
      ? "mixed"
      : "classifier";

  return freezeCapabilityDecision({
    rag,
    webSearch,
    webFetch,
    memoryRead,
    memoryWrite,
    memoryDelete,
    memoryDeleteTarget: memoryDelete ? resolvedMemoryTarget : null,
    routineProposal,
    userContext,
    voiceOutput,
    source,
    reasonCodes,
  });
}

export function getCapabilityPlannerMode(): "legacy" | "agentic" {
  return process.env.AI_CAPABILITY_PLANNER_MODE === "agentic"
    ? "agentic"
    : "legacy";
}
