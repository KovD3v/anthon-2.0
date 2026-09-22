# Jev decisions

Anthon uses Jev for bounded classifications. Reply generation, fact extraction,
date resolution and database mutations keep their existing implementations.

## Shared cores

`src/lib/ai/typed-decisions.ts` sends independent Choice questions in one
OpenRouter Decisions request. Every requested answer must have a valid choice
and confidence. Selected-option probabilities and the full distribution are
preserved separately. Missing or malformed answers fail the batch. New cores
require selected probability and do not fall back to confidence; legacy gate
and voice scoring retain their existing behavior. Usage is recorded once per request, including known
supplier costs on failures.

| Core | Before the operation | After the operation |
| --- | --- | --- |
| `memory-decisions.ts` | Existing gate decides whether extraction is useful. | Reviews extracted support, person, sensitivity and semantic matches together. |
| `retrieval-decisions.ts` | Supplements unresolved references that may need earlier context. | Ranks already authorized facts and document chunks. |

The phases remain separate because later questions depend on extracted or
retrieved data. Batching does not combine dependent decisions.

Memory review handles at most eight candidates and three matching peers per
candidate from 32 recent facts. It checks against the original user message.
Active review skips saving a candidate when factual support or person attribution
is uncertain, a call fails, the input exceeds review bounds, or review is missing.
There is no deferred retry queue. Both support and attribution require selected
probability at least 0.90. Uncertain matches do not merge facts; a semantic match
requires 0.98. Sensitivity must clear 0.90 for ordinary automatic storage;
otherwise supported candidates use the existing approval flow. Corrections require explicit user evidence and recheck the stored
fact's owner, ID, timestamp, revision and source freshness under the existing
account lock. Revisions and undo use the existing storage model.

New consolidated facts preserve explicit `ACCOUNT_HOLDER` or
`REFERENCED_PERSON` attribution in the existing JSON value (`_subject`). Approval
and undo preserve it. Legacy facts remain unattributed; keys never prove identity.
A rewrite without verified attribution clears the old attribution.

Retrieval ranking handles at most 12 candidates. Selected probability must reach
0.80 to promote relevant evidence and 0.90 to exclude irrelevant evidence;
uncertain or unassessed items stay. Planning requires 0.80 to enable a read. Semantic continuation can enable current-thread
recall only, within existing permissions. Expiry is checked again after ranking.
Raw admin document search retains its vector ordering.

Ranking separates topic, person and time/version into independent questions in
one request. Documents use topic and time/version only. Explicit stored subject
metadata enables a holder/other-person scope check; it does not identify which
referenced person is requested. At most 37 questions assess 12 memory candidates,
or 24 questions assess 12 document candidates. Promotion requires every relevant
dimension to clear 0.80; any exclusion dimension can clear 0.90. Unknowns stay
in their original relative order. A timeout or invalid batch keeps the complete
original result, including any distractors it contained.

## Activation and rollback

New behavior defaults off, as required by [ADR 0024](adr/0024-gate-real-user-experiments-and-ai-changes.md).
Both an explicit mode and exact account IDs are required:

```dotenv
AI_MEMORY_REVIEW_MODE="shadow"
AI_RETRIEVAL_DECISIONS_MODE="shadow"
AI_JEV_ALLOWED_USER_IDS="account-id-1,account-id-2"
```

`shadow` records decisions and costs while preserving existing results. `active`
applies decisions for the listed accounts. An empty allowlist enables nobody;
wildcards do not enable a broad rollout. Set a mode to `off` or remove an account
to roll back. The existing `AI_MEMORY_GATE_MODE` and voice behavior are unchanged.
Memory retrieval still requires the existing memory-recall release gate.

Memory review has a 1,500 ms provider timeout and runs after the reply. Retrieval
planning allows 750 ms and ranking 800 ms per call, without retries. The prompt
recall path can add up to 1,550 ms of Jev work; a newly enabled thread search also
uses its existing 100 ms database budget. Each existing read-tool call can add
800 ms independently. These are timeout bounds, not measured latency gains.

