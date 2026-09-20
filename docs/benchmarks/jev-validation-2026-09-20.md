# Jev expanded validation — 20 September 2026

Implemented narrower memory and answer-review instructions, clearer retrieval
person attribution, and a fix for past-advice references that bypassed semantic
recall. Kept the existing models, probability cutoffs, privacy guards and rollout
controls. No deployment or global activation was performed.

The [compressed evidence archive](runs/jev-validation-2026-09-20.json.gz) contains
all inputs, original labels, independent reviews, source versions and hashes,
runner source, every attempted request and response, costs, effective outcomes,
and verification logs. It decompresses to ordinary JSON. All provider inputs
were synthetic; live runners mocked application metering and made no database
writes. These results measure decision components, not end-to-end coaching or
real-user memory persistence.

## Final changes

- Memory support checks explicitly distinguish reports of real people's words
  from fictional quotations, honor an explicit prohibition on saving a fact,
  and recognize an unqualified description of the speaker's own performance
  context. Extraction and the memory tool description use the same no-save
  policy. These prompt rules are not deterministic enforcement across every
  memory writer.
- Ranking explicitly checks whose experience a memory describes. A matching
  topic does not make another person's memory evidence about the requested
  person. Queries requesting multiple people or contexts remain supported.
- Recall preselection now recognizes English and Italian references such as
  “you suggested” and “avevi consigliato”. Previously, a reference without a
  word like “that” could bypass Jev before its semantic judgment ran. The
  classifier still decides whether older current-thread context is needed.
- Answer checks assess each requested piece of information in a question group
  and require the answer to preserve quotation/translation framing. A fictional
  translation task does not excuse an unframed assertion about the user.

No numeric cutoff was lowered. Planning and ranking timeouts remain 750 ms and
600 ms; the existing voice/extraction gates and Luna Priority routing retain
their behavior. Semantic memory matching retains its baseline question after a
longer correction instruction caused additional missed duplicates.

## Design and independent labels

Baseline: `e568ecb3`. Jev requests used `typesafe/jev-1.13`, served as
`typesafe/jev-1.13-20260917`. Development and holdout each contain 24 memory cases
with 36 candidates, 16 planning cases, six ranking cases with 24 items, and 32
answers with four judgments each. Each answer set has 16 primary defects and
16 controls, with eight primary checks per defect category.
Development controls comprise 12 clear, two not-applicable and two deliberately
uncertain labels; all 16 holdout controls are clear.

Different agents authored development and holdout cases. The holdout author did
not inspect the implementation changes. Independent reviewers recorded labels
before viewing the author key or model outputs. They are AI reviewers, not
human annotators. The holdout review agreed on all 36 memory outcomes, 16 plans,
24 ranking labels and 128 answer labels.

Two development answer labels and three holdout answer labels were declared
ambiguous auxiliary checks before outputs; all 32 primary checks remain scored.
One memory sensitivity field and two planning decisions also have predeclared
alternative interpretations. Three incomplete ranking fragments must be retained
whether classified relevant or uncertain. The archive preserves strict author
scores and the scoped ambiguity records; no whole cases or unfavorable runs
were discarded.

Schema validation caught 25 invalid candidate-category values in an initial
memory development run. That run is retained as diagnostic and cost evidence,
not as the final baseline. Corrected candidates passed the actual extractor
parser, canonicalization and date checks. Three holdout candidate-key prefixes
were corrected before its calls without changing the labels.

## Development results

| Measure | Corrected baseline | Final implementation |
| --- | ---: | ---: |
| Memory outcomes | 33/36 | 34/36 |
| Rejected candidates admitted / sensitive consent missed | 0 / 0 | 0 / 0 |
| Planning outcomes | 16/16 | 16/16 |
| Ranking retained order | 2/6 | 4/6 |
| Primary answer labels | 28/32 | 30/32 |
| Primary defects detected | 14/16 | 15/16 |
| Primary definite errors / unwanted abstentions | 1 / 3 | 0 / 2 |

Answer and ranking rows reuse the candidate runs because their evaluated paths
were not subsequently changed. The final recall-preselection additions are
verified separately on previously skipped wording below.

Development still skips one supported fact adjacent to fictional text and does
not confidently link one correction to its existing fact. Ranking retains all
seven useful items and all five uncertain fragments, but also retains two
irrelevant memories. The answer checker still abstains on a repeated question
inside a group and on one useful clarification. This is improvement within
specific uses, not uniform reliability.

The memory experiments are all archived: the broader prompt rewrite scored
33/36, a reduced input payload scored 31/36, and a narrower prompt scored 35/36.
The first two were discarded. The later matching-question rollback produces the
final 34/36 development result; the intermediate 35/36 is not the final score.

## Fresh holdout, regression corrections and new follow-up

