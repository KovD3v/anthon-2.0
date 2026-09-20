# Jev calibration — 20 September 2026

The revised decision cores improved both the existing development cases and an
independently written, frozen fresh set. Global activation remains off. The
remaining misses are useful memories or retrieval opportunities skipped because
of uncertainty, plus answer-check abstentions. These synthetic checks do not
establish overall coaching quality or production reliability.

[Full evidence archive](runs/jev-calibration-2026-09-20.json) contains frozen
inputs and labels, request bodies, raw provider probabilities, every response or
timeout, effective outputs, source hashes, runner source, and offline replays.
No real-user messages or credential values were sent or archived.

## Changes

- Each memory question now explicitly names its task: support, person,
  sensitivity, or relationship to a specific existing fact. Jev does not see
  question identifiers, so identifiers alone cannot communicate the task.
- The transport preserves selected-option probability and the full distribution
  separately from `confidence`. Jev's confidence describes the distribution's
  shape; it is not the selected option's probability. Both can inform decisions,
  but neither is a measured accuracy rate. New cores use probability consistently;
  the existing extraction gate and voice policy retain their scoring behavior.
- Active memory review skips the save on unsupported, uncertain, missing or
  failed evidence checks, including errors before the reviewer returns. This is
  a skipped consolidation pass, not a deferred queue. Explicit consent,
  ownership, revision, freshness, subject and expiry guards remain in place.
- Recall planning distinguishes an unidentified earlier attempt from content
  already present in the recent answer. Its timeout increased from 450 to 750 ms;
  ranking remains at 600 ms, with no retries.
- The offline answer checker separates applicability from quality, and personal
  evidence that is absent from evidence that is contradicted. Code handles
  incomplete context instead of asking the model to infer what missing history
  contains.