Costs appear under `memory_review`, `retrieval_planning` and `retrieval_ranking`.
Decision logs contain counts, timing and failure codes, without conversation text.
Use the existing domain override `APP_LOG_DOMAIN_LEVELS=decisions:info` to enable
these logs without enabling the broader AI logs. Logging defaults are unchanged.

## Offline answer checks

The evaluator checks saved answers for repeated questions, ignored corrections,
unsupported personal facts and unaddressed explicit requests. It accepts grouped
questions when the information is still needed. It runs outside the chat path,
does not write to the database and does not produce or rewrite answers.

Reports use outcome probability with a 0.80 cutoff and retain the
distribution confidence for diagnostics. These values are different metrics,
and neither is a measured accuracy rate. Version 2 reports use `minProbability`,
raw selected `probability`, summed `decisionProbability`, and personal-fact
`evidenceChoice`. When mutually exclusive evidence labels map to the same outcome,
their probabilities are added before the cutoff. This combines absence and
contradiction only when the supplied context is complete. A personal claim absent from
incomplete context stays uncertain; a claim contradicted by supplied evidence
can be flagged. A question cannot be declared non-repeated when earlier history
is missing, while a repetition established by visible evidence can be flagged.
The [calibration report](benchmarks/jev-calibration-2026-09-20.md) separates live
held-out results, later deterministic replay, and remaining abstentions.

```bash
# Validate the built-in synthetic evaluation plan; no provider calls.
bun run eval:answer-checks

# Inspect a saved synthetic run before spending on evaluation.
bun run eval:answer-checks --input baseline.json --input-scope synthetic

# Evaluate saved baseline and candidate answers with the same checks.
bun run eval:answer-checks --live \
  --input baseline.json --candidate candidate.json --input-scope synthetic \
  --max-calls 60 --output answer-check-report.json
```

Use `--model` and `--candidate-model` to select answer models from mixed runs.
Reality summaries and conversation benchmark results/replicas are supported.
Missing history or personal context remains explicitly incomplete. Reports
separate flags, uncertainty, non-applicable checks and failures, with denominators,
matched comparison pairs, observed latency and provider-reported or unknown cost.
Output files exclude answer text and must not already exist.

`--live` without input evaluates the labelled synthetic fixtures. Unit checks and
a dry run establish evaluator behavior; only an actual provider run can establish
agreement with those labels. That run reports matches, disagreements, uncertainty
and failures separately. The fixtures are narrow checks, not evidence of
overall coaching quality or real-user value.

Real-user exports require an approved, unexpired quality-review project under
[ADR 0025](adr/0025-separate-admin-roles-and-set-public-launch-gates.md), supplied as
`--input-scope approved-review --review-project ID`. The CLI does not grant access
or verify that external approval. Use authorized exports only.

For memory review, recall planning, ranking and answer checks together, run
`bun scripts/evaluate-ai-decisions.ts` to list the fixed synthetic corpus, or add
`--live --output NEW.jsonl` for a bounded provider run. It accepts no external
conversation data and blocks database access. The
[fresh-test report](benchmarks/jev-fresh-2026-09-20.md) contains the results and
separates fixture validation from measured model quality.

Choose `--corpus fresh|ready|followup|documents` for the fixed synthetic sets
(66, 68, 32 and 8 cases respectively). No external data paths are accepted.
The [local readiness report](benchmarks/jev-readiness-2026-09-20.md) preserves all
calibration attempts and fresh runs. Its all-check accuracy and document-ranking
deadline gates remain unmet; successful unit tests do not establish model quality.

The [22 September correctness review and retest](benchmarks/jev-followup-2026-09-22.md) records the 800 ms ranking results, memory attribution fixes and rejected answer-checker tuning.
