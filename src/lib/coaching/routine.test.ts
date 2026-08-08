import { describe, expect, it } from "vitest";
import {
  getRoutineProposalFromParts,
  getRoutineProposalFromToolCalls,
  routineCardDataSchema,
  routineProposalSchema,
  toRoutineCardData,
} from "@/lib/coaching/routine";

const proposal = {
  title: "Reset dopo un errore",
  trigger: "Quando commetti un errore in gara",
  durationLabel: "60 secondi",
  steps: ["Fermati", "Espira lentamente", "Scegli il prossimo gesto"],
  completionCue: "Riparti con lo sguardo sul compito successivo",
};

describe("routineProposalSchema", () => {
  it("accepts a complete coaching routine proposal", () => {
    expect(routineProposalSchema.parse(proposal)).toEqual(proposal);
  });

  it.each([
    ["an empty title", { ...proposal, title: "" }],
    ["one step", { ...proposal, steps: ["Fermati"] }],
    [
      "four steps",
      {
        ...proposal,
        steps: ["Fermati", "Espira", "Osserva", "Riparti"],
      },
    ],
    ["a 281-character trigger", { ...proposal, trigger: "a".repeat(281) }],
  ])("rejects %s", (_case, input) => {
    expect(routineProposalSchema.safeParse(input).success).toBe(false);
  });
});

describe("routine proposal extraction", () => {
  it("returns the only valid data-coachingRoutine part", () => {
    expect(
      getRoutineProposalFromParts([
        { type: "text", text: "Prova questa routine" },
        { type: "data-coachingRoutine", data: proposal },
      ]),
    ).toEqual(proposal);
  });

  it.each([
    ["absent", [{ type: "text", text: "Nessuna routine" }]],
    [
      "duplicated",
      [
        { type: "data-coachingRoutine", data: proposal },
        { type: "data-coachingRoutine", data: proposal },
      ],
    ],
    ["malformed", [{ type: "data-coachingRoutine" }]],
    [
      "invalid",
      [{ type: "data-coachingRoutine", data: { ...proposal, steps: [] } }],
    ],
  ])("returns null when the routine part is %s", (_case, parts) => {
    expect(getRoutineProposalFromParts(parts)).toBeNull();
  });

  it("returns the only valid proposeRoutine tool call", () => {
    expect(
      getRoutineProposalFromToolCalls([
        { name: "search", args: { query: "reset" } },
        { name: "proposeRoutine", args: proposal },
      ]),
    ).toEqual(proposal);
  });

  it.each([
    ["absent", [{ name: "search", args: proposal }]],
    [
      "duplicated",
      [
        { name: "proposeRoutine", args: proposal },
        { name: "proposeRoutine", args: proposal },
      ],
    ],
    ["malformed", [{ name: "proposeRoutine" }]],
    ["invalid", [{ name: "proposeRoutine", args: { ...proposal, title: "" } }]],
  ])("returns null when the proposeRoutine tool call is %s", (_case, calls) => {
    expect(getRoutineProposalFromToolCalls(calls)).toBeNull();
  });
});

describe("toRoutineCardData", () => {
  const databaseRoutine = {
    id: "routine-1",
    sourceChatId: "chat-1",
    sourceAssistantMessageId: "message-1",
    status: "ACTIVE" as const,
    title: proposal.title,
    trigger: proposal.trigger,
    durationLabel: proposal.durationLabel,
    steps: proposal.steps,
    completionCue: proposal.completionCue,
    archivedAt: null,
    attempts: [
      {
        id: "attempt-newest",
        attemptedAt: new Date("2026-08-08T09:30:00.000Z"),
        outcome: "PARTIALLY_HELPFUL" as const,
        outcomeNote: "Mi sono ripreso più in fretta",
        outcomeRecordedAt: new Date("2026-08-08T09:35:00.000Z"),
      },
    ],
  };

  it("maps a database routine and its newest attempt to JSON-safe card data", () => {
    const card = toRoutineCardData(databaseRoutine);

    expect(card).toEqual({
      id: "routine-1",
      sourceChatId: "chat-1",
      sourceAssistantMessageId: "message-1",
      status: "ACTIVE",
      proposal,
      archivedAt: null,
      latestAttempt: {
        id: "attempt-newest",
        attemptedAt: "2026-08-08T09:30:00.000Z",
        outcome: "PARTIALLY_HELPFUL",
        outcomeNote: "Mi sono ripreso più in fretta",
        outcomeRecordedAt: "2026-08-08T09:35:00.000Z",
      },
    });
    expect(routineCardDataSchema.safeParse(card).success).toBe(true);
  });

  it("sets latestAttempt to null when the routine has no attempts", () => {
    expect(
      toRoutineCardData({ ...databaseRoutine, attempts: [] }).latestAttempt,
    ).toBeNull();
  });

  it("rejects malformed snapshot and attempt dates", () => {
    const card = toRoutineCardData(databaseRoutine);

    expect(
      routineCardDataSchema.safeParse({ ...card, archivedAt: "08/08/2026" })
        .success,
    ).toBe(false);
    expect(
      routineCardDataSchema.safeParse({
        ...card,
        latestAttempt: {
          ...card.latestAttempt,
          attemptedAt: "yesterday",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects malformed legacy routine JSON before returning card data", () => {
    expect(() =>
      toRoutineCardData({ ...databaseRoutine, steps: ["Solo uno"] }),
    ).toThrow();
  });
});