Provider semantics: [Choice primitive](https://docs.typesafe.ai/primitives/choice)
and [confidence](https://docs.typesafe.ai/confidence).

Selected-probability cutoffs are 0.90 for memory support/person/ordinary
sensitivity and 0.98 for semantic matching; 0.80 for enabling bounded recall or
promoting relevant evidence; 0.90 for excluding retrieved evidence; and 0.80 for
answer judgments. The revised development memory examples already clear the
conservative memory cutoffs, so those numeric cutoffs were not lowered.

## Evaluation method

The baseline was frozen at `372a48e9` in a detached checkout. Both versions ran
through the real decision transport and core functions against `typesafe/jev-1.13`,
served as `typesafe/jev-1.13-20260917`. Application metering was mocked to avoid
quota/database writes; provider usage was recorded directly. Memory results here
are review decisions, not evidence of model-driven database writes. Separate
PostgreSQL tests verify persistence with mocked model responses.

Development: 11 memory cases / 19 candidates, 5 planning cases, 6 ranking cases /
26 candidates, and 23 answers / 92 judgments. These are the previously exercised
examples, including the earlier holdout, and are now explicitly tuning data.

Fresh: 12 memory cases / 23 candidates, 6 planning cases, 6 ranking cases / 24
candidates, and 12 answers / 48 judgments. A separate agent wrote and froze these
before model calls without inspecting the implementation changes. Labels were
not edited after seeing results. One self-contained planning case bypasses Jev
correctly, so each fresh run makes 35 calls across 36 cases. The initial static
claim that all six planning cases would invoke Jev was incorrect.

Only one live pass per version and split was used. Calls were sequential, with
requests and outcomes appended immediately to a journal; no failed calls or
unfavorable results were discarded. Local request timings include response body
receipt and aborted requests. They are not production chat latency measurements.

## Results before the final missing-history guard

| Measure | Baseline development | Revised development | Baseline fresh | Revised fresh |
| --- | ---: | ---: | ---: | ---: |
| Memory candidate outcomes matched | 14/19 | 19/19 | 18/23 | 22/23 |
| Unsupported candidates admitted by review | 1 | 0 | 2 | 0 |
| Planning outcomes matched | 3/5 | 5/5 | 3/6 | 5/6 |
| Ranking exact retained order matched | 3/6 | 4/6 | 6/6 | 6/6 |
| Answer judgments: definite matches | 67/92 | 86/92 | 28/48 | 43/48 |
| Answer judgments: definite disagreements | 5 | 0 | 2 | 1 |
| Answer judgments: uncertain | 20 | 6 | 18 | 4 |
| Answer judgments: transport/validation failures | 0 | 0 | 0 | 0 |

Uncertainty is separate from definite matches, including when uncertainty is the
expected answer. Two judgments in each development/fresh corpus deliberately
require uncertainty. Revised development returns both; the first fresh run
returns one and incorrectly declares a question non-repeated for the other.

Fresh memory rejects all seven unsupported candidates and sends both sensitive
facts through the approval requirement. One valid team-event fact is skipped:
its subject probability is 0.76, below 0.90. No incorrect semantic match is
applied. The fresh planning miss also chooses the correct raw option, `recall`,
but at 0.76, below 0.80. No threshold was lowered to fit these new cases.

Fresh ranking retains all eight useful items and all three uncertain fragments,
and removes all 13 irrelevant items, in both versions. Three relevance-versus-
uncertainty labels were declared debatable before testing; preserving those
fragments is the primary requirement. In development, the revised ranking still
retains two irrelevant items below the removal cutoff, and one useful item is
retained without promotion. This explains the two remaining order mismatches.

Answer applicability matters: 35 of the fresh set's 48 labels are N/A. The
revised checker correctly decides all five actual defect labels and all six
clear labels. It correctly returns 32/35 N/A labels and abstains on three. The
other two labels require incomplete-context uncertainty; only one is handled
correctly in this first live pass.

The gain is mainly applicability handling, not uniformly better defect detection.
Fresh applicable checks were already 11/11 at baseline and remain 11/11; N/A
matches rise from 17/35 to 32/35. On development applicable checks, definite
matches decline from 25/27 to 23/27, with abstentions increasing from two to four.
The revised evaluator makes fewer definite errors overall, but still needs review
when it abstains on an actual defect or a valid answer.

## Final missing-history fix and separate follow-up

The fresh failure exposed a deterministic gap: a `clear` repetition judgment
could be accepted despite incomplete earlier history. The final code preserves
the raw choice but reports `uncertain` in that situation. A repetition supported
by visible evidence can still be flagged, and no-question answers remain N/A.
No prompt, threshold, or original fixture label changed after the fresh run.

Replaying the exact saved fresh model responses through the final evaluator,
without provider calls, yields **43 definite matches, zero disagreements, and
five uncertain judgments**. Two uncertainties are expected; three are unwanted
abstentions. The development replay remains 86 matches, zero disagreements,
six uncertain. These are deterministic rechecks, not a second unseen live run.
The original live failure remains in the archive and the table above.

A second independently frozen set then exercised four new repetition scenarios:
missing history, an answer visibly present, no question, and necessary new
clarification with complete history. All **4/4 repetition outcomes** matched.
Across all four checks on those four answers, the live result is **14 definite
matches, zero disagreements, and two uncertain** out of 16 judgments. One
uncertainty is required; the other is an unaddressed-request abstention on a
necessary clarification. That case is not counted as a fully correct answer.

## Latency and provider cost

| Live run | Calls | Timeouts | Request p50 / p95 | Known provider cost |
| --- | ---: | ---: | ---: | ---: |
| Baseline development | 45 | 0 | 341 / 756 ms | $0.002942898 |
| Revised development | 45 | 0 | 337 / 513 ms | $0.003261552 |
| Baseline fresh | 35 | 2 | 338 / 522 ms | $0.002278374 |
| Revised fresh | 35 | 0 | 310 / 404 ms | $0.002566410 |
| Final repetition follow-up | 4 | 0 | 460 / 774 ms | $0.000302022 |

Total: **164 requests**, 162 HTTP 200 responses, two baseline planning timeouts.
Provider-reported cost is **$0.011351256 across 162 priced calls**. The two
aborted calls have unknown cost, so this is not a complete bill. No retries or
lost responses are excluded. Offline replays add no calls or cost.

Longer, clearer instructions increased cost by about **10.8%** on the fully
priced development comparison. This calibration improves reliability; it does
not demonstrate lower per-call cost. Fresh latency is encouraging, but a single
small sequential run cannot establish production latency gains.

## Verification and rollout

- Full unit suite: **2,891 passed, 4 skipped**. The first run exposed two caller
  mocks lacking the newly required probability field; those fixtures were
  corrected and the full suite passed afterward.
- PostgreSQL integration: **14 passed** across review failure/uncertainty,
  correction, concurrent change protection, ownership, undo, expiry and context
  projection. Migrations and tests ran only on a temporary child of the verified
  development branch. The temporary branch was deleted and absence verified.
- Biome, TypeScript, evaluator CLI dry-run, and diff checks passed.
- Local configuration remains memory review `off`, retrieval decisions `off`,
  zero allowlisted accounts. No environment changes, push or deployment.

These results support the implementation and a later staged evaluation under
ADR 0024. They do not justify global activation. Answer checks remain offline;
no answer generation or rewriting behavior was added.
