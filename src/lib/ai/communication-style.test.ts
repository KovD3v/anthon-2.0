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
      "one assistant response",
    );
    expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
      "one to four short lines",
    );
    expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
      "up to six focused lines",
    );
    expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
      "one sentence or one idea per line",
    );
    expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
      "Use punctuation lightly",
    );
    expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
      "selective but perceptible",
    );
    expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain("two or three emoji");
    expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
      "💪🏻, ❤️, 💥, 🔥, 🎯, 🤣, or 😂",
    );
    expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
      "one response in six to eight",
    );
    expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).not.toContain(
      "use at most one appropriate emoji",
    );
    expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).not.toContain(
      "do not use emoji in consecutive assistant replies",
    );
    expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).not.toContain(
      "Do not imitate separate message bursts",
    );
    expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
      "never manufacture typos",
    );
    expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
      "Remain transparently Anthon",
    );
  });

  it("allows restrained reflective and celebratory expression", () => {
    expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
      "An occasional ellipsis",
    );
    expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
      "Selective elongated vowels or one uppercase word",
    );
    expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
      "Do not manufacture spelling errors",
    );
    expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
      "Do not force a greeting, question, affectionate closing, or motivational signature",
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

  it("mirrors repeated emoji use with a contextual short cluster", () => {
    const instruction = analyzeUserStyle([
      userMessage("Ciao 💪🏻"),
      userMessage("Fatto ✅"),
      userMessage("ok"),
    ]);

    expect(instruction).toContain("regularly uses emoji");
    expect(instruction).toContain("two or three");
    expect(instruction).toContain("emotional moment fits");
    expect(instruction).not.toContain("at most one");
  });
});
