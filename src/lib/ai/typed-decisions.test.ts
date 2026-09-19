import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getJevDecisionMode,
  requestTypedDecision,
  requestTypedDecisions,
} from "./typed-decisions";

vi.mock("./providers/openrouter-routing", () => ({
  getOpenRouterProviderOptionsForModel: () => ({
    provider: { data_collection: "deny" },
  }),
}));

const input = {
  instructions: "Classify supplied content.",
  criteria: { yes: "Relevant", no: "Irrelevant" },
  state: { text: "Synthetic example" },
};
const payload = {
  model: "typesafe/jev-1.13",
  answers: { decision: { type: "choice", choice: "yes", confidence: 0.99 } },
  usage: { input_tokens: 100, output_tokens: 10, cost: 0.0000042 },
};
describe("OpenRouter typed decisions", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "synthetic-key");
    vi.stubEnv("OPENROUTER_BASE_URL", "http://127.0.0.1:4317/api/v1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses the dedicated typed endpoint, provider policy and validated usage", async () => {
    expect(await requestTypedDecision(input)).toMatchObject({
      ok: true,
      choice: "yes",
      confidence: 0.99,
      usage: payload.usage,
      attempted: true,
    });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://127.0.0.1:4317/api/alpha/decisions");
    expect(JSON.parse(init?.body as string)).toEqual({
      model: "typesafe/jev-1.13",
      state: input.state,
      provider: { data_collection: "deny" },
      questions: {
        decision: {
          type: "choice",
          instructions: input.instructions,
          criteria: input.criteria,
        },
      },
    });
  });

  it.each([
    { type: "choice", choice: "injected", confidence: 1 },
    { type: "choice", choice: "yes", confidence: 3 },
    { type: "choice", choice: "yes" },
    { type: "score", choice: "yes", confidence: 1 },
  ])(
    "rejects malformed or unknown answers without exposing raw content",
    async (answer) => {
      vi.mocked(fetch).mockResolvedValue(
        Response.json({
          ...payload,
          answers: { decision: answer },
          secret: "private",
        }),
      );
      const result = await requestTypedDecision(input);
      expect(result).toMatchObject({
        ok: false,
        failureCode: "invalid_output",
        usage: payload.usage,
      });
      expect(JSON.stringify(result)).not.toContain("private");
    },
  );

  it("uses the chosen probability if confidence is omitted", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        ...payload,
        answers: {
          decision: {
            type: "choice",
            choice: "no",
            probabilities: { yes: 0.01, no: 0.99 },
          },
        },
      }),
    );
    expect(await requestTypedDecision(input)).toMatchObject({
      ok: true,
      choice: "no",
      confidence: 0.99,
    });
  });

  it("evaluates independent questions in one request with one usage observation", async () => {
    const questions = {
      supported: {
        instructions: "Is the fact supported?",
        criteria: input.criteria,
      },
      relation: {
        instructions: "How does the new fact relate to the stored fact?",
        criteria: { duplicate: "Same fact", distinct: "Different fact" },
      },
    };
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        ...payload,
        answers: {
          supported: { type: "choice", choice: "yes", confidence: 0.99 },
          relation: { type: "choice", choice: "distinct", confidence: 0.96 },
        },
      }),
    );
    expect(
      await requestTypedDecisions({ state: input.state, questions }),
    ).toMatchObject({
      ok: true,
      answers: {
        supported: { choice: "yes", confidence: 0.99 },
        relation: { choice: "distinct", confidence: 0.96 },
      },
      usage: payload.usage,
    });
    expect(fetch).toHaveBeenCalledOnce();
    const request = JSON.parse(
      vi.mocked(fetch).mock.calls[0][1]?.body as string,
    );
    expect(request.questions).toEqual({
      supported: { type: "choice", ...questions.supported },
      relation: { type: "choice", ...questions.relation },
    });
  });

  it.each([
    {},
    { type: "choice", choice: "yes", confidence: 0.99 },
    { type: "choice", choice: "distinct", confidence: -1 },
  ])(
    "rejects an incomplete batch or a choice from another question",
    async (relation) => {
      vi.mocked(fetch).mockResolvedValue(
        Response.json({
          ...payload,
          answers: {
            supported: { type: "choice", choice: "yes", confidence: 0.99 },
            ...(Object.keys(relation).length ? { relation } : {}),
          },
        }),
      );
      expect(
        await requestTypedDecisions({
          state: input.state,
          questions: {
            supported: {
              instructions: input.instructions,
              criteria: input.criteria,
            },
            relation: {
              instructions: "Compare facts",
              criteria: { distinct: "Different facts" },
            },
          },
        }),
      ).toMatchObject({
        ok: false,
        failureCode: "invalid_output",
        usage: payload.usage,
      });
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it("rejects an unbounded question batch before making a paid request", async () => {
    const questions = Object.fromEntries(
      Array.from({ length: 65 }, (_, index) => [
        String(index),
        {
          instructions: input.instructions,
          criteria: input.criteria,
        },
      ]),
    );
    expect(
      await requestTypedDecisions({ state: input.state, questions }),
    ).toMatchObject({
      ok: false,
      attempted: false,
      failureCode: "configuration_error",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires both a valid rollout mode and an exact cohort member", () => {
    vi.stubEnv("AI_JEV_ALLOWED_USER_IDS", "user-1, user-2, *");
    expect(getJevDecisionMode("active", "user-1")).toBe("active");
    expect(getJevDecisionMode("shadow", "user-2")).toBe("shadow");
    expect(getJevDecisionMode("off", "user-1")).toBe("off");
    expect(getJevDecisionMode(undefined, "user-1")).toBe("off");
    expect(getJevDecisionMode("invalid", "user-1")).toBe("off");
    expect(getJevDecisionMode("active", "user-10")).toBe("off");
    expect(getJevDecisionMode("active", "*")).toBe("off");
    expect(getJevDecisionMode("active")).toBe("off");
    vi.stubEnv("AI_JEV_ALLOWED_USER_IDS", "");
    expect(getJevDecisionMode("active", "user-1")).toBe("off");
  });

  it("retains the provider's served snapshot for cost attribution", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ ...payload, model: "typesafe/jev-1.13-20260917" }),
    );
    expect(await requestTypedDecision(input)).toMatchObject({
      ok: true,
      modelId: "typesafe/jev-1.13-20260917",
    });
  });

  it("returns an observed failed attempt when cancellation happens during a request", async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockImplementation(async () => {
      controller.abort();
      throw controller.signal.reason;
    });
    expect(
      await requestTypedDecision({ ...input, abortSignal: controller.signal }),
    ).toMatchObject({ ok: false, attempted: true, failureCode: "timeout" });
  });

  it("retains billed usage on a failed request and never retries", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json(
        { error: { message: "private" }, usage: payload.usage },
        { status: 429 },
      ),
    );
    expect(await requestTypedDecision(input)).toMatchObject({
      ok: false,
      failureCode: "provider_error",
      statusCode: 429,
      usage: payload.usage,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not call the provider when configuration is missing", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(await requestTypedDecision(input)).toMatchObject({
      ok: false,
      failureCode: "configuration_error",
      attempted: false,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("bounds the request timeout and propagates external cancellation", async () => {
    vi.mocked(fetch).mockImplementation(
      async (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    expect(
      await requestTypedDecision({ ...input, timeoutMs: 10 }),
    ).toMatchObject({ ok: false, failureCode: "timeout" });
    const controller = new AbortController();
    controller.abort();
    await expect(
      requestTypedDecision({ ...input, abortSignal: controller.signal }),
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
