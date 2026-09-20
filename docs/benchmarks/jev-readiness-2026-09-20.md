# Jev local readiness checks — 20 September 2026

The implementation and safety checks pass, but **the predeclared model-quality
gates do not**. New answer checks matched 169/192 labels (88.02%, target 95%).
The final unseen document run timed out on four of eight calls at the unchanged
600 ms deadline. These results do not justify declaring Jev production-ready.

All application and evaluation processes ran locally, using synthetic data.
Provider tests called OpenRouter; database tests used a dedicated disposable Neon
development child. No production accounts, conversations, configuration, rollout,
deployment or push were involved. Existing activation gates remain unchanged.

## Changes retained

- Retrieval separates topic, person and time/version in one bounded request.
  Documents use topic and time/version. Recall planning now distinguishes the
  missing identity of earlier advice from a description of its effects.
- Explicit memory subject attribution survives storage, sensitive-memory
  confirmation and undo. It uses existing JSON metadata, without a migration.
  Legacy or unverified writes remain unattributed; keys are not identity evidence.
- The offline answer evaluator sums mutually exclusive evidence probabilities
  that map to the same outcome. Complete-context absence and contradiction can
  both support a flag; incomplete-context absence remains uncertainty. Raw
  probabilities remain visible. Replay improved two of 924 historical synthetic
  judgments, with no regressions; this was replay, not new provider evidence.
- Content-free decision logs have their own `decisions` domain. Existing domain
  overrides can enable them without exposing broader AI logs. Defaults are unchanged.

Thresholds, timeouts, account/consent checks, expiry, no-retry behavior and
conservative fallbacks were preserved. A failed ranking batch retains the original
evidence. That prevents useful evidence loss but can retain distractors, so such
failures still count against the quality gate.

## New frozen examples and first attempts

Independent agents authored **108 new cases** without inspecting candidate prompts
or outputs: 68 readiness cases, 32 followup cases and eight final document cases.
The answer examples contain 24 defect/control pairs, split across English and
Italian. Gold labels are AI-authored and reviewed, not human annotations. All
four answer checks are scored on every answer, including controls.

The archive preserves original fixtures, pre-output corrections, ambiguity rules,
hashes and every first attempt. Before model calls, review corrected two ranking
orders and an unstated fixture timezone, and declared one recall question
ambiguous. Original gold was retained. Later source attribution added to known
regression inputs is explicitly regression evidence, not unseen evidence.

| First-attempt set | Result | Limit |
| --- | --- | --- |
| Readiness memory | 11/12 exact candidate outcomes | One ordinary temporary fact conservatively required approval. No unsupported admission or omitted required consent. |
| Readiness recall | 15/15 strict, plus one predeclared ambiguous case | The ambiguous case also matched its original label; excluded from strict accuracy. |
| Readiness ranking | 46/48 item memberships; 11/12 exact orders | A pronoun query retained two facts about other people. |
| Readiness answer checks | 31/32 primary; 114/128 across all checks | 13 unwanted abstentions and one auxiliary applicability error. |
| Followup recall | 8/8 | Unseen examples with the refined planner. |
| Followup ranking | 31/32 memberships; 6/8 exact orders | One superseded document retained; one useful item remained behind an uncertain fragment. Explicit stored subject metadata was used. |
| Followup answer checks | 15/16 primary; 55/64 across all checks | Eight unwanted abstentions and one auxiliary false flag. |
| Final document ranking | 23/32 memberships; 2/8 exact orders | Four timeouts kept all original candidates; two successful cases differed only in order. |

The final document cases exercise reinstated versions, partial supersession,
unchanged old sections, historical date ranges, unrelated documents and incomplete
evidence. They run the final source. All 12 relevant and two deliberately uncertain
items survived; nine distractors survived timeout fallbacks. Successful calls
matched all 16 item-membership decisions, but reporting only those calls would
hide half of the run.

The answer evaluator was unchanged between its two fresh sets. Combined results
are **46/48 primary labels** and **169/192 total labels**, with 21 unwanted
abstentions and two definite auxiliary errors. It detected all **30 labeled
defects**, but the auxiliary false flag prevents treating that recall result as
proof of a reliable automatic judge. The errors were treating a quoted draft
question as an applicable question and treating a no-records statement as an
explicit correction. Actual-source replay reproduced all 192 judgments exactly;
these remaining misses are classifier interpretation, not a status-mapping bug.

## Regression and rejected experiments

