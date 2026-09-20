import { z } from "zod";
import { getOpenRouterProviderOptionsForModel } from "./providers/openrouter-routing";

export const JEV_MODEL_ID = "typesafe/jev-1.13";
const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
const probability = z.number().finite().min(0).max(1);
const usageSchema = z.object({
  input_tokens: z.number().int().nonnegative().optional(),
  output_tokens: z.number().int().nonnegative().optional(),
  cost: z.number().finite().nonnegative().optional(),
});

export type TypedDecisionUsage = z.infer<typeof usageSchema>;
export type TypedDecisionFailure =
  | "configuration_error"
  | "timeout"
  | "provider_error"
  | "invalid_output";
export type DecisionMetadata = {
  modelId: string;
  durationMs: number;
  attempted: boolean;
  usage?: TypedDecisionUsage;
};
export type TypedDecisionQuestion = {
  instructions: string;
  criteria: Record<string, string>;
};
export type TypedDecisionAnswer = {
  choice: string;
  /** Distribution-shape score; not the probability of the selected option. */
  confidence: number;
  probability?: number;
  probabilities?: Record<string, number>;
};
type DecisionFailure = {
  ok: false;
  failureCode: TypedDecisionFailure;
  statusCode?: number;
};
export type TypedDecisionResult<Choice extends string> = DecisionMetadata &
  ({ ok: true; choice: Choice; confidence: number } | DecisionFailure);
export type TypedDecisionsResult = DecisionMetadata &
  (
    | { ok: true; answers: Record<string, TypedDecisionAnswer> }
    | DecisionFailure
  );

/** New decision features require both an explicit mode and a staged cohort. */
export function getJevDecisionMode(
  configuredMode: string | undefined,
  userId?: string,
): "off" | "shadow" | "active" {
  if (!userId || (configuredMode !== "shadow" && configuredMode !== "active"))
    return "off";
  const allowed = (process.env.AI_JEV_ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id && id !== "*");
  return allowed.includes(userId) ? configuredMode : "off";
}

export interface TypedDecisionInput<Choice extends string> {
  modelId?: string;
  instructions: string;
  criteria: Record<Choice, string>;
  state: Record<string, unknown>;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}

export type TypedDecisionsInput = Omit<
  TypedDecisionInput<string>,
  "instructions" | "criteria"
> & { questions: Record<string, TypedDecisionQuestion> };

const questionsSchema = z
  .record(
    z.string().min(1).max(120),
    z.object({
      instructions: z.string().trim().min(1),
      criteria: z
        .record(z.string().min(1), z.string().trim().min(1))
        .refine((criteria) => Object.keys(criteria).length > 0),
    }),
  )
  .refine((questions) => {
    const count = Object.keys(questions).length;
    return count > 0 && count <= 64;
  });

const answersSchema = z.object({
  model: z.string().min(1),
  answers: z.record(
    z.string(),
    z.object({
      type: z.literal("choice"),
      choice: z.string(),
      confidence: probability.optional(),
      probabilities: z.record(z.string(), probability).optional(),
    }),
  ),
});

export async function requestTypedDecision<Choice extends string>(
  input: TypedDecisionInput<Choice>,
): Promise<TypedDecisionResult<Choice>> {
  const { instructions, criteria, ...shared } = input;
  const result = await requestTypedDecisions({
    ...shared,
    questions: { decision: { instructions, criteria } },
  });
  if (!result.ok) return result;
  const { answers, ...metadata } = result;
  return {
    ...metadata,
    choice: answers.decision.choice as Choice,
    confidence: answers.decision.confidence,
  };
}

/** Dedicated Decisions transport. It returns only typed values and usage,
 * never response text or error bodies. Callers schedule their existing meter.
 * Contract: OpenRouterTeam/typescript-sdk, alphaDecisionsCreate + decisionsresponse.
 */
export async function requestTypedDecisions(
  input: TypedDecisionsInput,
): Promise<TypedDecisionsResult> {
  input.abortSignal?.throwIfAborted();
  const startedAt = performance.now();
  const modelId = input.modelId ?? JEV_MODEL_ID;
  const metadata = (): DecisionMetadata => ({
    modelId,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    attempted: false,
  });
  const apiKey = process.env.OPENROUTER_API_KEY;
  const questions = questionsSchema.safeParse(input.questions);
  const timeoutMs = input.timeoutMs ?? 1500;
  if (
    !apiKey ||
    !questions.success ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0
  ) {
    return { ...metadata(), ok: false, failureCode: "configuration_error" };
  }
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = input.abortSignal
    ? AbortSignal.any([input.abortSignal, timeout])
    : timeout;
  let usage: TypedDecisionUsage | undefined;
  try {
    const provider = getOpenRouterProviderOptionsForModel(modelId).provider;
    const response = await fetch(
      new URL(
        "/api/alpha/decisions",
        process.env.OPENROUTER_BASE_URL || DECISIONS_URL,
      ).toString(),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "Anthon",
        },
        body: JSON.stringify({
          model: modelId,
          ...(provider ? { provider } : {}),
          state: input.state,
          questions: Object.fromEntries(
            Object.entries(questions.data).map(([id, question]) => [
              id,
              { type: "choice", ...question },
            ]),
          ),
        }),
        signal,
      },
    );
    const raw: unknown = await response.json().catch(() => null);
    const envelope = z.object({ usage: usageSchema.optional() }).safeParse(raw);
    usage = envelope.success ? envelope.data.usage : undefined;
    if (signal.aborted)
      return {
        ...metadata(),
        attempted: true,
        ok: false,
        failureCode: "timeout",
        usage,
      };
    if (!response.ok) {
      return {
        ...metadata(),
        attempted: true,
        ok: false,
        failureCode: "provider_error",
        statusCode: response.status,
        usage,
      };
    }
    const parsed = answersSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ...metadata(),
        attempted: true,
        ok: false,
        failureCode: "invalid_output",
        usage,
      };
    }
    const answers: Record<string, TypedDecisionAnswer> = Object.create(null);
    for (const [id, question] of Object.entries(questions.data)) {
      const answer = Object.hasOwn(parsed.data.answers, id)
        ? parsed.data.answers[id]
        : undefined;
      const confidence =
        answer?.confidence ?? answer?.probabilities?.[answer.choice];
      const probabilities = answer?.probabilities;
      const selectedProbability = probabilities?.[answer?.choice ?? ""];
      const options = Object.keys(question.criteria);
      if (
        !answer ||
        !Object.hasOwn(question.criteria, answer.choice) ||
        confidence === undefined ||
        (probabilities &&
          (Object.keys(probabilities).length !== options.length ||
            options.some((option) => !Object.hasOwn(probabilities, option)) ||
            selectedProbability === undefined ||
            Object.values(probabilities).some(
              (value) => value > selectedProbability,
            ) ||
            Math.abs(
              Object.values(probabilities).reduce(
                (sum, value) => sum + value,
                0,
              ) - 1,
            ) > 0.02))
      ) {
        return {
          ...metadata(),
          modelId: parsed.data.model,
          attempted: true,
          ok: false,
          failureCode: "invalid_output",
          usage,
        };
      }
      answers[id] = {
        choice: answer.choice,
        confidence,
        ...(probabilities
          ? { probability: selectedProbability, probabilities }
          : {}),
      };
    }
    return {
      ...metadata(),
      modelId: parsed.data.model,
      attempted: true,
      ok: true,
      answers,
      usage,
    };
  } catch {
    return {
      ...metadata(),
      attempted: true,
      ok: false,
      failureCode: signal.aborted ? "timeout" : "provider_error",
      usage,
    };
  }
}
