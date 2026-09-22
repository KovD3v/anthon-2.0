# Jev independent local validation, 22 September 2026

This evaluates the unchanged runtime at `92153615` with synthetic conversations.
No production accounts, configuration or data were used. Model requests ran from
local evaluation scripts against OpenRouter. Database checks use an isolated,
expiring development child. Expected labels were frozen before model outputs. Cases and labels were
agent-authored and separately reviewed, not human-annotated population samples.

## Answer checker

The previously unused, independently authored holdout contains 16 turns, eight
English and eight Italian. Its SHA256 is
`d013361f44561847ff8285cd94bf18b6db2609b3714c752042410a85b80c07e0`.
It was evaluated once against the existing rubric and 0.80 probability cutoff.
There were no retries, prompt changes or gold-label adjustments.

| Measure | Result |
| --- | ---: |
| Exact four-way judgments | 55/64, 85.94% |
| Primary judgments | 15/16 |
| Deliberately included defect checks detected | 11/11 across eight defective answers |
| Unwanted abstentions | 8 |
| Definite wrong judgments | 1 |
| False flags | 1 |
| Failed provider calls | 0/16 |

The 55 exact judgments include 54 definite matches and one correctly returned
intentional uncertainty. The one false flag is an auxiliary diagnosis on an
already defective answer, not a clean answer incorrectly rejected.

The four checks scored 11/16 for repeated questions, 14/16 for ignored
corrections, 14/16 for unsupported personal facts and 16/16 for unaddressed
requests. One additional uncertainty was intentional and correctly returned.

The false flag treated a new statement about live demonstrations instead of
videos as a correction of earlier information. No earlier correction existed.
The answer did contain an unsupported personal fact, which the separate check
correctly flagged. This distinction matters: detecting a bad answer does not
make every explanation of its defect correct.

The repeated-question check still hesitated on questions inside requested drafts
and on unnecessary coaching questions. Those latter questions are inappropriate
for the task but do not repeat information already supplied. No new tuning was
attempted after opening this holdout. It is now consumed and cannot be called an
unseen validation set for future changes.

This result remains below the existing 95% exact-label criterion. It supports
using the checker as an advisory signal, not automatic approval or rejection.
The 64 labels are correlated within 16 turns and do not measure Anthon's overall
answer correctness. They also do not score every internal evidence distinction:
one correctly flagged unsupported claim was internally classified as contradicted
when its details were merely absent.

## Retrieval

Twelve new ranking cases contained 48 items: six document cases and six memory
cases. Eight planning cases formed four missing/present-context pairs. Before
calls, two agent reviews found three negative examples that could help answer their
queries. Their text was corrected, preserving the earlier version and review
record. The final frozen corpus SHA256 is
`c3e03b513b25731e1ce23b6250b4773d3cc197b31d59d0349284dbc67d79b410`.
No labels or examples changed after model calls began.

The whole set ran twice. The second run measures repeatability on the same cases,
not another independent sample. No selective retries were made.

| Measure | First run | Full repeat |
| --- | ---: | ---: |
| Ranking exact order and membership | 9/12 | 9/12 |
| Correct individual membership decisions | 45/48 | 45/48 |
| Unwanted items retained | 3 | 3 |
| Expected useful or uncertain items removed | 0 | 0 |
| Ranking timeouts at 800 ms | 0/12 | 0/12 |
| Ranking p50 / maximum, ms | 347 / 430 | 359 / 439 |
| Effective recall-plan decisions | 7/8 | 7/8 |
| Raw recall-choice labels | 8/8 | 8/8 |
| Planning timeouts at 750 ms | 0/8 | 0/8 |

The same four cases missed their intended outcome in both runs:

- A request to resolve a pronoun in earlier missing wording needed recall.
  Jev selected recall at 0.76 and 0.79, below the 0.80 activation threshold.
- A form valid from October 5 was retained for an October 2 question. Jev chose
  temporally inapplicable at 0.70 and 0.76, below the 0.90 exclusion threshold.
- A memorization drill was retained for a question about applying instructions.
  Jev chose irrelevant at 0.72 and 0.64, below the exclusion threshold.
- An account-holder fact was retained for a comparison of two referenced people.
  Jev selected referenced-person scope at 0.89 and 0.87, with the item's
  other-person probabilities at 0.73 and 0.75. Neither reached 0.90.

