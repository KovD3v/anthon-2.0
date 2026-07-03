import { describe, expect, it } from "vitest";
import {
  getOpenRouterProviderOptions,
  getOpenRouterProviderOptionsForModel,
  getOpenRouterProviderRouting,
} from "./openrouter-routing";

describe("ai/providers/openrouter-routing", () => {
  it("uses latency-first provider routing when env is unset", () => {
    expect(getOpenRouterProviderRouting({})).toEqual({ sort: "latency" });
    expect(getOpenRouterProviderOptions({})).toEqual({
      provider: { sort: "latency" },
    });
  });

  it("does not hardcode model-specific providers when env is unset", () => {
    expect(getOpenRouterProviderOptionsForModel("z-ai/glm-5.2", {})).toEqual({
      provider: {
        sort: "latency",
      },
    });
  });

  it("builds provider routing from environment variables", () => {
    expect(
      getOpenRouterProviderRouting({
        OPENROUTER_PROVIDER_SORT: "latency",
        OPENROUTER_PROVIDER_ORDER: "fireworks, novita",
        OPENROUTER_PROVIDER_ONLY: "fireworks",
        OPENROUTER_PROVIDER_IGNORE: "slow-provider",
        OPENROUTER_PROVIDER_ALLOW_FALLBACKS: "false",
        OPENROUTER_PROVIDER_REQUIRE_PARAMETERS: "true",
        OPENROUTER_PROVIDER_DATA_COLLECTION: "deny",
      }),
    ).toEqual({
      sort: "latency",
      order: ["fireworks", "novita"],
      only: ["fireworks"],
      ignore: ["slow-provider"],
      allow_fallbacks: false,
      require_parameters: true,
      data_collection: "deny",
    });
  });

  it("adds OpenRouter provider constraints from environment variables", () => {
    expect(
      getOpenRouterProviderRouting({
        OPENROUTER_PROVIDER_SORT: "throughput",
        OPENROUTER_PROVIDER_QUANTIZATIONS: "fp8, int8",
        OPENROUTER_PROVIDER_MAX_PROMPT_PRICE: "0.000002",
        OPENROUTER_PROVIDER_MAX_COMPLETION_PRICE: "0.000006",
        OPENROUTER_PROVIDER_MAX_REQUEST_PRICE: "0.01",
        OPENROUTER_PROVIDER_MAX_IMAGE_PRICE: "0.001",
        OPENROUTER_PROVIDER_MAX_AUDIO_PRICE: "0.003",
        OPENROUTER_PROVIDER_ZDR: "true",
      }),
    ).toEqual({
      sort: "throughput",
      quantizations: ["fp8", "int8"],
      max_price: {
        prompt: 0.000002,
        completion: 0.000006,
        image: 0.001,
        audio: 0.003,
        request: 0.01,
      },
      zdr: true,
    });
  });

  it("wraps provider routing for AI SDK OpenRouter provider options", () => {
    expect(
      getOpenRouterProviderOptions({
        OPENROUTER_PROVIDER_SORT: "e2e-latency",
        OPENROUTER_PROVIDER_E2E_METRICS:
          "wafer/fast:1.32:78:6.08,fireworks/fast:1.07:107:5.48,wandb/fp8:2.00:80:5.78",
        OPENROUTER_PROVIDER_COST_METRICS:
          "fireworks/fast:0.0000021:0.0000066,wandb/fp8:0.00000139:0.0000044,wafer/fast:0.000003:0.00001025",
        OPENROUTER_PROVIDER_E2E_INPUT_TOKENS: "2500",
        OPENROUTER_PROVIDER_E2E_OUTPUT_TOKENS: "300",
        OPENROUTER_PROVIDER_E2E_MAX_SECONDS: "10",
        OPENROUTER_PROVIDER_E2E_COST_WEIGHT: "150",
      }),
    ).toEqual({
      provider: {
        order: ["wandb/fp8", "fireworks/fast", "wafer/fast"],
        only: ["wandb/fp8", "fireworks/fast", "wafer/fast"],
      },
    });
  });

  it("memoizes provider options for unchanged routing inputs", () => {
    const env = {
      OPENROUTER_PROVIDER_SORT: "e2e-latency",
      OPENROUTER_PROVIDER_E2E_METRICS:
        "z-ai/glm-5.2=fast:4,google/gemini-2.5-flash=gemini:2",
    };

    const first = getOpenRouterProviderOptionsForModel("z-ai/glm-5.2", env);
    const second = getOpenRouterProviderOptionsForModel("z-ai/glm-5.2", env);
    const otherModel = getOpenRouterProviderOptionsForModel(
      "google/gemini-2.5-flash",
      env,
    );

    expect(second).toBe(first);
    expect(otherModel).not.toBe(first);
    expect(otherModel).toEqual({
      provider: {
        order: ["gemini"],
      },
    });

    env.OPENROUTER_PROVIDER_E2E_METRICS =
      "z-ai/glm-5.2=slower:6,google/gemini-2.5-flash=gemini:2";

    const changed = getOpenRouterProviderOptionsForModel("z-ai/glm-5.2", env);

    expect(changed).not.toBe(first);
    expect(changed).toEqual({
      provider: {
        order: ["slower"],
      },
    });
  });

  it("estimates e2e latency from latency and throughput when e2e is omitted", () => {
    expect(
      getOpenRouterProviderOptions({
        OPENROUTER_PROVIDER_SORT: "e2e-latency",
        OPENROUTER_PROVIDER_E2E_OUTPUT_TOKENS: "200",
        OPENROUTER_PROVIDER_E2E_METRICS:
          "slow-first-fast-throughput:3:200,fast-first-slow-throughput:1:20",
      }),
    ).toEqual({
      provider: {
        order: ["slow-first-fast-throughput", "fast-first-slow-throughput"],
      },
    });
  });

  it("uses model-specific provider metrics before global fallback rows", () => {
    const env = {
      OPENROUTER_PROVIDER_SORT: "e2e-latency",
      OPENROUTER_PROVIDER_E2E_METRICS:
        "global-fast:4,z-ai/glm-5.2=wandb/fp8:5.78,z-ai/glm-5.2=fireworks/fast:5.48,google/gemini-2.5-flash=gemini-provider:2",
      OPENROUTER_PROVIDER_COST_METRICS:
        "global-fast:0.000001:0.000001,z-ai/glm-5.2=wandb/fp8:0.00000139:0.0000044,z-ai/glm-5.2=fireworks/fast:0.0000021:0.0000066,google/gemini-2.5-flash=gemini-provider:0.0000005:0.000001",
      OPENROUTER_PROVIDER_E2E_INPUT_TOKENS: "2500",
      OPENROUTER_PROVIDER_E2E_OUTPUT_TOKENS: "300",
      OPENROUTER_PROVIDER_E2E_COST_WEIGHT: "150",
    };

    expect(getOpenRouterProviderOptionsForModel("z-ai/glm-5.2", env)).toEqual({
      provider: {
        order: ["global-fast", "wandb/fp8", "fireworks/fast"],
      },
    });
    expect(
      getOpenRouterProviderOptionsForModel("google/gemini-2.5-flash", env),
    ).toEqual({
      provider: {
        order: ["gemini-provider", "global-fast"],
      },
    });
  });

  it("penalizes providers with recent errors instead of blocking them", () => {
    expect(
      getOpenRouterProviderOptionsForModel("z-ai/glm-5.2", {
        OPENROUTER_PROVIDER_SORT: "e2e-latency",
        OPENROUTER_PROVIDER_E2E_METRICS:
          "z-ai/glm-5.2=Parasail:4,z-ai/glm-5.2=Wafer:5,z-ai/glm-5.2=Together:6",
        OPENROUTER_PROVIDER_E2E_MAX_SECONDS: "10",
        OPENROUTER_PROVIDER_RECENT_ERRORS:
          "z-ai/glm-5.2=Parasail:1, z-ai/glm-5.2=Wafer:2",
      }),
    ).toEqual({
      provider: {
        order: ["Together", "Parasail", "Wafer"],
        only: ["Together", "Parasail", "Wafer"],
      },
    });
  });

  it("puts providers with three or more recent errors in cooldown when alternatives remain", () => {
    expect(
      getOpenRouterProviderOptionsForModel("z-ai/glm-5.2", {
        OPENROUTER_PROVIDER_SORT: "e2e-latency",
        OPENROUTER_PROVIDER_E2E_METRICS:
          "z-ai/glm-5.2=Parasail:4,z-ai/glm-5.2=Wafer:5,z-ai/glm-5.2=Together:6",
        OPENROUTER_PROVIDER_E2E_MAX_SECONDS: "10",
        OPENROUTER_PROVIDER_RECENT_ERRORS:
          "z-ai/glm-5.2=Parasail:3, z-ai/glm-5.2=Wafer:2",
      }),
    ).toEqual({
      provider: {
        order: ["Together", "Wafer"],
        only: ["Together", "Wafer"],
      },
    });
  });

  it("uses provider health snapshots to avoid bad tail latency", () => {
    expect(
      getOpenRouterProviderOptionsForModel("z-ai/glm-5.2", {
        OPENROUTER_PROVIDER_SORT: "e2e-latency",
        OPENROUTER_PROVIDER_E2E_METRICS:
          "z-ai/glm-5.2=fast-tail-risk:4,z-ai/glm-5.2=steady:5",
        OPENROUTER_PROVIDER_HEALTH: JSON.stringify({
          "z-ai/glm-5.2": {
            "fast-tail-risk": {
              successWeight: 30,
              failureWeight: 0,
              p50LatencySeconds: 4,
              p95LatencySeconds: 18,
              sampleCount: 30,
            },
            steady: {
              successWeight: 30,
              failureWeight: 0,
              p50LatencySeconds: 5,
              p95LatencySeconds: 7,
              sampleCount: 30,
            },
          },
        }),
      }),
    ).toEqual({
      provider: {
        order: ["steady", "fast-tail-risk"],
      },
    });
  });

  it("uses provider health snapshots to price slow failed attempts before fallback", () => {
    expect(
      getOpenRouterProviderOptionsForModel("z-ai/glm-5.2", {
        OPENROUTER_PROVIDER_SORT: "e2e-latency",
        OPENROUTER_PROVIDER_E2E_METRICS:
          "z-ai/glm-5.2=fast-when-it-works:3,z-ai/glm-5.2=reliable:6",
        OPENROUTER_PROVIDER_HEALTH: JSON.stringify({
          "z-ai/glm-5.2": {
            "fast-when-it-works": {
              successWeight: 8,
              failureWeight: 2,
              p50LatencySeconds: 3,
              p95LatencySeconds: 5,
              avgFailedAttemptLatencySeconds: 10,
              sampleCount: 10,
            },
            reliable: {
              successWeight: 20,
              failureWeight: 0,
              p50LatencySeconds: 6,
              p95LatencySeconds: 7,
              sampleCount: 20,
            },
          },
        }),
      }),
    ).toEqual({
      provider: {
        order: ["reliable", "fast-when-it-works"],
      },
    });
  });

  it("skips providers in cooldown only when alternatives remain", () => {
    const now = "2026-06-28T21:00:00.000Z";

    expect(
      getOpenRouterProviderOptionsForModel("z-ai/glm-5.2", {
        OPENROUTER_PROVIDER_SORT: "e2e-latency",
        OPENROUTER_PROVIDER_E2E_METRICS:
          "z-ai/glm-5.2=cooling-down:3,z-ai/glm-5.2=available:6",
        OPENROUTER_PROVIDER_HEALTH: JSON.stringify({
          "z-ai/glm-5.2": {
            "cooling-down": {
              cooldownUntil: "2026-06-28T21:05:00.000Z",
            },
          },
        }),
        OPENROUTER_PROVIDER_ROUTING_NOW: now,
      }),
    ).toEqual({
      provider: {
        order: ["available"],
      },
    });
  });

  it("keeps a single cooldown provider when no alternatives remain", () => {
    expect(
      getOpenRouterProviderOptionsForModel("z-ai/glm-5.2", {
        OPENROUTER_PROVIDER_SORT: "e2e-latency",
        OPENROUTER_PROVIDER_E2E_METRICS: "z-ai/glm-5.2=cooling-down:3",
        OPENROUTER_PROVIDER_HEALTH: JSON.stringify({
          "z-ai/glm-5.2": {
            "cooling-down": {
              cooldownUntil: "2026-06-28T21:05:00.000Z",
            },
          },
        }),
        OPENROUTER_PROVIDER_ROUTING_NOW: "2026-06-28T21:00:00.000Z",
      }),
    ).toEqual({
      provider: {
        order: ["cooling-down"],
      },
    });
  });

  it("rejects invalid booleans and data collection values", () => {
    expect(() =>
      getOpenRouterProviderRouting({
        OPENROUTER_PROVIDER_ALLOW_FALLBACKS: "maybe",
      }),
    ).toThrow(/true or false/);

    expect(() =>
      getOpenRouterProviderRouting({
        OPENROUTER_PROVIDER_DATA_COLLECTION: "unknown",
      }),
    ).toThrow(/allow.*deny/);

    expect(() =>
      getOpenRouterProviderRouting({
        OPENROUTER_PROVIDER_SORT: "ttft",
      }),
    ).toThrow(/e2e-latency/);

    expect(() =>
      getOpenRouterProviderRouting({
        OPENROUTER_PROVIDER_MAX_PROMPT_PRICE: "0",
      }),
    ).toThrow(/OPENROUTER_PROVIDER_MAX_PROMPT_PRICE/);

    expect(() =>
      getOpenRouterProviderRouting({
        OPENROUTER_PROVIDER_SORT: "e2e-latency",
      }),
    ).toThrow(/OPENROUTER_PROVIDER_E2E_METRICS/);
  });
});
