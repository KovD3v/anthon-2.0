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
import { isExactStableMemoryKey } from "./memory-target";

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
  resolvedMemoryTarget?: string | null;
  classifier: Partial<CapabilityDecision> | null;
};

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
  return isExactStableMemoryKey(target) ? target : null;
}

const capabilityClassifierSchema = z
  .object({
    rag: z.enum(["yes", "no", "uncertain"]),
    webSearch: z.enum(["yes", "no", "uncertain"]),
    webFetch: z.enum(["yes", "no", "uncertain"]),
    memoryRead: z.enum(["yes", "no", "uncertain"]),
    memoryWrite: z.enum(["yes", "no", "uncertain"]),
    memoryDelete: z.enum(["yes", "no", "uncertain"]),
    routineProposal: z.enum(["yes", "no", "uncertain"]),
    userContext: z.enum(["yes", "no", "uncertain"]),
    voiceOutput: z.enum(["yes", "no", "uncertain"]),
    confidence: z.number().min(0).max(1),
  })
  .strict();

type ClassifierInput = {
  userMessage: string;
  context: string;
  modelId: string;
  userId?: string;
  abortSignal?: AbortSignal;
};

function hasUncertainCapability(
  output: z.infer<typeof capabilityClassifierSchema>,
) {
  return Object.entries(output).some(
    ([key, value]) => key !== "confidence" && value === "uncertain",
  );
}

function toClassifierDecision(
  output: z.infer<typeof capabilityClassifierSchema>,
): Partial<CapabilityDecision> {
  return {
    rag: output.rag === "yes",
    webSearch: output.webSearch === "yes",
    webFetch: output.webFetch === "yes",
    memoryRead: output.memoryRead === "yes",
    memoryWrite: output.memoryWrite === "yes",
    memoryDelete: output.memoryDelete === "yes",
    routineProposal: output.routineProposal === "yes",
    userContext: output.userContext === "yes",
    voiceOutput: output.voiceOutput === "yes",
  };
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
    const boundedContext = context.slice(0, MAX_CLASSIFIER_CONTEXT_CHARS);
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
          prompt: `Classify optional capabilities for the next Anthon chat turn.

Return yes only when the capability is materially useful for this message.
Use uncertain for any capability that cannot be selected with confidence.
Persistent-memory changes require an explicit user request. Voice output requires an explicit voice response mode.

Context:
${boundedContext}

User message:
${JSON.stringify(userMessage)}`,
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
    if (
      !parsed.success ||
      parsed.data.confidence < CAPABILITY_CLASSIFIER_MIN_CONFIDENCE ||
      hasUncertainCapability(parsed.data)
    ) {
      return null;
    }

    return toClassifierDecision(parsed.data);
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
    persistentMemoryAllowed && (explicitMemoryWrite || proposed("memoryWrite"));
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

  return {
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
  };
}

export function getCapabilityPlannerMode(): "legacy" | "agentic" {
  return process.env.AI_CAPABILITY_PLANNER_MODE === "agentic"
    ? "agentic"
    : "legacy";
}
