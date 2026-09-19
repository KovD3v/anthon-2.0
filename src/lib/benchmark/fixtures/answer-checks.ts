import type {
  AnswerCheckChoice,
  AnswerCheckId,
  SavedAnswerTurn,
} from "../answer-checks";

type Fixture = {
  turn: SavedAnswerTurn;
  expected: Record<AnswerCheckId, AnswerCheckChoice>;
};
const make = (
  id: string,
  userMessage: string,
  assistantText: string,
  expected: Record<AnswerCheckId, AnswerCheckChoice>,
  extra: Partial<SavedAnswerTurn> = {},
): Fixture => ({
  turn: {
    scenarioId: id,
    turnIndex: 0,
    sampleId: "sample-1",
    modelId: "synthetic-fixture",
    userMessage,
    assistantText,
    transcript: [],
    personalContext: {},
    historyComplete: true,
    personalContextComplete: true,
    answerAvailable: true,
    ...extra,
  },
  expected,
});
const na = {
  repeated_question: "not_applicable",
  ignored_correction: "not_applicable",
  unsupported_personal_fact: "not_applicable",
  unaddressed_request: "not_applicable",
} as const;

/** Fixture labels are test controls, not measured Jev accuracy. Never send expected to the judge. */
export const ANSWER_CHECK_FIXTURES: Fixture[] = [
  make(
    "repeats-known-sport",
    "Il problema è la tensione prima di servire.",
    "Che sport pratichi?",
    { ...na, repeated_question: "flagged" },
    {
      turnIndex: 1,
      transcript: [
        { role: "user", content: "Gioco a tennis." },
        { role: "assistant", content: "In quale momento senti tensione?" },
      ],
    },
  ),
  make(
    "grouped-relevant-questions",
    "Mi blocco durante le presentazioni al lavoro.",
    "In quale punto ti blocchi, cosa noti in quel momento e cosa hai già provato?",
    { ...na, repeated_question: "clear" },
  ),
  make(
    "ignores-explicit-correction",
    "Ti correggo: non corro più, ora nuoto.",
    "Per la tua prossima corsa scegli un ritmo sostenibile.",
    {
      ...na,
      ignored_correction: "flagged",
      unsupported_personal_fact: "flagged",
    },
  ),
  make(
    "respects-correction-and-person",
    "Non sono io a giocare a pallavolo: è mia sorella Lea. Io gioco a tennis.",
    "Per Lea il contesto è la pallavolo; per te è il tennis.",
    { ...na, ignored_correction: "clear", unsupported_personal_fact: "clear" },
  ),
  make(
    "invents-personal-history",
    "Vorrei prepararmi alla discussione della tesi.",
    "Dopo il tuo precedente esame fallito è normale avere questa paura.",
    { ...na, unsupported_personal_fact: "flagged" },
  ),
  make(
    "replaces-explicit-task",
    "Organizza queste tre ore di studio: un'ora per algebra e due per fisica. Scrivimi gli orari dalle 14.",
    "Prima di iniziare, quale emozione senti nel corpo?",
    { ...na, repeated_question: "clear", unaddressed_request: "flagged" },
  ),
  make(
    "answers-practical-task",
    "Organizza queste tre ore di studio: un'ora per algebra e due per fisica. Scrivimi gli orari dalle 14.",
    "14-15 algebra; 15-17 fisica.",
    { ...na, unaddressed_request: "clear" },
  ),
  make(
    "necessary-clarification",
    "Preparami un piano per il mio esame.",
    "Quando si svolge l'esame e quanto tempo puoi studiare ogni giorno?",
    { ...na, repeated_question: "clear", unaddressed_request: "clear" },
  ),
  make(
    "missing-personal-context",
    "Riprendiamo da dove eravamo rimasti.",
    "Tua sorella torna domenica.",
    { ...na, unsupported_personal_fact: "uncertain" },
    {
      turnIndex: 4,
      historyComplete: false,
      personalContextComplete: false,
    },
  ),
  make("acknowledgment-no-check-applies", "Grazie, a presto.", "A presto.", na),
  make(
    "hypothesis-is-not-personal-fact",
    "Sto pensando a come prepararmi.",
    "Se una simulazione ti fosse utile, potresti provarne una breve.",
    na,
  ),
];
