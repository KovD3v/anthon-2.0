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
type DecisionMetadata = {
  modelId: string;
  durationMs: number;
  attempted: boolean;
  usage?: TypedDecisionUsage;
};
export type TypedDecisionResult<Choice extends string> = DecisionMetadata &
  (
    | { ok: true; choice: Choice; confidence: number }
    | { ok: false; failureCode: TypedDecisionFailure; statusCode?: number }
  );

export interface TypedDecisionInput<Choice extends string> {
  modelId?: string;
  instructions: string;
  criteria: Record<Choice, string>;
  state: Record<string, unknown>;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}

/** Dedicated Decisions transport. It returns only typed values and usage,
 * never response text or error bodies. Callers schedule their existing meter.
 * Contract: OpenRouterTeam/typescript-sdk, alphaDecisionsCreate + decisionsresponse.
 */
export async function requestTypedDecision<Choice extends string>(
  input: TypedDecisionInput<Choice>,
): Promise<TypedDecisionResult<Choice>> {
  input.abortSignal?.throwIfAborted();
  const startedAt = performance.now();
  const modelId = input.modelId ?? JEV_MODEL_ID;
  const metadata = (): DecisionMetadata => ({
    modelId,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    attempted: false,
  });
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { ...metadata(), ok: false, failureCode: "configuration_error" };
  }
  const timeout = AbortSignal.timeout(input.timeoutMs ?? 1500);
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
          questions: {
            decision: {
              type: "choice",
              instructions: input.instructions,
              criteria: input.criteria,
            },
          },
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
    const parsed = z
      .object({
        model: z.string().min(1),
        answers: z.object({
          decision: z.object({
            type: z.literal("choice"),
            choice: z.string(),
            confidence: probability.optional(),
            probabilities: z.record(z.string(), probability).optional(),
          }),
        }),
      })
      .safeParse(raw);
    const answer = parsed.success ? parsed.data.answers.decision : undefined;
    if (!answer || !Object.hasOwn(input.criteria, answer.choice)) {
      return {
        ...metadata(),
        attempted: true,
        ok: false,
        failureCode: "invalid_output",
        usage,
      };
    }
    const confidence =
      answer.confidence ?? answer.probabilities?.[answer.choice];
    if (confidence === undefined) {
      return {
        ...metadata(),
        attempted: true,
        ok: false,
        failureCode: "invalid_output",
        usage,
      };
    }
    return {
      ...metadata(),
      modelId: parsed.success ? parsed.data.model : modelId,
      attempted: true,
      ok: true,
      choice: answer.choice as Choice,
      confidence,
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