The final source ran once on 38 now-known ranking cases: **146/152 memberships**,
35/38 exact sets and 30/38 exact orders. Two timeouts and one invalid provider
output account for all six retained distractors. Five further cases had only
ordering differences; no expected item was removed. The previously failing
pronoun attribution and superseded-handbook cases passed on this run.

The invalid output selected an option at probability 0.35 while giving another
option 0.36. The transport correctly rejected the batch and retained the original
results. Validation was not relaxed to turn this into a successful call.

All calibration costs and failures remain in the archive, including rejected work:

- Exact input paths alone did not improve the old retrieval result. Independent
  topic/person/time questions improved the tested retained sets and were retained.
- A key-derived attribution prototype scored well but failed compatibility review:
  valid third-person facts can have ordinary keys. It was replaced by explicit
  stored metadata, with no inferred backfill.
- A later temporal prompt rewrite improved some orders but introduced three
  semantic retention errors. It was reverted byte-for-byte before the final
  document holdout; its results are not final-source evidence.
- Short atomic answer rubrics, six-question applicability splitting and defect-only
  labels all worsened at least one frozen criterion. None changed the final prompt
  or label contract. Their 128 calls, including the control run, cost $0.009634842.
- Analysis-only label coarsening was also rejected. The reported accuracy still
  distinguishes `clear`, `not_applicable` and expected `uncertain` labels.

Final retrieval SHA-256:
`20201b3a7e06a1727caa917546eeda6fc11edf1cf1bf66dbd2557b59e795485e`.
The final known regression and unseen document run record that same hash. Later
journals record source and corpus hashes; the early atomic prototype embeds its
source instead. Intermediate source versions were not all snapshotted; their recorded request bodies preserve the actual
questions sent, including experimental overrides.

The decomposition follows the provider's guidance on
[independent questions](https://docs.typesafe.ai/concepts/state) and
[composing atomic decisions in code](https://docs.typesafe.ai/concepts/how-to-build-with-system-one).
That guidance motivated experiments; the measured results above determine what
was retained.

## Cost and verification

An independent audit reconciled **18 journals, 504 requests and 490 responses**.
Known provider cost was **$0.038042256**, including $0.000157500 for two invalid
outputs. **14 timeout calls have unknown cost**, so the known amount is not a
complete bill. No calls or provider generation IDs were duplicated in the ledger.
There were no automatic retries. All 504 calls are synthetic calibration or
validation calls; none is a production-user experiment.

Existing budgets remain 750 ms for planning, 600 ms for ranking and 1,500 ms for
memory review. The offline answer evaluator uses 10 seconds. The archived ledger
contains observed per-run/per-operation latency, including failed calls. These
small local runs establish neither production latency nor an end-to-end speedup.

- Full unit suite: **3,015 passed, four skipped**; 303 files passed, one skipped.
- **22 integration tests passed** across five files on real disposable PostgreSQL.
  They cover ownership, explicit presented consent, concurrent corrections, expiry,
  subject round-trips, unverified rewrite clearing, undo and warm-cache invalidation.
- TypeScript, Biome and `git diff --check` passed. All three new corpus dry runs
  passed without provider access. Frontend code was not changed.

The standard integration command initially lacked Neon API credentials. The
configured test URL was also rejected because it matched the long-lived development
endpoint. A confirmed development child with automatic expiry was created through
the available Neon connector; a child-process wrapper supplied that disposable
target to the unchanged test safeguards. No local environment file or long-lived
database was changed. The branch expiry was configured for 2026-09-20 21:52 UTC.

## Reproduce and evidence

```bash
# Parser, routing and fixture contracts; no model calls.
bunx vitest run scripts/fixtures/ai-decisions-fresh.test.ts

# Fixed synthetic corpus plan; no model calls.
bun scripts/evaluate-ai-decisions.ts --corpus ready

# One paid run, refusing an existing output file; no database access.
bun scripts/evaluate-ai-decisions.ts --corpus ready --live --output ready.jsonl
# Other fixed sets: --corpus followup or --corpus documents
```

The [compressed evidence archive](runs/jev-readiness-2026-09-20.json.gz) is ordinary
JSON after decompression. It contains all 18 raw journals, fixture revisions,
predeclared gates, experiment analyses, final source snapshots, verification logs,
the independent cost audit and a hash manifest. Requests contain only synthetic
evidence and omit authentication headers. Failed and rejected experiments are
preserved alongside successful ones.

This validates component behavior and exposes its limits. It does not establish
overall coaching value, real-user quality, maximum-batch latency, a live production
rollout or a complete generated-answer-to-database flow with real model decisions.
The unchanged conservative defaults remain appropriate while the all-check
accuracy and ranking deadline gates are unmet.
