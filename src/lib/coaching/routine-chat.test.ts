import { describe, expect, it } from "vitest";
import type { RoutineCardData } from "./routine";
import { buildRoutineChatPrompt } from "./routine-chat";

const routine: RoutineCardData = {
  id: "routine-1",
  sourceChatId: "source-chat",
  sourceAssistantMessageId: "source-message",
  status: "ACTIVE",
  formatVersion: 1,
  proposal: {
    title: "Reset rapido",
    trigger: "Dopo un errore",
    durationLabel: "60 secondi",
    steps: ["Fermati", "Espira lentamente"],
    completionCue: "Riparto dalla prossima azione utile",
  },
  archivedAt: null,
  latestAttempt: null,
};

describe("buildRoutineChatPrompt", () => {
  it("builds a repeat prompt from every routine field without internal identifiers", () => {
    const prompt = buildRoutineChatPrompt(routine, "repeat");

    expect(prompt).toContain("Ripeti questa routine");
    expect(prompt).toContain("Reset rapido");
    expect(prompt).toContain("Dopo un errore");
    expect(prompt).toContain("60 secondi");
    expect(prompt).toContain("Fermati");
    expect(prompt).toContain("Espira lentamente");
    expect(prompt).toContain("Riparto dalla prossima azione utile");
    expect(prompt).not.toContain("routine-1");
    expect(prompt).not.toContain("source-chat");
    expect(prompt).not.toContain("source-message");
  });

  it("asks Anthon to adapt the routine instead of silently changing it", () => {
    const prompt = buildRoutineChatPrompt(routine, "adapt");

    expect(prompt).toContain("adattare questa routine");
    expect(prompt).toContain("proporre una nuova versione");
    expect(prompt).toContain("Reset rapido");
  });
});
