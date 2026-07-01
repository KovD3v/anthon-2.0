/**
 * Heuristic intent detection for chat messages.
 *
 * These matchers gate which tools and prompt modules the orchestrator enables
 * for a turn (web search, memory reads/writes, RAG, fast path, ...).
 * They are regex-based and currently cover Italian plus common English terms;
 * ambiguous cases fall back to the LLM prompt-module classifier in the
 * orchestrator.
 */

export type RuleConfidence = "high" | "low";

export type WebSearchRuleDecision = {
  enabled: boolean;
  confidence: RuleConfidence;
  reason: string;
};

export function getWebSearchDomainType(
  userMessage: string,
): "news" | "research_paper" | undefined {
  if (
    /\b(research paper|paper|papers|studio scientifico|studi scientifici|pubblicazione|pubblicazioni|arxiv|pubmed|citazioni|citation|journal|conferenza)\b/i.test(
      userMessage,
    )
  ) {
    return "research_paper";
  }

  if (
    /\b(notizia|notizie|news|ultim[aeio]|latest|current|oggi|ieri|domani|ora|adesso|live|diretta|risultato|risultati|punteggio|partita|partite|match|gioca|giocher[aà]|categoria|serie|classifica|mondiali|serie\s+a|campionato|torneo|meteo|previsioni)\b/i.test(
      userMessage,
    )
  ) {
    return "news";
  }

  return undefined;
}

export function matchesSimpleFastIntent(message: string) {
  return /\b(ciao|ehi|hey|buongiorno|buonasera|grazie|motivami|motiva|caricami|incoraggiami|breve|rapido|veloce|focus|frase|spinta|calmami|tranquillizzami)\b|reset\s+mentale|consiglio\s+(veloce|rapido)/i.test(
    message,
  );
}

export function matchesBriefResponseIntent(message: string) {
  return /\b(breve|brevemente|rapido|rapida|veloce|sintesi|sintetico|sintetica|riassumi|due\s+righe|una\s+frase|in\s+breve|short|brief|quick|concise)\b/i.test(
    message,
  );
}

export function matchesPersistentDataIntent(message: string) {
  return (
    matchesMemoryReadIntent(message) ||
    matchesProfileWriteIntent(message) ||
    matchesPreferenceWriteIntent(message) ||
    matchesMemoryWriteIntent(message) ||
    matchesMemoryDeleteIntent(message) ||
    matchesNotesWriteIntent(message)
  );
}

export function matchesMemoryReadIntent(message: string) {
  return /\b(chi\s+sono|sai\s+chi\s+sono|mi\s+conosci|ti\s+ricordi\s+di\s+me|cosa\s+sai\s+di\s+me|che\s+cosa\s+sai\s+di\s+me|cosa\s+ricordi\s+di\s+me|che\s+cosa\s+ricordi\s+di\s+me|hai\s+memoria\s+di\s+me|recupera\s+(la\s+)?memoria|guarda\s+(la\s+)?memoria|leggi\s+(la\s+)?memoria|interroga\s+(la\s+)?memoria)\b/i.test(
    message,
  );
}

export function matchesProfileWriteIntent(message: string) {
  return /\b(mi\s+chiamo|chiamami|sono\s+(un|una|atleta|giocatore|giocatrice|coach|allenatore|allenatrice)|gioco\s+(a\s+)?(calcio|basket|tennis|pallavolo|nuoto)|pratico|faccio\s+(calcio|basket|tennis|pallavolo|nuoto|atletica|palestra)|ho\s+\d+\s+anni|il\s+mio\s+obiettivo|il\s+mio\s+goal|obiettivo\s+(e|è))\b/i.test(
    message,
  );
}

export function matchesPreferenceWriteIntent(message: string) {
  return /\b(preferisco|preferirei|da\s+ora|d'ora\s+in\s+poi|rispondimi\s+sempre|parlami\s+sempre|tono\s+(diretto|empatico|tecnico|motivazionale)|modalit[aà]\s+(concisa|elaborata|sfidante|supportiva)|lingua\s+(italiana|inglese|spagnola|francese|tedesca)|usa\s+un\s+tono|sii\s+(diretto|empatico|tecnico|motivazionale|conciso|supportivo))\b/i.test(
    message,
  );
}

export function matchesMemoryWriteIntent(message: string) {
  return /\b(ricordati|ricorda\s+che|salva|memorizza|tieni\s+a\s+mente|ho\s+(una|un)\s+(partita|gara|match)|avr[oò]\s+(una|un)\s+(partita|gara|match)|mi\s+alleno\s+(il|la|di|ogni))\b/i.test(
    message,
  );
}

