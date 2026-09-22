# Jev cutoff calibration and complete memory validation, 22 September 2026

Local evaluation at `bfeb802a`. Synthetic inputs only; no production accounts,
settings or deployment. Fixtures were agent-authored and independently reviewed,
not sampled or human-annotated production conversations.

## Archival cutoff replay

The replay used 162 recorded calls spanning 104 distinct case IDs: 94 ranking
attempts and 68 planning attempts. Ranking requests matched the current contract
or its identical predecessor with a 600 ms deadline. Planning questions exactly
matched the current prompt. Older ranking/prompt contracts and records lacking
standard request/transport evidence were excluded. Nine historical transport
failures remain in the denominator; a cutoff change cannot recover their missing
responses. Repeated attempts are not independent scenarios.

The raw archival planning score includes one case designated ambiguous before
its original run. Excluding that case gives 64/67 strict planning decisions.
Every baseline replay matched the recorded application output. A fixed coarse
grid compared recall cutoffs 0.80/0.75/0.70, exclusion cutoffs
0.90/0.85/0.80/0.75/0.70 and promotion cutoffs 0.80/0.75. No new model calls were
needed for replay. This tests deterministic policy tradeoffs on existing outputs;
it does not calibrate Jev's numbers into true probabilities of correctness.

| Replay result | Current policy | Selected candidate |
| --- | ---: | ---: |
| Recall / exclusion / promotion cutoffs | 0.80 / 0.90 / 0.80 | 0.80 / 0.70 / 0.80 |
| Exact rankings | 70/94 | 75/94 |
| Unwanted items retained | 25 | 18 |
| Expected useful or uncertain items removed | 0 | 0 |
| Effective planning decisions | 65/68 | 65/68 |
| New exact-case regressions | — | 0 |

Lowering recall to 0.75 recovered two missed reads but triggered two reads labeled
unnecessary by the archived gold, with no net exact-score gain. One regression
is unambiguous. The other fictional-sentence case lacks the sentence to revise,
so its historical self-contained label is contestable. Excluding both recordings
of that ambiguous case gives 63/66 current versus 64/66 at 0.75, but still one new
unambiguous unnecessary read. That violates the no-new-regressions rule. Lowering promotion to 0.75 introduced an
ordering regression. Both changes were rejected. The selected exclusion cutoff
had the most exact rankings among grid policies without new case regressions or
incorrect exclusions; ties prefer fewer extras, then higher cutoffs.

## Fresh cutoff validation

Before outputs, the candidate was frozen and a separate agent authored a new
holdout without access to the candidate or replay outputs. Two full runs use
current model requests and deadlines. Current and candidate cutoffs are applied
to identical recorded probabilities, so provider variation cannot explain their
within-run difference.

Acceptance requires no new incorrect exclusions, no new case regressions and at
least one additional exact ranking in each run. Recall stays unchanged. The
candidate will not be revised after seeing this holdout.

The candidate was **rejected**. Both policies produced identical outputs in both
runs. All 48 item membership decisions were correct per run, with no extra items
retained and no useful or uncertain items removed. The preferred full order
matched 8/12 cases. Effective recall decisions matched 10/11 unambiguous cases, plus correct
no-recall behavior on one predeclared ambiguous control. The clear miss selected
recall at 0.64/0.67, below 0.80. The ambiguous control selected recall at
0.57/0.58, also below the threshold, so its safe action does not establish a
correct semantic label. There
were no timeouts in either run.

The exclusion change cannot repair ordering differences: it only changes which
items are removed. Since it provided no additional exact ranking in the fresh
holdout, the predeclared improvement criterion failed. Recall/exclusion/promotion
remain 0.80/0.90/0.80. No alternative cutoff was chosen using holdout results.

The fresh holdout deliberately stresses preservation: 24 useful items, 12
uncertain fragments and 12 clear negatives across 12 ranking cases. It contains
new analogues of future-version notices that corroborate an earlier rule,
unchanged-deadline confirmations and indirect definitions needed for the answer.
Six paired planning cases add 12 requests. The two runs are repeats of those same
24 scenarios, not 48 independent examples. Corpus SHA256:
`93a29f15cc1d8d2695feaa2cc132231d4e19379606171adcb38c1a36ddc27fa8`.

