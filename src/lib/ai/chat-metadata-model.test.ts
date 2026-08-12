import { describe, expect, it } from "vitest";
import {
  CHAT_METADATA_MODEL_CANDIDATES,
  CHAT_METADATA_MODEL_ID,
  getChatMetadataProviderOptions,
} from "./chat-metadata-model";

describe("chat metadata model routing", () => {
  it("compares the two DeepSeek revisions with Nemotron without aliases", () => {
    expect(CHAT_METADATA_MODEL_CANDIDATES).toEqual([
      "deepseek/deepseek-v4-flash",
      "deepseek/deepseek-v4-flash-0731",
      "nvidia/nemotron-3.5-lightning",
    ]);
  });

  it("keeps the incumbent until a consolidation candidate clears the eval", () => {
    expect(CHAT_METADATA_MODEL_ID).toBe("deepseek/deepseek-v4-flash");
  });

  it("uses the measured light provider pool for DeepSeek 0731 metadata", () => {
    expect(
      getChatMetadataProviderOptions("deepseek/deepseek-v4-flash-0731", {}),
    ).toEqual({
      provider: {
        sort: "latency",
        only: ["Together", "CoreWeave", "Ambient"],
        allow_fallbacks: true,
        require_parameters: true,
        max_price: { prompt: 0.15, completion: 0.3 },
      },
      reasoning: { enabled: false, max_tokens: 1 },
    });
  });

  it("pins Nemotron metadata to its structured-output endpoint", () => {
    expect(
      getChatMetadataProviderOptions("nvidia/nemotron-3.5-lightning", {}),
    ).toEqual({
      provider: {
        sort: "latency",
        only: ["DeepInfra"],
        allow_fallbacks: false,
        require_parameters: true,
        max_price: { prompt: 0.05, completion: 0.2 },
      },
      reasoning: { enabled: false, max_tokens: 1 },
    });
  });

  it("requires structured parameters and disables reasoning for the incumbent", () => {
    expect(
      getChatMetadataProviderOptions("deepseek/deepseek-v4-flash", {}),
    ).toEqual({
      provider: {
        sort: "latency",
        require_parameters: true,
      },
      reasoning: { enabled: false, max_tokens: 1 },
    });
  });
});
