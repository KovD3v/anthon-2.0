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
      "Premia comprensione, domanda ad alto valore quando necessaria, uso del contesto e progressione senza formule rituali.",
    conversationalExpectations,
  };
}

const seeds: ScenarioSeed[] = [
  {
    id: "conversation-discovery-age",
    tag: "discovery",
    persona: "Atleta che chiede un carico senza indicare eta o livello",
    first: "Preparami un allenamento molto intenso per migliorare in fretta.",
    second: "Ho 15 anni, gioco da un anno e mi alleno due volte a settimana.",
    firstExpectations: {
      adviceReadiness: "ask_first",
      questionPolicy: "diagnostic",
    },
    secondExpectations: {
      adviceReadiness: "answer_now",
      expectedContextFacts: ["15 anni", "un anno", "due volte"],
      questionPolicy: "optional",
    },
    highFirst:
      "Prima di definire il carico mi servono eta, esperienza e frequenza attuale: quanti anni hai e quanto ti alleni oggi?",
    highSecond:
      "Con 15 anni, un anno di esperienza e due sedute, aumenterei gradualmente qualita e recupero senza partire da un carico estremo.",
  },
  {
    id: "conversation-discovery-food",
    tag: "discovery",
    persona: "Atleta che chiede un menu senza vincoli",
    first: "Fammi un menu settimanale per gli allenamenti.",
    second: "Sono vegetariana e mi alleno sempre alle 19.",
    firstExpectations: {
      adviceReadiness: "ask_first",
      questionPolicy: "diagnostic",
    },
    secondExpectations: {
      adviceReadiness: "answer_now",
      expectedContextFacts: ["vegetariana", "19"],
      questionPolicy: "optional",
    },
    highFirst:
      "Per renderlo sensato devo sapere almeno preferenze alimentari, orario degli allenamenti e obiettivo: da quale partiamo?",
    highSecond:
      "Considerando alimentazione vegetariana e seduta alle 19, imposterei pranzo completo, spuntino digeribile e cena di recupero.",
  },
  {
    id: "conversation-discovery-home",
    tag: "discovery",
    persona: "Persona che vuole allenarsi a casa",
    first: "Mi fai una scheda da fare a casa?",
    second: "Ho solo elastici e posso farla tre giorni.",
    firstExpectations: {
      adviceReadiness: "ask_first",
      questionPolicy: "diagnostic",
    },
    secondExpectations: {
      adviceReadiness: "answer_now",
      expectedContextFacts: ["elastici", "tre giorni"],
      questionPolicy: "optional",
    },
    highFirst:
      "Si, ma prima: che attrezzatura hai e quanti giorni puoi dedicarle?",
    highSecond:
      "Con elastici e tre giorni possiamo alternare spinta, tirata e gambe, mantenendo sedute brevi e progressive.",
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
