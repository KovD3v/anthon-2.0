import { describe, expect, it } from "vitest";
import {
  getRoutineProposalFromParts,
  getRoutineProposalFromToolCalls,
  normalizeRoutineProposal,
  parseRoutineSourceHydrationPayload,
  routineCardDataSchema,
  routineProposalSchema,
  routineProposalV2Schema,
  storedRoutineProposalSchema,
  toRoutineCardData,
} from "@/lib/coaching/routine";

const proposal = {
  title: "Reset dopo un errore",
  trigger: "Quando commetti un errore in gara",
  durationLabel: "60 secondi",
  steps: ["Fermati", "Espira lentamente", "Scegli il prossimo gesto"],
  completionCue: "Riparti con lo sguardo sul compito successivo",
};

const v2FormStep = {
  id: "outcome",
  kind: "form" as const,
  question: "Quanto ti ha aiutato questa routine?",
  mode: "choice" as const,
  options: [
    { label: "Molto", outcome: "HELPFUL" },
    { label: "In parte", outcome: "PARTIALLY_HELPFUL" },
    { label: "Poco", outcome: "NOT_HELPFUL" },
  ],
  noteEnabled: true,
};

const v2Proposal = {
  formatVersion: 2,
  title: "Reset dopo un errore",
  trigger: "Quando commetti un errore in gara",
  durationLabel: "60 secondi",
  steps: [
    {
      id: "notice",
      kind: "instruction",
      text: "Nota il punto di appoggio.",
    },
    {
      id: "reset-breath",
      kind: "timer",
      label: "Respiro lento",
      instruction: "Espira lentamente prima del prossimo gesto.",
      durationSeconds: 30,
    },
    v2FormStep,
  ],
  completionCue: "Riparti con lo sguardo sul compito successivo",
};

