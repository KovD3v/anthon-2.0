/**
 * AI Module Constants
 *
 * Centralized configuration for all AI-related modules.
 * All values come from existing code, just moved to one place for easy tuning.
 */

// -----------------------------------------------------
// SESSION MANAGER
// -----------------------------------------------------
export const SESSION = {
  /** Time gap (ms) that defines a new session - 15 minutes */
  GAP_MS: 15 * 60 * 1000,
  /** Maximum messages to include in context */
  MAX_CONTEXT_MESSAGES: 50,
  /** Max user messages before triggering summarization */
  MAX_USER_MESSAGES_PER_SESSION: 25,
  /** Recent messages to fetch (prevents fetching all user history) */
  RECENT_MESSAGES_LIMIT: 200,
  /** Cache TTL for session summaries - 5 minutes */
  CACHE_TTL_MS: 5 * 60 * 1000,
  /** Messages to include as fallback when summary not cached (for non-blocking UX) */
  FALLBACK_RECENT_MESSAGES: 6,
} as const;

// -----------------------------------------------------
// RAG SYSTEM
// -----------------------------------------------------
export const RAG = {
  /** Min cosine similarity to include in results (0.3 = 70% different is still ok) */
  SIMILARITY_THRESHOLD: 0.6,
  /** Number of chunks to process per batch for embeddings */
  BATCH_SIZE: 10,
  /** Maximum chunks to return from search */
  MAX_RESULTS: 5,
  /** Target characters per chunk */
  CHUNK_SIZE: 800,
  /** Overlap between chunks for context continuity */
  CHUNK_OVERLAP: 100,
  /** Max retries for embedding API calls */
  MAX_RETRIES: 3,
  /** Base delay (ms) for exponential backoff */
  RETRY_BASE_DELAY_MS: 1000,
} as const;

/**
 * Keywords that trigger RAG lookup (extended list).
 * If any of these are found in the user message, we use RAG.
 */
export const RAG_KEYWORDS = [
  // Methodology
  "tecnica",
  "esercizio",
  "allenamento",
  "migliorare",
  "metodo",
  // Training
  "programma",
  "preparazione",
  "recupero",
  "stretching",
  "riscaldamento",
  // Mental
  "ansia",
  "concentrazione",
  "motivazione",
  "mentalità",
  "pressione",
  // Performance
  "performance",
  "velocità",
  "forza",
  "resistenza",
  "potenza",
  // Questions
  "perché",
  "quando",
  "quanto",
  "quale",
] as const;

/**
 * Keywords that bypass RAG lookup (checked before LLM classification).
 * If found in the user message, RAG is skipped immediately.
 */
export const RAG_NEGATIVE_KEYWORDS = [
  // Greetings and social
  "ciao",
  "salve",
  "buongiorno",
  "buonasera",
  "buonanotte",
  "hello",
  "hi ",
  "hey",
  // Gratitude
  "grazie",
  "thanks",
  "thank you",
  // Affirmations
  "ok",
  "okay",
  "va bene",
  "perfetto",
  "bene",
  "ottimo",
  // Questions about self/profile
  "chi sei",
  "cosa fai",
  "come ti chiami",
  "who are you",
  "what do you do",
  // Temporal/status queries
  "come va",
  "come stai",
  "tutto bene",
  "how are you",
  "what's up",
  // Personal feelings (unless technical)
  "mi sento",
  "sono stanco",
  "sono felice",
  "sono triste",
  // Meta questions about the conversation
  "hai capito",
  "mi hai capito",
  "ricordi",
  "ti ricordi",
  "did you understand",
  "do you remember",
] as const;

// -----------------------------------------------------
// MEMORY SYSTEM
// -----------------------------------------------------
export const MEMORY = {
  /** Minimum confidence for saving extracted facts */
  MIN_CONFIDENCE: 0.7,
  /** Lower threshold for history extraction (more lenient) */
  HISTORY_MIN_CONFIDENCE: 0.6,
  /** Max memories per category before consolidation */
  CONSOLIDATION_THRESHOLD: 3,
} as const;

// -----------------------------------------------------
// COST TRACKING
// -----------------------------------------------------
const _COST = {
  /** Warning threshold for session costs (USD) */
  WARNING_THRESHOLD_USD: 0.5,
} as const;
