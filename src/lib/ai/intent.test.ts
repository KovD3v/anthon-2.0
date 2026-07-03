import { describe, expect, it } from "vitest";
import {
  evaluateWebSearchRule,
  getWebSearchDomainType,
  matchesBriefResponseIntent,
  matchesHealthRiskIntent,
  matchesMemoryDeleteIntent,
  matchesMemoryReadIntent,
  matchesMemoryWriteIntent,
  matchesPersistentDataIntent,
  matchesPreferenceWriteIntent,
  matchesProfileWriteIntent,
  matchesRagIntent,
  matchesSimpleFastIntent,
  shouldEnableWebFetchTool,
  shouldEnableWebSearchTool,
} from "./intent";

describe("ai/intent", () => {
  describe("evaluateWebSearchRule", () => {
    it("enables search with high confidence for explicit search requests", () => {
      const decision = evaluateWebSearchRule(
        "Fai una ricerca su internet sui risultati di ieri",
      );
      expect(decision.enabled).toBe(true);
      expect(decision.confidence).toBe("high");
    });

    it("disables search with high confidence for explicit negative requests", () => {
      const decision = evaluateWebSearchRule(
        "Rispondi senza cercare su internet",
      );
      expect(decision.enabled).toBe(false);
      expect(decision.confidence).toBe("high");
      expect(decision.reason).toBe("explicit_negative_web_search");
    });

    it("enables search for live score questions", () => {
      const decision = evaluateWebSearchRule(
        "Qual è il punteggio della partita in corso adesso?",
      );
      expect(decision.enabled).toBe(true);
      expect(decision.confidence).toBe("high");
    });

    it("returns low confidence for ambiguous current-info requests", () => {
      const decision = evaluateWebSearchRule(
        "Aggiornami sulla situazione di Sinner",
      );
      expect(decision.enabled).toBe(false);
      expect(decision.confidence).toBe("low");
      expect(decision.reason).toBe("ambiguous_current_info");
    });

    it("does not enable search for personal training planning", () => {
      const decision = evaluateWebSearchRule(
        "Come organizzo il mio allenamento di questa settimana?",
      );
      expect(decision.enabled).toBe(false);
    });

    it("defaults to no search with high confidence", () => {
      const decision = evaluateWebSearchRule("Ciao, come stai?");
      expect(decision).toEqual({
        enabled: false,
        confidence: "high",
        reason: "no_web_search_intent",
      });
    });
  });

  it("shouldEnableWebSearchTool mirrors the rule decision", () => {
    expect(shouldEnableWebSearchTool("Cerca su google le ultime notizie")).toBe(
      true,
    );
    expect(shouldEnableWebSearchTool("Motivami per la gara")).toBe(false);
  });

  it.each([
    "Quando è la prossima partita di Messi?",
    "Qual è la prossima partita di Sinner?",
  ])("enables search for next-match requests: %s", (message) => {
    expect(shouldEnableWebSearchTool(message)).toBe(true);
  });

  it("lets explicit negative internet requests win over fresh-news wording", () => {
    const decision = evaluateWebSearchRule(
      "Rispondi senza cercare su internet: quali sono le ultime notizie di oggi su Sinner?",
    );

    expect(decision).toEqual({
      enabled: false,
      confidence: "high",
      reason: "explicit_negative_web_search",
    });
  });

  it("shouldEnableWebFetchTool detects source and URL requests", () => {
    expect(shouldEnableWebFetchTool("Leggi questo articolo e riassumilo")).toBe(
      true,
    );
    expect(shouldEnableWebFetchTool("https://example.com/pagina")).toBe(true);
    expect(shouldEnableWebFetchTool("Ciao coach")).toBe(false);
  });

  it("enables fetch when a URL is paired with a read request", () => {
    expect(
      shouldEnableWebFetchTool("Leggi https://example.com/pagina e riassumi"),
    ).toBe(true);
  });

  it("getWebSearchDomainType classifies research and news queries", () => {
    expect(getWebSearchDomainType("Trova un paper su arxiv")).toBe(
      "research_paper",
    );
    expect(getWebSearchDomainType("Ultime notizie sulla Serie A")).toBe("news");
    expect(getWebSearchDomainType("Come respiro meglio?")).toBeUndefined();
  });

  it("matchesSimpleFastIntent detects greetings and quick requests", () => {
    expect(matchesSimpleFastIntent("Ciao!")).toBe(true);
    expect(matchesSimpleFastIntent("Motivami per oggi")).toBe(true);
    expect(matchesSimpleFastIntent("Analizza la mia settimana di carico")).toBe(
      false,
    );
  });

  it("matchesBriefResponseIntent detects brevity requests", () => {
    expect(matchesBriefResponseIntent("Rispondi in breve")).toBe(true);
    expect(matchesBriefResponseIntent("Spiegami tutto nei dettagli")).toBe(
      false,
    );
  });

  it("memory intents detect reads, writes, and deletes", () => {
    expect(matchesMemoryReadIntent("Cosa sai di me?")).toBe(true);
    expect(
      matchesMemoryWriteIntent("Ricordati che ho una partita domenica"),
    ).toBe(true);
    expect(matchesMemoryDeleteIntent("Dimentica quella informazione")).toBe(
      true,
    );
    expect(matchesMemoryReadIntent("Ciao coach")).toBe(false);
  });

  it("profile and preference intents detect stable user data", () => {
    expect(matchesProfileWriteIntent("Mi chiamo Luca e gioco a tennis")).toBe(
      true,
    );
    expect(
      matchesPreferenceWriteIntent("D'ora in poi usa un tono diretto"),
    ).toBe(true);
    expect(matchesProfileWriteIntent("Che esercizi mi consigli?")).toBe(false);
  });

  it("matchesPersistentDataIntent aggregates the persistent intents", () => {
    expect(matchesPersistentDataIntent("Salva che mi alleno il martedì")).toBe(
      true,
    );
    expect(matchesPersistentDataIntent("Dammi un consiglio")).toBe(false);
  });

  it("matchesRagIntent detects references to documents", () => {
    expect(matchesRagIntent("Secondo i documenti caricati, cosa dice?")).toBe(
      true,
    );
    expect(matchesRagIntent("Motivami")).toBe(false);
  });

  it("matchesHealthRiskIntent detects injury and symptom language", () => {
    expect(matchesHealthRiskIntent("Ho dolore al ginocchio")).toBe(true);
    expect(matchesHealthRiskIntent("Sono carico per la gara")).toBe(false);
  });
});