describe("routineProposalSchema", () => {
  it("accepts a complete coaching routine proposal", () => {
    expect(routineProposalSchema.parse(proposal)).toEqual(proposal);
  });

  it("accepts a v2 proposal with typed practice steps and a terminal form", () => {
    expect(routineProposalSchema.safeParse(v2Proposal).success).toBe(true);
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

describe("versioned routine proposals", () => {
  it("keeps historical string steps readable through the stored union", () => {
    expect(storedRoutineProposalSchema.parse(proposal)).toEqual(proposal);
  });

  it("normalizes v1 strings into stable instruction steps", () => {
    const normalized = normalizeRoutineProposal(proposal);

    expect(normalized.formatVersion).toBe(1);
    expect(normalized.completionForm).toBeNull();
    expect(normalized.practiceSteps).toEqual([
      { id: "instruction-1", kind: "instruction", text: "Fermati" },
      {
        id: "instruction-2",
        kind: "instruction",
        text: "Espira lentamente",
      },
      {
        id: "instruction-3",
        kind: "instruction",
        text: "Scegli il prossimo gesto",
      },
    ]);
  });

  it("normalizes typed v2 steps and excludes its terminal form from practice", () => {
    const normalized = normalizeRoutineProposal(
      routineProposalV2Schema.parse(v2Proposal),
    );

    expect(normalized.formatVersion).toBe(2);
    expect(normalized.practiceSteps.map((step) => step.id)).toEqual([
      "notice",
      "reset-breath",
    ]);
    expect(normalized.completionForm?.id).toBe("outcome");
  });

  it.each([
    [
      "an unknown step kind",
      {
        ...v2Proposal,
        steps: [{ id: "unknown", kind: "video", url: "https://example.com" }],
      },
    ],
    ["no practice steps", { ...v2Proposal, steps: [v2FormStep] }],
    [
      "more than six practice steps",
      {
        ...v2Proposal,
        steps: Array.from({ length: 7 }, (_, index) => ({
          id: `instruction-${index}`,
          kind: "instruction",
          text: "Resta sul prossimo gesto.",
        })),
      },
    ],
    [
      "a timer shorter than five seconds",
      {
        ...v2Proposal,
        steps: [{ ...v2Proposal.steps[1], durationSeconds: 4 }],
      },
    ],
    [
      "breathing outside cycle and second limits",
      {
        ...v2Proposal,
        steps: [
          {
            id: "breathe",
            kind: "breathing",
            label: "Respiro",
            instruction: "Segui il ritmo.",
            inhaleSeconds: 31,
            exhaleSeconds: 2,
            holdAfterInhaleSeconds: 0,
            holdAfterExhaleSeconds: 0,
            cycles: 13,
          },
        ],
      },
    ],
    [
      "a non-terminal form",
      {
        ...v2Proposal,
        steps: [v2FormStep, v2Proposal.steps[0]],
      },
    ],
    [
      "a form with fewer than three options",
      {
        ...v2Proposal,
        steps: [
          {
            ...v2FormStep,
            options: v2FormStep.options.slice(0, 2),
          },
        ],
      },
    ],
    [
      "a form with more than three options",
      {
        ...v2Proposal,
        steps: [
          {
            ...v2FormStep,
            options: [
              ...v2FormStep.options,
              { label: "Altro", outcome: "HELPFUL" },
            ],
          },
        ],
      },
    ],
    [
      "duplicate outcome mappings",
      {
        ...v2Proposal,
        steps: [
          {
            ...v2FormStep,
            options: [
              { label: "Molto", outcome: "HELPFUL" },
              { label: "In parte", outcome: "HELPFUL" },
              { label: "Poco", outcome: "NOT_HELPFUL" },
            ],
          },
        ],
      },
    ],
    [
      "duplicate step ids",
      {
        ...v2Proposal,
        steps: [v2Proposal.steps[0], { ...v2Proposal.steps[1], id: "notice" }],
      },
    ],
  ])("rejects %s", (_case, input) => {
    expect(routineProposalV2Schema.safeParse(input).success).toBe(false);
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

describe("targeted routine source hydration", () => {
  const routine = {
    id: "routine-1",
    sourceChatId: "chat-1",
    sourceAssistantMessageId: "assistant-1",
    status: "ACTIVE" as const,
    formatVersion: 1 as const,
    proposal,
    archivedAt: null,
    latestAttempt: null,
  };
  const message = {
    id: "assistant-1",
    role: "assistant",
    content: "Un valore non usato dal ritorno",
    parts: [
      { type: "text", text: "Prova questa routine." },
      { type: "data-coachingRoutine", data: proposal },
    ],
    createdAt: "2026-08-08T10:00:00.000Z",
  };
  const expected = {
    routineId: "routine-1",
    sourceChatId: "chat-1",
    sourceAssistantMessageId: "assistant-1",
  };

  it("returns one canonical render-safe message and omits unsupported fields", () => {
    const parsed = parseRoutineSourceHydrationPayload(
      {
        messages: [{ ...message, attachments: [{}], voice: { status: 42 } }],
        routines: [routine],
      },
      expected,
    );

    expect(parsed).toEqual({
      message: {
        id: "assistant-1",
        role: "assistant",
        content: null,
        parts: [
          { type: "text", text: "Prova questa routine." },
          { type: "data-coachingRoutine", data: proposal },
        ],
        createdAt: "2026-08-08T10:00:00.000Z",
      },
      routine,
    });
    expect(parsed?.message).not.toHaveProperty("attachments");
    expect(parsed?.message).not.toHaveProperty("voice");
  });

  it.each([
    ["an empty card part list", [{ ...message, parts: [] }]],
    [
      "a different routine proposal",
      [
        {
          ...message,
          parts: [
            { type: "text", text: "Prova questa routine." },
            {
              type: "data-coachingRoutine",
              data: { ...proposal, title: "Routine diversa" },
            },
          ],
        },
      ],
    ],
    ["an unrelated extra message", [message, { ...message, id: "other" }]],
    [
      "a duplicate id with a late user role",
      [message, { ...message, role: "user" }],
    ],
  ])("rejects %s", (_case, messages) => {
    expect(
      parseRoutineSourceHydrationPayload(
        { messages, routines: [routine] },
        expected,
      ),
    ).toBeNull();
  });
});

describe("toRoutineCardData", () => {
  const databaseRoutine = {
    id: "routine-1",
    sourceChatId: "chat-1",
    sourceAssistantMessageId: "message-1",
    status: "ACTIVE" as const,
    formatVersion: 1,
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
      formatVersion: 1,
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