export function matchesMemoryDeleteIntent(message: string) {
  return /\b(dimentica|cancella|elimina|rimuovi)\b.{0,60}\b(memoria|ricordo|dato|informazione|quello|questa cosa|profilo)\b/i.test(
    message,
  );
}

export function matchesNotesWriteIntent(message: string) {
  return /\b(nota\s+che|prendi\s+nota|segnati)\b/i.test(message);
}

export function matchesRagIntent(message: string) {
  return /\b(rag|document[oi]|pdf|file|fonte|fonti|materiale|dispensa|archivio|caricat[oi]|allegat[oi])\b|in\s+base\s+(al|alla|ai|alle)|secondo\s+(il|la|i|le)\s+(document|file|materiale|fonte)/i.test(
    message,
  );
}

export function matchesComplexCoachingIntent(message: string) {
  return /\b(piano|programma|scheda|routine|analizza|analisi|spiegami|dettagli|dettagliato|confronta|tabella|strategia|preparazione|settimana|mensile|periodizzazione|nutrizione|dieta|macrociclo|microciclo)\b/i.test(
    message,
  );
}

export function matchesVoiceIntent(message: string) {
  return /\b(audio|vocale|nota\s+vocale|voice\s+note|parla|registrami|mandami\s+un\s+vocale)\b/i.test(
    message,
  );
}

export function matchesHealthRiskIntent(message: string) {
  return /\b(dolore|male|infortun|trauma|sintom|farmac|medic|diagnosi|stiramento|frattura|commozione)\b/i.test(
    message,
  );
}

