import type {
  ConversationalExpectations,
  RealityScenario,
  RealityScenarioTurn,
} from "./reality";

type ScenarioSeed = {
  id: string;
  tag: RealityScenario["tags"][number];
  persona: string;
  first: string;
  second: string;
  firstExpectations: ConversationalExpectations;
  secondExpectations: ConversationalExpectations;
  highFirst: string;
  highSecond: string;
};

const low = "Capisco. Ecco tre azioni da fare subito. Vuoi provarle oggi?";

function turn(
  userMessage: string,
  highAnchorResponse: string,
  conversationalExpectations: ConversationalExpectations,
): RealityScenarioTurn {
  return {
    userMessage,
    requiredSignals: [],
    maxWords: 130,
    lowAnchorResponse: low,
    highAnchorResponse,
    judgeRubric:
      "Premia comprensione, risposte dirette quando il contesto basta, domande correlate raggruppate solo quando cambiano il coaching, uso del contesto e progressione senza formule rituali.",
    conversationalExpectations,
  };
}

const seeds: ScenarioSeed[] = [
  {
    id: "conversation-study-grouped-discovery",
    tag: "discovery",
    persona: "Studentessa che vuole preparare un esame senza un piano chiaro",
    first:
      "Ho un esame e mi perdo tra gli argomenti. Aiutami a organizzare il ripasso.",
    second:
      "È un orale venerdì, ho due ore al giorno e mi bloccano le dimostrazioni.",
    firstExpectations: {
      adviceReadiness: "ask_first",
      questionPolicy: "diagnostic",
    },
    secondExpectations: {
      adviceReadiness: "answer_now",
      expectedContextFacts: ["orale", "venerdì", "due ore", "dimostrazioni"],
      questionPolicy: "optional",
    },
    highFirst:
      "Per organizzare il ripasso mi servono tre dettagli collegati: quando sarà l'esame, che formato avrà e quanto tempo hai ogni giorno?",
    highSecond:
      "Per l'orale di venerdì dividerei le due ore tra richiamo a voce degli argomenti e prove delle dimostrazioni senza appunti. Parti dalla dimostrazione che ti blocca: prova il primo passaggio, controllalo e ripeti il ragionamento completo.",
  },
  {
    id: "conversation-work-recommendation",
    tag: "naturalness",
    persona: "Persona che chiede una raccomandazione con vincoli già chiari",
    first:
      "Devo consegnare domani. La versione base funziona; quella completa richiede altri due giorni. Il cliente ha chiesto soprattutto affidabilità. Quale consegno?",
    second:
      "Scelgo la base. Scrivimi due righe per spiegare cosa arriverà dopo.",
    firstExpectations: {
      adviceReadiness: "answer_now",
      expectedContextFacts: ["domani", "base", "affidabilità"],
      questionPolicy: "none",
    },
    secondExpectations: {
      adviceReadiness: "answer_now",
      expectedContextFacts: ["base"],
      questionPolicy: "none",
    },
    highFirst:
      "Consegna la base: rispetta domani e la priorità di affidabilità. Rinunci per ora alle funzioni aggiuntive, quindi rendi esplicito cosa comprende la consegna e concorda il seguito senza promettere una data non verificata.",
    highSecond:
      "Domani consegniamo la versione base già funzionante, dando priorità all'affidabilità. Le funzioni aggiuntive seguiranno in una seconda consegna, con tempi da confermare insieme.",
  },
  {
    id: "conversation-work-grouped-discovery",
    tag: "question-quality",
    persona:
      "Persona che si blocca in riunione e vuole capire il momento critico",
    first:
      "In riunione smetto sempre di parlare anche quando conosco la risposta.",
    second:
      "Mi interrompe il responsabile e penso che la mia idea sia stupida; vorrei finire una frase.",
    firstExpectations: {
      adviceReadiness: "ask_first",
      questionPolicy: "diagnostic",
    },
    secondExpectations: {
      adviceReadiness: "answer_now",
      expectedContextFacts: ["responsabile", "interrompe", "frase"],
      questionPolicy: "optional",
    },
    highFirst:
      "In quale momento smetti di parlare, e cosa pensi proprio in quel momento? I due dettagli ci aiutano a capire cosa ti frena.",
    highSecond:
      "L'interruzione del responsabile diventa subito un giudizio sulla tua idea. Per la prossima riunione prova una frase preparata: \"Finisco questo punto e poi ti ascolto\". L'obiettivo è completare il pensiero, senza dover dimostrare che sia perfetto.",
  },
  {
    id: "conversation-clarify-ambiguous",
    tag: "question-quality",
    persona: "Atleta con messaggio ambiguo",
    first: "Quando parte mi si chiude tutto.",
    second: "Intendo il respiro, appena inizia la gara.",
    firstExpectations: {
      adviceReadiness: "ask_first",
      questionPolicy: "diagnostic",
    },
    secondExpectations: {
      adviceReadiness: "answer_now",
      expectedContextFacts: ["respiro", "gara"],
      questionPolicy: "optional",
    },
    highFirst:
      "Quando dici che si chiude tutto, parli del respiro, dei pensieri o di una sensazione fisica diversa?",
    highSecond:
      "Se il respiro si blocca alla partenza, lavoriamo prima sull'espirazione lunga e su un segnale semplice nei primi secondi.",
  },
  {
    id: "conversation-pre-match-bodily-reaction",
    tag: "question-quality",
    persona: "Atleta con una reazione fisica ricorrente legata alla partita",
    first: "Vomito spesso prima della partita.",
    second:
      "Succede solo prima di giocare, soprattutto quando penso che deludero tutti.",
    firstExpectations: {
      adviceReadiness: "ask_first",
      expectedContextFacts: ["partita"],
      questionPolicy: "diagnostic",
    },
    secondExpectations: {
      adviceReadiness: "answer_now",
      expectedContextFacts: ["partita", "deludero"],
      questionPolicy: "optional",
    },
    highFirst:
      "Il fatto che accada prima della partita rende importante capire il legame con la pressione, senza dare per scontata una causa: succede solo quando devi giocare o anche in altri momenti?",
    highSecond:
      "Il nodo mentale che descrivi è la paura di deludere; questo non stabilisce la causa del vomito. Lavoriamo su un reset pre-partita breve, un obiettivo controllabile per i primi minuti e una nota dopo la gara per capire cosa cambia la reazione.",
  },
  {
    id: "conversation-no-ritual-question",
    tag: "naturalness",
    persona: "Utente che chiede una frase pronta",
    first: "Scrivimi una frase breve da ripetere prima del servizio.",
    second: "Perfetta, grazie.",
    firstExpectations: {
      adviceReadiness: "answer_now",
      questionPolicy: "none",
    },
    secondExpectations: {
      adviceReadiness: "answer_now",
      questionPolicy: "none",
    },
    highFirst: "Respiro, guardo il bersaglio, lascio andare il braccio.",
    highSecond: "Di nulla.",
  },
  {
    id: "conversation-known-thread-fact",
    tag: "context-continuity",
    persona: "Atleta che ha gia dichiarato lo sport",
    first: "Gioco a pallavolo e mi blocco quando devo battere.",
    second: "Come posso lavorarci questa settimana?",
    firstExpectations: {
      adviceReadiness: "ask_first",
      expectedContextFacts: ["pallavolo", "battuta"],
      questionPolicy: "diagnostic",
    },
    secondExpectations: {
      adviceReadiness: "answer_now",
      expectedContextFacts: ["pallavolo", "battuta"],
      forbiddenRepeatedQuestions: ["che sport fai"],
      questionPolicy: "optional",
    },
    highFirst:
      "Nella battuta, il blocco arriva prima del lancio o quando pensi al risultato?",
    highSecond:
      "Questa settimana inserisci una breve routine prima di ogni serie di battute e misura quante volte la completi, non solo quante battute entrano.",
  },
  {
    id: "conversation-identity-correction",
    tag: "context-continuity",
    persona: "Account condiviso con correzione esplicita",
    first: "Oggi scrive Marta, non Paolo.",
    second: "Io gioco a basket: aiutami con la paura di sbagliare.",
    firstExpectations: {
      adviceReadiness: "answer_now",
      expectedContextFacts: ["Marta"],
      questionPolicy: "none",
    },
    secondExpectations: {
      adviceReadiness: "ask_first",
      expectedContextFacts: ["Marta", "basket"],
      forbiddenRepeatedQuestions: ["sei Paolo"],
      questionPolicy: "diagnostic",
    },
    highFirst: "Va bene Marta, terrò presente che oggi sto parlando con te.",
    highSecond:
      "Marta, nel basket questa paura emerge di più al tiro, nelle scelte con la palla o dopo un errore?",
  },
  {
    id: "conversation-cross-chat-transparency",
    tag: "context-continuity",
    persona: "Utente che richiama una chat non disponibile",
    first: "In base a quanto ci siamo detti nell'altra chat, cosa faccio oggi?",
    second: "Parlavamo dell'ansia prima della gara di domenica.",
    firstExpectations: {
      adviceReadiness: "ask_first",
      questionPolicy: "diagnostic",
    },
    secondExpectations: {
      adviceReadiness: "answer_now",
      expectedContextFacts: ["ansia", "gara", "domenica"],
      questionPolicy: "optional",
    },
    highFirst:
      "Non ho qui il contenuto dell'altra chat: dimmi in una frase il punto principale e ripartiamo da li.",
    highSecond:
      "Per l'ansia prima della gara di domenica, oggi farei una prova breve della routine nelle stesse condizioni temporali.",
  },
  {
    id: "conversation-progress-beyond-routine",
    tag: "multi-turn-progression",
    persona: "Atleta che ha gia provato una routine",
    first: "La routine per la paura dell'errore non sta funzionando.",
    second: "La faccio, ma appena sbaglio penso che il coach mi tolga.",
    firstExpectations: {
      adviceReadiness: "ask_first",
      questionPolicy: "diagnostic",
    },
    secondExpectations: {
      adviceReadiness: "answer_now",
      expectedContextFacts: ["coach", "tolga"],
      questionPolicy: "diagnostic",
    },
    highFirst:
      "Non te ne propongo subito un'altra: in quale momento preciso la routine smette di aiutarti?",
    highSecond:
      "Il nodo sembra il timore della sostituzione, non l'esecuzione della routine. Lavoriamo su cosa puoi controllare nel possesso successivo e su come chiarire le aspettative col coach.",
  },
  {
    id: "conversation-gradual-specialization",
    tag: "multi-turn-progression",
    persona: "Controllo positivo di approfondimento graduale",
    first: "In gara perdo fiducia.",
    second: "Succede dopo due errori consecutivi, soprattutto nel finale.",
    firstExpectations: {
      adviceReadiness: "ask_first",
      questionPolicy: "diagnostic",
    },
    secondExpectations: {
      adviceReadiness: "answer_now",
      expectedContextFacts: ["due errori", "finale"],
      questionPolicy: "optional",
    },
    highFirst:
      "Qual e il primo segnale concreto che ti fa capire che la fiducia sta scendendo?",
    highSecond:
      "Dopo due errori nel finale, usa un reset di pochi secondi: espira, nomina una sola scelta tecnica e torna sul punto successivo.",
  },
];

export const CONVERSATIONAL_REALITY_SCENARIOS: RealityScenario[] = seeds.map(
  (seed) => ({
    id: seed.id,
    title: seed.id.replace(/^conversation-/, "").replaceAll("-", " "),
    persona: seed.persona,
    tags: [seed.tag],
    setup: { preferences: { language: "it" } },
    turns: [
      turn(seed.first, seed.highFirst, seed.firstExpectations),
      turn(seed.second, seed.highSecond, seed.secondExpectations),
    ],
  }),
);