Independent archival sensitivity found six additional fully compatible memory
requests excluded by the coarse whole-source-hash filter. Both cutoffs scored 5/6
on these, without new exclusions or regressions. They were reported separately
and did not change the frozen candidate selection.

## Complete memory flow

The initial full pipeline used the real candidate gate, Gemini extraction, Jev
review and isolated PostgreSQL persistence/approval. Its 12 bilingual cases used
semantic assertions and manual review rather than requiring exact generated keys
or wording. The original fixtures and all failures are retained.

It exposed a concrete extractor contract bug. The parser accepts eleven lowercase
category values, but the generation prompt did not list them and used a category
placeholder. Eight returned fact objects used invented or uppercase categories;
another response used an array root with uppercase SCHEDULE. Nine of eleven
extraction responses therefore failed validation. Only one reached Jev review.

The raw final-state score was 5/12: one of eight positive/consent scenarios and
four negative no-write cases. Two negative cases had failed schemas, so their lack
of writes is not evidence of correct reasoning. The other two correctly returned
no candidates or were skipped by the acknowledgment gate. All 22 provider
responses arrived; this was not a transport failure.

The fix enumerates categories from the same existing Zod enum, specifies `other`
for facts outside the named categories and explicitly requires an object with a
`facts` array. Strict parsing is unchanged. A regression test failed before the
fix and now passes; it also proves invented categories remain rejected. The
extractor/consolidator/review test group passed 69 tests.

The category-only fix was rerun on all twelve unchanged cases: all eleven
extraction responses passed schema validation, and 10/12 semantic outcomes
matched. All four negative cases now had legitimate no-write handling. Two values
were incomplete: a woodworking correction saved only "Ogni giovedì", and a
referenced person's ankle rehabilitation approval contained only its end date.
The stable-row and consent mechanisms worked; the lost context was in the
extractor's value itself.

A second bounded prompt correction requires contextual values to remain complete
statements without reading their keys, preserving which activity occurs when or
which event/plan ends on a date. It does not require sentence-shaped values for
identity/profile fields or weaken validation. Both earlier runs are retained.

That second rerun scored 11/12. The remaining correction used the generic key
`schedule`; the existing canonicalizer rejects category-only keys before review.
The extractor prompt now also requires a key identifying the activity/situation,
without incorporating the changing day/date. The canonicalizer remains strict.
The three changes complete the extractor's existing contract for category, value
and key; they do not change Jev, persistence rules or the memory architecture.

The complete-contract rerun matched all 12 original mechanical outcome checks.
Manual review found three remaining content-quality problems that this count
does not capture:

- Case 02 stores the correct code-review habit plus an orphan sentence equivalent
  to "This is my regular preparation habit." The extra row loses its activity
  when retrieved alone.
- Case 06 stores the complete museum rehearsal plan plus a redundant end-date
  row that does not identify the museum activity without its key.
- Case 05 correctly replaces the original Tuesday row, but changes "I attend
  every Thursday" into "the workshop takes place every Thursday." The day and
  row identity are right; the broader claim about the workshop is not established
  by the source. Jev accepted this wording.

These are model-output limitations, not evidence that all twelve cases have
fully faithful, self-contained memories. No further prompt tuning used these
final outputs.

Four independent fresh cases, frozen before calls, matched **3/4** complete-flow
outcomes. Choir preparation retained the blue-pencil detail; the referenced
friend's chess method retained identity and both steps. The dyslexia case created
two pending approvals and saved neither after presented refusals. One candidate
was incorrectly extracted as LOW sensitivity. Jev selected ordinary at 0.53
(sensitive 0.46); code's 0.90 ordinary threshold required approval. The consent
outcome was correct, but the sensitive semantic label was not.

