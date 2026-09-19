# Chat quality evaluation

The `conversation-v2` cases cover study, work and sport, direct recommendations, practical tasks, grouped discovery questions, correction and continuity. The prompt and judge follow [ADR-0030](../adr/0030-group-related-coaching-questions.md): group related questions when their answers change the next coaching move, and answer directly when enough is known. Guest and authenticated turns use the same coaching policy.

## Run without model or database access

```bash
bun run benchmark:memory-recall
bun run benchmark:memory-recall --planner-only
bun run benchmark:conversation inspect --candidate src/lib/benchmark/fixtures/conversation-answers.json
```

The memory command reports separate results:

- `plannerOnly` measures whether recall was planned for 30 synthetic messages. It does not measure whether a useful fact was retrieved.
- `offlineRetrieval` calls the production memory functions with a synthetic Prisma boundary. Eight observations cover study/work/sport facts, correction, expiry, deletion and an empty account. The check also verifies idempotent writes and rejects another owner's lookup or revision. Dates, stored rows and revisions change during the check; retrieval and correction results are observed rather than supplied as successful outcomes.
- `generatedAnswers` remains `not_evaluated`. Unsupported memory claims and evidence quality remain `null` unless those behaviors were measured.

The offline boundary does not verify PostgreSQL transactions or SQL. Expiry is supplied by the fixture and tested after the existing cache interval; the check does not implement or evaluate temporary-fact extraction. Cross-channel checks verify the planner's permission decision. Raw-transcript retrieval is covered separately by `src/lib/ai/conversation-recall.test.ts`, including owner and current-thread query constraints. Production latency and model cost cannot be inferred from in-memory timings or the zero-provider-cost run.

The answer inspection command reads actual `assistantText` values from a supplied artifact. The included artifact contains three handwritten controls, including an intentionally repeated question; it contains no generated-model evidence. Inspection reports missing expected terms, repeated-question terms, question punctuation and word-count diagnostics. It leaves semantic quality, safety and unsupported-memory claims unmeasured. Exact-term matches can miss valid paraphrases and cannot establish coaching quality.

Inspection also accepts generated v2 run artifacts. A minimal supplied artifact has this form:

```json
{
  "source": "description of where these answers came from",
  "scenarioVersion": "conversation-v2",
  "replicas": [
    {
      "scenarioId": "conversation-work-recommendation",
      "turnIndex": 0,
      "assistantText": "The answer being evaluated"
    }
  ]
}
```

Fact precision and recall are scored within each observation. A work fact returned for a study question cannot become correct merely because another scenario expects it. Reports include the number of evaluated samples for each kind of evidence; an unmeasured metric is `null`.

## Evaluate generated answers

The existing generation and blinded comparison commands evaluate model responses with the current scenario anchors and coaching rubric:

```bash
bun run benchmark:conversation baseline --label before --samples 3 --allow-db-mutation
bun run benchmark:conversation candidate --baseline BASELINE_JSON --label after --samples 3 --allow-db-mutation
bun run benchmark:conversation compare --baseline BASELINE_JSON --candidate CANDIDATE_JSON --judge
```

Generation uses the configured development or ephemeral database; generation and judging call paid models. These commands were not run for the offline implementation checks. Start a new v2 baseline. Archived v1 artifacts cannot be compared against the changed scenarios, and their historical scores do not establish the quality of the current prompt.

Before broad prompt promotion, follow ADR-0024: review representative generated answers, privacy and boundary regressions, latency and cost, then use a staged cohort with rollback. Keep the existing brief urgent-safety exception in the runtime prompt. Reconciling that exception with ADR-0018 is a separate product decision, outside this change.