export function evaluateWebSearchRule(userMessage = ""): WebSearchRuleDecision {
  const delegatedSearchIntent =
    /\b(non\s+(riesco|posso|trovo|ho\s+trovato|sono\s+riuscit[ao])|non\s+ho\s+(trovato|potuto\s+cercare))\b.{0,80}\b(cercare|trovare|online|web|internet|google)\b.{0,80}\b(puoi|potresti|riesci)\b.{0,50}\b(cercare|controllare|verificare|farlo|farla)\b|\b(puoi|potresti|riesci)\b.{0,50}\b(cercare|controllare|verificare|farlo|farla)\b.{0,80}\b(non\s+(riesco|posso|trovo|ho\s+trovato|sono\s+riuscit[ao])|non\s+ho\s+(trovato|potuto\s+cercare))\b/i;
  const negativeSearchIntent =
    /\b(senza|evita\s+di|evitiamo\s+di|rispondi\s+senza)\b.{0,45}\b(cercare|ricerca|controllare|verificare|internet|web|online|google)\b|\b(non\s+devi|non\s+voglio|non\s+serve|non)\b.{0,45}\b(cercare|fare\s+(una\s+)?ricerca|usare\s+(internet|il\s+web|web|google)|controllare\s+online|verificare\s+online|guardare\s+(su\s+)?(internet|web|online|google))\b/i;
  const explicitSearchIntent =
    /\b(fai|fammi|facci|puoi\s+fare|puoi\s+farmi|prova\s+a\s+fare)\b.{0,30}\b(una\s+)?ricerca\b|\b(ricerca|cerca|cercami|cercare|cercalo|controlla|controllare|verifica|verificare|guardalo|guarda)\b.{0,55}\b(internet|web|online|google)\b|\b(internet|web|online|google)\b.{0,55}\b(ricerca|cerca|cercami|cercare|controlla|controllare|verifica|verificare|guarda)\b|\b(trova|recupera)\b.{0,45}\b(informazioni|aggiornamenti|notizie|news)\b.{0,45}\b(aggiornat[ei]?|recent[ei]?|online|web|internet)\b/i;
  const liveScoreIntent =
    /\b(punteggio|risultato|risultati|score)\b.{0,80}\b(ora|adesso|diretta|live|tempo\s+reale|in\s+corso|sta(?:nno)?\s+giocando|mondiali)\b|\b(ora|adesso|diretta|live|tempo\s+reale|in\s+corso|sta(?:nno)?\s+giocando)\b.{0,80}\b(punteggio|risultato|score|partita|match|gara|mondiali)\b/i;
  const currentTerms =
    "\\b(oggi|ieri|domani|stasera|sta\\s+sera|ora|adesso|attuale|attuali|aggiornat[oaie]|recent[ei]|ultimo|ultimi|ultima|ultime|questa\\s+settimana|questo\\s+weekend|quest'anno|in\\s+corso|live|diretta|tempo\\s+reale|latest|current|today|yesterday|tomorrow|tonight|202[0-9])\\b";
  const externalInfoObjects =
    "\\b(partita|partite|match|gara|gare|gioca|giocano|giocher[aà]|giocheranno|formazione|formazioni|convocati|punteggio|risultato|risultati|score|classifica|classifiche|standings|meteo|previsioni|orario|orari|schedule|calendario|fixture|categoria|serie|campionato|league|torneo|mondiali|squadra|club|giocatore|atleta|vinto|vincitore|prezzo|prezzi|costo|costa|disponibilit[aà]|disponibile|biglietto|biglietti|prodotto|maglia|evento|eventi|concerto|concerti|volo|voli|treno|treni|parte|partenza|ristorante|ristoranti|negozio|negozi|aperto|aperti|aperta|aperte)\\b";
  const currentInfoIntent = new RegExp(
    [
      `${currentTerms}.{0,80}${externalInfoObjects}`,
      `${externalInfoObjects}.{0,80}${currentTerms}`,
      "\\b(notizia|notizie|news)\\b",
      "prossim[aoei]\\s+(partita|partite|match|gara|gare)",
      "quando\\s+(gioca|giocher[aà]|giocheranno|giocherai|giocate)\\b",
      "\\bclassifica\\b.{0,60}\\b(serie|campionato|league|nba|nfl|mlb|nhl|mondiali|torneo)\\b",
    ].join("|"),
    "i",
  );
  const personalPlanningContext =
    /\b(mio|mia|miei|mie|questi|queste)\b.{0,60}\b(allenamento|allenamenti|programma|scheda|routine|microciclo|macrociclo|esercizi)\b|\b(allenamento|allenamenti|programma|scheda|routine|microciclo|macrociclo|esercizi)\b.{0,60}\b(mio|mia|miei|mie|questi|queste)\b/i;
  const ambiguousCurrentInfoIntent =
    /\b(aggiornami|aggiorni|aggiornamento|aggiornamenti|novit[aà]|situazione|status|cosa\s+succede|che\s+succede)\b.{0,80}\b([A-Z][\p{L}'-]{2,}|messi|ronaldo|sinner|inter|milan|juve|juventus|napoli|roma|monza)\b|\b([A-Z][\p{L}'-]{2,}|messi|ronaldo|sinner|inter|milan|juve|juventus|napoli|roma|monza)\b.{0,80}\b(aggiornami|aggiorni|aggiornamento|aggiornamenti|novit[aà]|situazione|status|cosa\s+succede|che\s+succede)\b/iu;

  if (delegatedSearchIntent.test(userMessage)) {
    return {
      enabled: true,
      confidence: "high",
      reason: "delegated_web_search",
    };
  }
  if (negativeSearchIntent.test(userMessage)) {
    return {
      enabled: false,
      confidence: "high",
      reason: "explicit_negative_web_search",
    };
  }
  if (explicitSearchIntent.test(userMessage)) {
    return {
      enabled: true,
      confidence: "high",
      reason: "explicit_web_search",
    };
  }
  if (liveScoreIntent.test(userMessage)) {
    return {
      enabled: true,
      confidence: "high",
      reason: "live_score_intent",
    };
  }
  if (
    currentInfoIntent.test(userMessage) &&
    !personalPlanningContext.test(userMessage)
  ) {
    return {
      enabled: true,
      confidence: "high",
      reason: "current_external_info",
    };
  }
  if (
    ambiguousCurrentInfoIntent.test(userMessage) &&
    !personalPlanningContext.test(userMessage)
  ) {
    return {
      enabled: false,
      confidence: "low",
      reason: "ambiguous_current_info",
    };
  }
  return {
    enabled: false,
    confidence: "high",
    reason: "no_web_search_intent",
  };
}

export function shouldEnableWebSearchTool(userMessage = "") {
  return evaluateWebSearchRule(userMessage).enabled;
}

export function shouldEnableWebFetchTool(userMessage = "") {
  return /\b(fonte|fonti|link|url|articolo|articoli|pagina|pagine|sito|siti|apr[ie]|aprimi|leggi|riassumi|approfondisci|approfondimento|dettagli|dettagliato|confronta|confronto|analisi)\b|https?:\/\//i.test(
    userMessage,
  );
}
