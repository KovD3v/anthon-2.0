# Jev correctness review and 800 ms retest — 22 September 2026

Ranking now has an 800 ms provider deadline. Two local runs of the same eight
document cases completed without timeouts; 15/16 exact rankings and 63/64 item
memberships matched. One irrelevant historical document remained. The answer
checker tuning candidate was rejected because it introduced another false flag.
Production settings and data were untouched.

## What the correctness claim actually establishes

The previous 3,015 unit tests covered the whole project, not just Jev. The 22
database tests exercised specific memory boundaries with mocked classifier
responses. Their archived counts are correct, but passing them did not prove
general application correctness or classifier accuracy.

The followup review reproduced a real attribution defect: semantic merge matching
still inferred the account holder from ordinary keys, and consolidation omitted
stored subject metadata from the review input. Retrieval had already been fixed;
merging had not. A referenced-person fact could therefore become an eligible
account-holder merge target. The fix requires explicit matching attribution and
preserves the complete referenced-person descriptor. Legacy unknown attribution
is not evidence for an automatic semantic merge.

Known opposing subjects must also be rejected at the locked write boundary, since
ordinary exact-key writes can run with review off or shadow. The same guard prevents
two referenced people with the same name but different relationship descriptors
from overwriting one another. Both save and revise paths reproduced this bug
before the fix. This does not change
the existing contract for ordinary unverified writes: they clear prior attribution.

## Ranking: one changed variable

Prompts, gold labels, thresholds, provider and fallback behavior were unchanged.
The existing fixed-corpus runner made one contemporary 600 ms baseline run, then
two full 800 ms runs. These are repeated known cases, not sixteen fresh examples.

| Run | Timeouts | Exact rankings | Correct memberships | Maximum observed request time |
| --- | ---: | ---: | ---: | ---: |
| 600 ms baseline | 1/8 | 5/8 | 29/32 | 603 ms, timed out |
| 800 ms first run | 0/8 | 8/8 | 32/32 | 442 ms |
| 800 ms repeat | 0/8 | 7/8 | 31/32 | 774 ms |

No expected useful or uncertain item was removed. The repeat retained a March
rule for a question comparing January and April, so the timing change does not
solve every semantic mistake. Its 774 ms successful call shows why the extra
budget can matter. The first run finished entirely below 600 ms; sequential
comparisons cannot separate provider variability from the deadline effect.

The changed deadline applies to both memory and document ranking. It permits
200 ms more waiting per ranking call; planning remains 750 ms, so combined Jev
planning/ranking timeouts can total 1,550 ms. No automatic retries were added.

## Answer checker: one rejected tuning candidate

The frozen candidate appended two narrow instructions: distinguish questions to
the account holder from questions written inside requested drafts, and establish
a real user correction before inspecting the candidate answer. The other two
checks, all four labels, 0.80 cutoff and incomplete-context safeguards stayed the
same. It was compared with the unchanged baseline on 48 known turns in alternating
AB/BA order, for 96 calls with no retries.

| Metric | Baseline | Candidate |
| --- | ---: | ---: |
| Exact judgments | 172/192 | 173/192 |
| Unwanted abstentions | 18 | 17 |
| Definite errors | 2 | 2 |
| False flags | 1 | 2 |
| Primary labels | 46/48 | 46/48 |
| Detected labeled defects | 30/30 | 30/30 |

The predeclared acceptance rule prohibited new false flags. The candidate failed:
an inappropriate rehearsal exercise was newly flagged as a repeated question.
The original draft-question error became uncertainty, while the original false
correction flag remained. No answer-checker production source was changed.

Today's baseline 172/192 versus the earlier 169/192 is repeat variation, not a
code improvement. An independently authored 16-case holdout was frozen but left
unused after the candidate failed; its labels are not evaluated evidence.

## What more tests can establish

The earlier 23/23 recall result is promising evidence from a small synthetic set.
More independent, representative cases can strengthen confidence, especially
ambiguous subjects, legacy facts, consent, corrections and missing context.
Repeating familiar examples mainly measures repeatability. Gold-label review and
testing the complete behavior matter more than increasing the raw test count.
No finite test set proves correctness on all future conversations, and production
accounts are not required for the local work described here.

## Evidence and verification

- Full unit suite: 3,033 passed, 4 skipped (303 passing files).
- Biome: 842 files checked, no fixes required. TypeScript and diff checks passed.
- Database: all 31 cases across five files passed on an expiring development
  child branch. After adding off/shadow regressions, the affected file passed
  all 13 cases (33 distinct database cases covered across both runs).
- Red-before-green evidence reproduced five review/projection failures, four
  persistence failures and two same-name descriptor failures before their fixes.
  Classifier responses are mocked in these database checks; they establish
  persistence behavior, not real-model classification quality.

The [compressed evidence archive](runs/jev-followup-2026-09-22.json.gz) contains
raw synthetic model journals, frozen experiment rules and inputs, rejected
candidate, unused holdout, scoring results, source snapshots and test logs.
The child database is isolated from the long-lived development and production
branches and expires automatically.

The 24 ranking calls cost $0.001799364 in known provider charges, plus one timeout
with unknown cost. The 96 answer-checker calls cost $0.008098104 with no failures
or unknown-cost calls. Combined: 120 synthetic calls, $0.009897468 known cost,
one unknown-cost call. Costs include the rejected candidate and all controls.
