import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestTypedDecision } from "./typed-decisions";

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