These are conservative decision failures under the current thresholds, not
transport failures. Lowering the thresholds after seeing these cases would not
establish a better policy; it could remove useful evidence elsewhere. No threshold
or prompt was changed. The two runs demonstrate adequate latency for this small
four-item request size, not a load test or proof at the twelve-item maximum.
Reported p50 values use the lower nearest-rank quantile, not the average of the
two central observations. Independent scoring replayed the current probability
thresholds and matched all 40 recorded retrieval outcomes.
Document rankings were exact in 4/6 cases and memory rankings in 5/6, per run.
No generated coaching reply was evaluated downstream of these rankings.

## Memory review and persistence

Sixteen new Italian synthetic cases ran through the real Jev review,
consolidation, approvals and PostgreSQL persistence functions. Extraction supplied
one frozen candidate per case instead of calling the extraction model. The
fixture SHA256 is
`35d5c8eec18b7b0e59ee10f543b56a258f01c4ec410080dbc5065db82de716e9`.
The pre-call review corrected one unused subject field on a rejection expectation;
the original authoring version is preserved.

All 16 intended database outcomes matched. All 50 raw choices matched the
predeclared allowed choices, including three explicitly ambiguous cases where
uncertain/unsupported alternatives were allowed before seeing outputs.

| Intended action | Matched |
| --- | ---: |
| Save ordinary or temporary facts | 5/5 |
| Reject unsupported, ambiguous, prohibited or conflicting writes | 7/7 |
| Correct an existing fact under its stable key | 1/1 |
| Recognize a duplicate without changing it | 1/1 |
| Save a sensitive fact after presented explicit consent | 1/1 |
| Respect refusal of a referenced person's sensitive temporary fact | 1/1 |

The tests checked content, attribution, expiry, revisions, source provenance,
preserved prior rows and unchanged account profile/preferences. Both sensitive
candidates were deliberately mislabeled LOW by the mocked extractor; Jev escalated
them to approval. Neither was saved before consent. Premature confirmation and
confirmation from another account were refused. The refused fact remained unsaved.
An independent recount and direct assertions over recorded database snapshots
confirmed these outcomes.

There were 16 valid provider responses, no timeouts or failed calls, and no
unknown costs. Jev transport p50 was 339 ms and maximum was 759 ms against
its 1,500 ms deadline. Those timings exclude database and approval operations.

A setup preflight checked the actual candidate parser, both expiry expressions,
and all database expectations using a mocked transport. The first live launch
then collided with those preflight records' synthetic emails. It made zero
provider calls. The runner was fixed to use unique per-run emails and the same
frozen cases ran once with real Jev. The failed zero-call journal, original runner
and successful run are all retained. This was a test-runner fix, not a runtime fix.

These results cover review and persistence for one candidate at a time. They do
not validate real extraction quality, maximum batches, English memory cases or
full generated conversational replies. Rejected key collisions protect existing
facts but can also discard a legitimate new fact; a matching rejection here means
the current protective contract was followed, not that every user goal completed.

## Evidence and limits

[The evidence archive](runs/jev-independent-validation-2026-09-22.json.gz) contains
frozen inputs, review records, raw synthetic journals, scoring results, runners,
source snapshots and the failed setup launch. Journal headers identify exact
source and fixture hashes. There were 72 live model requests across 52 distinct
scenarios, including a full repeat of the 20 retrieval cases. Known provider cost
was **$0.004966920**, with zero unknown-cost calls:

- Answer holdout: 16 calls, $0.001298094.
- Retrieval first and repeat: 40 calls, $0.002837268.
- Memory review/persistence: 16 calls, $0.000831558.

All live requests used the current application transport; no production setting,
threshold, rubric or application source was changed. This report adds validation
evidence to the earlier [correctness fixes and regression results](jev-followup-2026-09-22.md).
The earlier unit and database regression counts are not new live-model results.
Final Biome verification checked 842 files without fixes; application source
remained unchanged, so the earlier regression suites were not rerun for this
evidence-only commit.

This is a deliberately challenging synthetic sample,
not a random sample of real conversations. A zero observed error count does not
establish zero future risk. No production-readiness claim follows from it.