| Measure | Baseline holdout | First candidate holdout | Final post-fix rerun |
| --- | ---: | ---: | ---: |
| Memory outcomes | 35/36 | 33/36 | 35/36 |
| Rejected candidates admitted / sensitive consent missed | 0 / 0 | 0 / 0 | 0 / 0 |
| Correct semantic memory matches | 6/6 | 4/6 | 6/6 |
| Planning outcomes | 15/16 | 15/16 | 16/16 |
| Ranking retained order | 6/6 | 6/6 | 6/6 |
| Primary answer labels | 31/32 | 32/32 | 31/32 |
| Primary defects detected | 16/16 | 16/16 | 16/16 |
| Primary false flags / definite errors | 0 / 0 | 0 / 0 | 0 / 0 |
| Primary unwanted abstentions | 1 | 0 | 1 |
| All unambiguous answer labels, including auxiliary checks | 124/125 | 120/125 | 119/125 |

The candidate was frozen before the first holdout. That run exposed two missed
memory duplicates and a preselection bug in recall planning. Restoring the
baseline matching question recovered the duplicates; extending reference
preselection recovered the missing recall path. The last column is a live
regression rerun of inspected cases, not another unseen holdout.

The final memory rerun rejects all 11 candidates expected to be rejected,
preserves all six semantic matches, and requires approval for all three sensitive
facts. Its remaining mismatch is an unnecessary approval for an ordinary fact.
Ranking retains nine useful items and three uncertain fragments and removes all
12 irrelevant items. Recall never broadens cross-channel access.

The answer code did not change between the two candidate holdout runs. One
supported personal statement crossed below the 0.80 probability cutoff on repeat,
so the result changed from 32/32 to 31/32 with uncertainty, not a wrong assertion.
Across all 128 labels, the final rerun has 120 matches, eight abstentions and zero
definite errors. Excluding only the three predeclared ambiguous auxiliary checks
yields 119/125 matches and six abstentions. Auxiliary performance is therefore
weaker than the primary-check score and regresses from the baseline: five more
auxiliary labels receive uncertainty. The narrow changes repair a demonstrated
personal-attribution defect in development, but do not improve aggregate holdout
coverage. This tradeoff is retained explicitly, with broad rollout disabled.

After the final source freeze, a separate agent authored eight further examples:
two duplicate memories, two explicit corrections, and two bilingual pairs of
missing-versus-present advice context. An independent evidence-only review agreed
with every label before calls. The final code passed **8/8**, versus baseline
**7/8**: memory stayed 4/4 and planning improved from 3/4 to 4/4. This is a small
targeted follow-up, not a replacement for the larger holdout.

## Stronger-model comparison, cost and latency

The same saved answers were independently checked with
`anthropic/claude-opus-4.6`, using a fixed rubric and structured output through
[OpenRouter's documented API](https://openrouter.ai/docs/guides/features/structured-outputs).
Neither evaluator received fixture IDs, expected labels or the answer model's
identity. Reference-model labels were never substituted for the reviewed labels.

| Primary-answer measure | Jev development | Opus development | Jev first holdout | Opus holdout |
| --- | ---: | ---: | ---: | ---: |
| Exact labels | 30/32 | 28/32 | 32/32 | 31/32 |
| Defects detected | 15/16 | 15/16 | 16/16 | 16/16 |
| Definite errors | 0 | 3 | 0 | 1 |
| Unwanted abstentions | 2 | 1 | 0 | 0 |
| Provider-reported cost | $0.002591 | $0.407855 | $0.002576 | $0.397480 |

Opus did not justify replacing Jev for these checks: it cost roughly 154–157
times as much on these inputs and made definite labeling mistakes. One reference
response even supplied a reason supporting “clear” while its structured status
remained “flagged”; the actual status is preserved and scored.

All 17 runs made **556 requests**. Known provider-reported cost was
**$0.836942058**, with **one unknown-cost timeout**; that aborted call is not
counted as free. The two Opus runs account for $0.805335. Discarded experiments,
the malformed-fixture diagnostic run, failures and repeat runs are included.
The first candidate holdout had one planning timeout that safely retained the
self-contained baseline plan; its correct core outcome does not imply a
successful classifier call.

The final 78-call Jev regression run cost $0.005093046, compared with $0.004734114
for 76 baseline calls. Added instructions and two newly eligible planning checks
increase this run's cost by about 7.6%; this change is not a cost saving. Observed
local request p50/p95 were 358/516 ms versus baseline 346/456 ms. Separate workloads
ran concurrently, and these small local measurements do not establish production
chat latency or statistical superiority. No automatic retries were added.

## Verification and remaining boundary

- Full unit suite: **2,893 passed, four skipped**; 302 files passed, one skipped.
- Final focused retrieval/memory checks, Biome, TypeScript and the offline answer
  CLI dry run passed. The new English/Italian preselection regression checks also
  verify that a self-contained classifier answer keeps retrieval disabled.
- Database guards and schemas were not changed. The earlier persistence tests
  remain separate evidence with mocked model decisions; no live model-driven
  persistence claim is made here.

These are synthetic decision tests with independently reviewed labels. They do
not establish overall coaching usefulness, calibrated real-world probabilities,
or readiness for broad release under ADR-0024. No rollout settings were changed,
and nothing was pushed or deployed during this validation task.
