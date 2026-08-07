# Context-aware RAG strategy discovery and truthful retrieval telemetry

## Status

Approved scope, pending review of this written specification before implementation.

## Problem

Production chat evidence shows two separate failures in the current RAG policy:

1. Direct strategy requests can take the LLM-classifier fallback and produce
   inconsistent RAG decisions. An identical request for breathing techniques
   retrieved context in one conversation but not in another, even though the
   production corpus contains a dedicated breathing strategy.
2. The RAG gate evaluates only the current user message. A short continuation
   such as an affirmative reply to an offered guided practice therefore loses
   the preceding strategy context and answers from generic model knowledge.

The current system prompt is also too weak once retrieval succeeds: it only
asks the model to use relevant context as a base. It does not require a
specific, bounded, safe coaching action from that context.

## Goals

- Retrieve consistently for direct, non-clinical requests for a strategy in
  the curated corpus.
- Treat a bounded same-thread continuation as part of the user's request, so
  an implicit follow-up can retrieve the relevant strategy again.
- Let Anthon deliberately discover a fitting strategy from the corpus when a
  concrete coaching opportunity is present, even if the user uses none of the
  strategy's exact terms.
- Keep acute health or safety situations out of RAG-led coaching; safety
  guidance remains the first response.
- Make the model use retrieved strategy constraints and application steps,
  rather than offering generic advice beside the context.
- Distinguish a retrieval attempt from successful context use without sending
  query text, chunk content, document IDs, or similarity scores to analytics.

## Non-goals

- Change the corpus, embeddings, similarity threshold, chunking, reranking,
  model selection, or guest policy.
- Use RAG as a diagnostic or treatment source for panic attacks or other
  medical or mental-health emergencies.
- Autonomously introduce highly therapeutic or controversial techniques merely
  because a vector match exists. Those remain available only after a specific
  user request and the relevant safety checks.
- Store raw user text or retrieval content in PostHog.

## Design

### 1. Context-aware strategy discovery and RAG decision

Introduce a small decision boundary around `shouldUseRag` with three inputs:

- the current user message;
- a bounded same-thread context containing only the immediately relevant prior
  user request and assistant offer, capped by character length; and
- the existing user and capability information.

The decision runs only for authenticated turns where the existing TurnPlan
permits RAG. It keeps the current guest and web-search exclusions.

The decision order is:

1. Reject active safety-sensitive turns before retrieval. This is limited to
   acute distress and emergency signals, not all mentions of anxiety or
   performance pressure.
2. Accept deterministic, normalized strategy signals. Existing terms must
   recognize inflected forms such as `tecniche`; the current corpus also needs
   explicit strategy-family coverage for breathing and autogenic training.
3. For short confirmations or contextual statements, evaluate the bounded
   conversation focus instead of the current text alone. A focus combines the
   current turn with the closest preceding strategy request and assistant
   invitation, rather than querying the full chat history.
4. For every remaining, non-safety turn with a concrete coaching opportunity,
   let the existing lightweight prompt-module classifier make a strategy
   discovery decision from the bounded focus. It may choose retrieval even
   without a keyword or exact document-title match; semantic vector search,
   not a hard-coded strategy name, finds the candidate material.
5. If the context read or classifier fails, fall back to the current
   conservative decision and never override the safety rejection.

The discovery classifier returns only whether retrieval is warranted; it does
not invent a strategy, title, citation, or clinical interpretation. When its
decision is positive, use the bounded focus as the vector-search query. There
is at most one embedding and one document search per turn.

### 2. Autonomous proposal guard

A successful semantic search is not an instruction to force a strategy into
the answer. Anthon may proactively propose one strategy only when the result
matches the user's stated situation and its own `Usala quando`, `Prima
verifica`, and `Non usarla` constraints.

Autonomous suggestions start with the low-risk, coaching-first families in the
current corpus: routine pre-performance, slow or tactical breathing,
strategic self-talk, goal setting, WOOP or implementation intentions, and
mindfulness with its documented precautions. A guided suggestion must be
short, optional, and framed as a coaching experiment rather than a treatment.

Hypnosis or auto-hypnosis, NLP-derived methods (anchoring, Swish, Timeline),
and comparable therapeutic or controversial material are never introduced
autonomously. They may be retrieved only after an explicit user request, and
the response still follows safety restrictions.

### 3. RAG system-prompt contract

Replace the current two-line RAG policy with a concise contract:

- Treat relevant RAG context as the preferred internal coaching strategy for
  the current turn.
- Select the most specific fitting strategy; turn its `Usala quando`, `Prima
  verifica`, `Non usarla`, `Applicazione`, and decision rules into one
  practical next step and one observable check.
- Adapt the strategy to the user's stated situation without dumping excerpts,
  inventing sources, or claiming clinical authority.
- When the safety policy applies, it takes precedence over RAG strategy use.

This prompt changes response quality only. The context-aware gate above is
responsible for deciding whether the RAG CONTEXT section exists.

### 4. Retrieval telemetry

Add a nullable `ragAttempted` boolean to `Message` and `MessageMetrics`, and
include it on every new `$ai_generation` event. Historical records remain
`null` because their attempted-retrieval state cannot be reconstructed.

For new turns, set `ragAttempted` to true immediately before the embedding and
vector search starts. It stays true if the lookup yields zero chunks or fails.
`ragUsed` remains true only when one or more chunks enter the prompt.

This yields an unambiguous, privacy-safe state table:

| `ragAttempted` | `ragUsed` | Meaning |
| --- | --- | --- |
| false | false | The turn was not selected for retrieval. |
| true | false | Retrieval ran but returned no usable context or failed. |
| true | true | Retrieved context was injected into the prompt. |

`ragChunksCount` remains the volume field. No source text, document title,
document ID, similarity score, or user query is captured in PostHog.

### 5. Tests

Add focused regression coverage for:

1. An inflected direct breathing-technique request selecting retrieval.
2. A concrete but non-keyword coaching moment selecting semantic strategy
   discovery and searching the corpus.
3. An affirmative follow-up to a retrieved autogenic-training practice
   selecting retrieval with bounded conversation focus.
4. An acute-distress turn bypassing RAG even when the preceding turn mentioned
   a strategy.
5. An implicit request not autonomously proposing a restricted strategy family,
   while an explicit request remains eligible for retrieval with safeguards.
6. A zero-result lookup reporting `ragAttempted: true`, `ragUsed: false`, and
   zero chunks.
7. A successful lookup persisting and emitting both `ragAttempted: true` and
   `ragUsed: true`.
8. A non-selected turn reporting `ragAttempted: false` while preserving the
   existing false `ragUsed` semantics.
9. The prompt containing the strengthened RAG contract only when usable RAG
   context is present.

## Acceptance criteria

- A direct breathing-technique request always follows the deterministic RAG
  route when the corpus exists.
- A contextual confirmation of an offered autogenic-training practice causes a
  new retrieval and uses the matching strategy if chunks clear the threshold.
- A concrete coaching moment can start semantic strategy discovery without an
  exact query match, while generic chat remains outside retrieval.
- Autonomous suggestions remain within the low-risk, coaching-first strategy
  families; restricted material needs an explicit request.
- Acute safety turns do not enter the RAG path.
- Persisted metrics and PostHog distinguish skipped, attempted-empty or
  failed, and successful retrieval without content leakage.
- Existing guest, web-search, empty-retrieval, and successful-RAG regression
  behavior remains covered.
