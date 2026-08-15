import { describe, expect, it } from "vitest";
import {
  CHAT_METADATA_MODEL_CANDIDATES,
  CHAT_METADATA_MODEL_ID,
  getChatMetadataProviderOptions,
} from "./chat-metadata-model";

describe("chat metadata model routing", () => {
  it("compares the incumbent with Gemini Flash Lite and Nemotron", () => {
    expect(CHAT_METADATA_MODEL_CANDIDATES).toEqual([
      "deepseek/deepseek-v4-flash",
      "google/gemini-2.5-flash-lite",
      "nvidia/nemotron-3.5-lightning",
    ]);
  });

  it("keeps the incumbent until a consolidation candidate clears the eval", () => {
    expect(CHAT_METADATA_MODEL_ID).toBe("deepseek/deepseek-v4-flash");
  });

  it("uses the generic classifier-safe provider options for the candidate", () => {
    expect(
      getChatMetadataProviderOptions("google/gemini-2.5-flash-lite", {}),
    ).toEqual({
      provider: { sort: "latency", require_parameters: true },
      reasoning: { enabled: false, max_tokens: 1 },
    });
  });

  it("routes Nemotron metadata across structured-output endpoints", () => {
    expect(
      getChatMetadataProviderOptions("nvidia/nemotron-3.5-lightning", {}),
    ).toEqual({
      provider: {
        sort: "latency",
        order: ["DeepInfra", "CoreWeave", "Venice"],
        allow_fallbacks: true,
        require_parameters: true,
        max_price: { prompt: 0.1, completion: 0.25 },
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