The fresh temporary calligraphy plan failed because the extractor faithfully
copied `15 March 2027 inclusive` and the deterministic expiry parser did not
support the suffix. No Jev review was attempted. A two-line fix in the shared
resolver accepts `inclusive`, `incluso` and `inclusa` after verifying the complete
literal expression against user evidence. It retains the existing next-local-
midnight policy, timezone validation and rejection of ambiguous/invalid dates.
Both background consolidation and live memory tools use this resolver.

Four new date cases failed before the fix, then passed; additional checks retain
rejection of next-Friday ambiguity, exclusive dates and invalid calendar days.
The expiry/consolidator/memory-tool group passed 86 tests. A separate diagnostic
replay uses the exact recorded failed candidate, bypassing extraction, with one
real Jev review and isolated persistence. It passed: the exact candidate was
saved once for the account holder, with source provenance and expiry
`2027-03-15T23:00:00.000Z`; profile/preferences stayed unchanged. This verifies
the parser repair through persistence. It cannot turn the original fresh run
into a fresh 4/4 result.

Original memory corpus SHA256:
`b8a33a65adf3ec905574f18e2bcce936d9ddda346d56c02adefbce732e295e6e`.
Independent fresh corpus SHA256:
`233e06c95cdd66d25911a59527d9ed98361eef0f8bfeb8495d7a7169d6233168`.

## Answer-checker scope

Call-site inspection found the checker in benchmark scripts and tests, with no
automatic reply approval, rejection or rewriting path. It remains there. The
previous independently reviewed holdout scored each check separately: repeated
questions 11/16, ignored corrections 14/16, unsupported personal facts 14/16 and
unaddressed requests 16/16. These are earlier results, not additional calls or
proof that any check is generally reliable.

## Evidence and accounting

All original failures, prompt stages, raw requests/responses, fixture manifests,
source snapshots and independent audits are retained in the
[evidence archive](runs/jev-cutoff-and-complete-memory-2026-09-22.json.gz).
Provider requests used the application's existing routing; served providers and
model IDs are in the journals. Cutoff comparisons replay identical responses.
The memory prompt reruns are diagnostic sequences, not randomized causal model
comparisons. Local runners disable retries; no hidden success-only retries were
used.

| Live run | Calls | Known provider cost | Mechanical outcomes |
| --- | ---: | ---: | --- |
| Original complete memory | 22 | $0.001778518 | 5/12; two negative results caused by invalid schemas |
| Category contract | 29 | $0.002357060 | 10/12 |
| Complete contextual values | 28 | $0.002346862 | 11/12 |
| Complete contextual keys | 29 | $0.002573114 | 12/12, with three manual quality caveats above |
| Independent fresh memory | 11 | $0.000927982 | 3/4 |
| Fresh cutoff, first run | 24 | $0.001505406 | No candidate improvement |
| Fresh cutoff, repeat | 24 | $0.001505406 | No candidate improvement |
| Recorded-candidate date repair replay | 1 | $0.000050946 | 1/1; extraction bypassed, real Jev review and DB |

Total: **168 live provider calls**, **$0.013045294** reported provider cost, no
unknown costs or transport failures. There were 40 distinct synthetic input
scenarios, with repeats and one diagnostic replay; calls are not independent
test cases. The nine initial invalid extraction outputs remain included. The
162-call archival replay made no new requests and is excluded from this cost.

Approval questions and confirmation/refusal messages were authored while using
the real ownership, presentation and resolution APIs. This evaluation does not
cover generated coaching replies, the UI or natural-language confirmation
parsing. Usage and logs were captured in journals rather than billing tables.
An unused alternate fresh-fixture draft is excluded from the evidence archive;
the fresh corpus hash above identifies the only four cases actually run.

Final source verification: `bun run test` passed **3,041 tests**, with 4 skipped;
`bun run lint` and `bunx tsc --noEmit` passed. The database runs used only new
synthetic users on a disposable child of the development branch. No production
configuration, accounts or deployment changed. The result supports the concrete
extractor-contract and date-parser fixes; it does not establish general memory
quality or justify global activation of Jev.
