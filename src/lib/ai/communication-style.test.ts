import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";
import {
  analyzeUserStyle,
  PROMPT_ANTHON_CONVERSATIONAL_VOICE,
} from "./communication-style";

function userMessage(content: string): ModelMessage {
  return { role: "user", content };
}

describe("Anthon communication style", () => {
  it("encodes the compact conversational rhythm without copying errors", () => {
    expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
      "Default to compact turns",
    );
    expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
      "Use punctuation lightly",
    );
    expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain("Default to none");
    expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
      "never manufacture typos",
    );
    expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
      "Remain transparently Anthon",
    );
  });

  it("does not turn one user emoji into a general emoji instruction", () => {
    const instruction = analyzeUserStyle([
      userMessage("Ciao 💪🏻"),
      userMessage("come va"),
      userMessage("dimmi"),
    ]);

    expect(instruction).toContain("very concise and direct");
    expect(instruction).not.toContain("regularly uses emoji");
  });

  it("mirrors repeated emoji use without allowing decoration or repetition", () => {
    const instruction = analyzeUserStyle([
      userMessage("Ciao 💪🏻"),
      userMessage("Fatto ✅"),
      userMessage("ok"),
    ]);

    expect(instruction).toContain("regularly uses emoji");
    expect(instruction).toContain("at most one");
    expect(instruction).toContain("without decorative or repeated emoji");
  });
});
