# Nemotron Voice Classifier Trial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Determine whether a conservatively configured Nemotron classifier can replace Gemini for automatic voice suitability without reducing delivery correctness, reliability, or latency.

**Architecture:** Keep explicit voice/text and obvious text-only cases deterministic. Share one structured schema and prompt builder between production and the live harness, run Nemotron through the bounded classifier provider route, and separate raw model accuracy from the effective end-to-end decision after server vetoes. Change the runtime default only after an automated 200-request gate passes.

**Tech Stack:** TypeScript, Bun, Vitest, Vercel AI SDK structured output, Zod, OpenRouter.

## Global Constraints

- Work directly on `main` because the user declined a worktree.
- Preserve the existing unrelated modifications in `src/lib/ai/communication-style.ts`, `src/lib/ai/light-prompt.ts`, `src/lib/ai/orchestrator.test.ts`, and `src/lib/plans/catalog.ts`.
- Test at most two Nemotron prompt variants.
- Keep Gemini as the runtime default until every gate passes.
- Use DeepInfra, reasoning disabled, zero retries, and a 1,500 ms total timeout for Nemotron.
- Fail closed to text and never add Nemotron as a voice runtime fallback.
- Require at least 199/200 valid outputs, 100% effective voice/text accuracy, zero protected false-voice decisions, and p95 at or below 600 ms.
- Do not push, deploy, or change production environment variables.

---

### Task 1: Add deterministic text-only vetoes

**Files:**
- Modify: `src/lib/voice/preflight.test.ts`
- Modify: `src/lib/voice/suitability.ts`

**Interfaces:**
- Consumes: `getDeterministicVoiceSuitability(params: DeterministicSuitabilityParams): VoiceSuitabilityHint | null`.
- Produces: deterministic `TEXT_PREFERRED` hints for link-only and narrow short-factual requests without invoking the model.

- [ ] **Step 1: Write failing end-to-end preflight tests**

Add table-driven cases proving that these messages resolve to text with
`source: "deterministic"` and never call `generateText`:

```ts
it.each([
  ["Dammi solo il link alla pagina ufficiale.", "link only"],
  ["Send me just the official link.", "link only English"],
  ["Che ore sono a Roma?", "short factual"],
  ["What time is it in Rome?", "short factual English"],
])("keeps %s requests in deterministic text", async (userMessage) => {
  const result = await decideWebVoiceMode({ ...baseParams(), userMessage });
  expect(result).toMatchObject({
    mode: "TEXT",
    category: "TEXT_PREFERRED",
    reasonCode: "TEXT_PREFERRED",
    source: "deterministic",
  });
  expect(mocks.generateText).not.toHaveBeenCalled();
});
```

Add a negative case proving that a reflective sentence containing `ora` does
not trigger the factual veto:

```ts
it("does not treat reflective uses of time words as short factual requests", async () => {
  await decideWebVoiceMode({
    ...baseParams(),
    userMessage: "Cosa provi quando guardi l'ora prima della gara?",
  });
  expect(mocks.generateText).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bunx vitest run src/lib/voice/preflight.test.ts`

Expected: the four text-only cases report classifier-sourced voice or call
`generateText`; the reflective negative case keeps the existing classifier
path.

- [ ] **Step 3: Implement the narrow deterministic patterns**

In `src/lib/voice/suitability.ts`, add bounded Italian/English patterns for
explicit link-only requests and direct time/date/score questions. Evaluate them
after explicit voice/text precedence and before the general model fallback:

```ts
if (LINK_ONLY_REGEX.test(params.userMessage)) {
  return { category: "TEXT_PREFERRED", confidence: 1, reason: "short_factual" };
}
if (SHORT_FACTUAL_REGEX.test(params.userMessage)) {
  return { category: "TEXT_PREFERRED", confidence: 1, reason: "short_factual" };
}
```

Keep the factual matcher phrase-based rather than keyword-based so reflective
uses of `ora`, `time`, or `score` continue to the model.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `bunx vitest run src/lib/voice/preflight.test.ts`

Expected: all voice preflight tests pass.

- [ ] **Step 5: Commit the deterministic boundary**

```bash
git add src/lib/voice/preflight.test.ts src/lib/voice/suitability.ts
git commit -m "fix(voice): keep obvious text-only replies deterministic"
```

### Task 2: Share the candidate prompt and make the benchmark truthful

**Files:**
- Create: `src/lib/voice/suitability-prompt.ts`
- Create: `src/lib/benchmark/voice-classifier.test.ts`
- Create: `src/lib/benchmark/voice-classifier.ts`
- Modify: `src/lib/voice/suitability.ts`
- Modify: `scripts/benchmark-voice-classifier.ts`

**Interfaces:**
- Produces: `VoiceSuitabilityPromptVariant = "baseline" | "nemotron_a" | "nemotron_b"`.
- Produces: `buildVoiceSuitabilityPrompt(input, variant): string` and `voiceSuitabilitySchema`.
- Produces: `scoreVoiceClassifier(results): VoiceClassifierScore` with raw and effective metrics plus `passed`.
- Consumes: `getOpenRouterProviderOptionsForClassifier(modelId)` and `getDeterministicVoiceSuitability(params)`.

- [ ] **Step 1: Write failing benchmark-policy tests**

Create literal fixtures in `src/lib/benchmark/voice-classifier.test.ts` and
assert that the score:

```ts
expect(scoreVoiceClassifier(twoHundredPassingResults)).toMatchObject({
  validOutputs: 200,
  effectiveCorrect: 200,
  protectedFalseVoice: 0,
  passed: true,
});
```

Then mutate one condition at a time and assert `passed: false` for 198 valid
outputs, one effective text case classified as voice, one protected false-voice
decision, and p95 of 601 ms.

- [ ] **Step 2: Run the benchmark-policy test and verify RED**

Run: `bunx vitest run src/lib/benchmark/voice-classifier.test.ts`

Expected: FAIL because the benchmark module and scoring function do not exist.

- [ ] **Step 3: Implement the pure scoring module**

Create `src/lib/benchmark/voice-classifier.ts` with closed result types,
nearest-rank percentile calculation, and this exact gate:

```ts
const passed =
  validOutputs >= Math.ceil(total * 0.995) &&
  effectiveCorrect === total &&
  protectedFalseVoice === 0 &&
  latencyMs.p95 !== null &&
  latencyMs.p95 <= 600;
```

Count raw category correctness separately from effective correctness after a
deterministic hint overrides the model proposal.

- [ ] **Step 4: Run the benchmark-policy test and verify GREEN**

Run: `bunx vitest run src/lib/benchmark/voice-classifier.test.ts`

Expected: PASS.

- [ ] **Step 5: Extract the shared schema and prompt variants**

Move the existing Zod schema and baseline prompt into
`src/lib/voice/suitability-prompt.ts`. Variant A must add this conservative
hierarchy without changing the output schema:

```text
Choose TEXT_REQUIRED for content that must be seen precisely.
Choose TEXT_PREFERRED for link-only, short factual, coordination, time, date,
score, or status answers.
Choose VOICE_STRONG only when emotional tone materially helps.
Choose VOICE_NATURAL only for reflective coaching, storytelling, or a genuinely
conversational explanation.
When uncertain whether audio adds material value, choose TEXT_PREFERRED.
```

Include two compact counterexamples: a time question and a link-only request,
both mapping to `TEXT_PREFERRED`. Variant B contains the same hierarchy but
removes examples and places the conservative default first.

- [ ] **Step 6: Update production and harness consumers**

Make `src/lib/voice/suitability.ts` use the shared schema and prompt builder.
Gemini uses `baseline`; Nemotron uses the selected candidate variant. Replace
the generic routing helper with
`getOpenRouterProviderOptionsForClassifier(DEFAULT_SUITABILITY_MODEL)` so
reasoning is explicitly disabled for Nemotron.

Update `scripts/benchmark-voice-classifier.ts` to:

- accept `--nemotron-variant a|b`;
- use the shared schema and prompt builder;
- use classifier provider options for every model;
- always record the raw model result;
- compute the effective category using the deterministic hint;
- print the pure score and gate outcome.

- [ ] **Step 7: Run focused static verification**

Run:

```bash
bunx vitest run src/lib/benchmark/voice-classifier.test.ts src/lib/voice/preflight.test.ts
bunx biome check src/lib/benchmark/voice-classifier.ts src/lib/benchmark/voice-classifier.test.ts src/lib/voice/suitability-prompt.ts src/lib/voice/suitability.ts scripts/benchmark-voice-classifier.ts
```

Expected: PASS with no Biome findings.

- [ ] **Step 8: Commit the truthful harness**

```bash
git add scripts/benchmark-voice-classifier.ts src/lib/benchmark/voice-classifier.ts src/lib/benchmark/voice-classifier.test.ts src/lib/voice/suitability-prompt.ts src/lib/voice/suitability.ts src/lib/voice/preflight.test.ts
git commit -m "test(voice): gate Nemotron classifier candidates"
```

### Task 3: Run the two-variant live gate

**Files:**
- Modify: `docs/benchmarks/voice-classifier-selection-2026-07-12.md`

**Interfaces:**
- Consumes: the live benchmark JSON emitted by `scripts/benchmark-voice-classifier.ts`.
- Produces: a dated evidence section recording every attempted variant and the final runtime decision.

- [ ] **Step 1: Run Variant A smoke**

Run:

```bash
bun --env-file=.env.local scripts/benchmark-voice-classifier.ts \
  --models google/gemini-2.5-flash-lite,nvidia/nemotron-3.5-lightning \
  --nemotron-variant a --runs 8 --timeout-ms 1500
```

Expected advancement gate: Nemotron 8/8 valid, 8/8 effective correct, zero
protected false voice, and p95 at or below 600 ms.

- [ ] **Step 2: Run Variant B only if Variant A smoke fails**

Run the same command with `--nemotron-variant b`. If Variant B also fails,
stop live model calls, retain Gemini, and proceed to Step 4.

- [ ] **Step 3: Run the 200-request confirmation only for a passing smoke variant**

If Variant A passed, run:

```bash
bun --env-file=.env.local scripts/benchmark-voice-classifier.ts \
  --models google/gemini-2.5-flash-lite,nvidia/nemotron-3.5-lightning \
  --nemotron-variant a --runs 200 --timeout-ms 1500
```

If Variant B was required and passed instead, run:

```bash
bun --env-file=.env.local scripts/benchmark-voice-classifier.ts \
  --models google/gemini-2.5-flash-lite,nvidia/nemotron-3.5-lightning \
  --nemotron-variant b --runs 200 --timeout-ms 1500
```

Expected: the emitted Nemotron score has `passed: true`. A failed full gate
retains Gemini even if the smoke passed.

- [ ] **Step 4: Document the measured decision**

Append the date, variant definitions, sample count, valid outputs, raw and
effective accuracy, protected false voice, p50/p95/p99, provider, errors, and
the resulting keep/switch decision. Do not characterize a smoke run as a full
benchmark.

- [ ] **Step 5: Commit benchmark evidence**

```bash
git add docs/benchmarks/voice-classifier-selection-2026-07-12.md
git commit -m "docs(voice): record Nemotron classifier trial"
```

### Task 4: Apply the conditional runtime decision and verify

**Files:**
- Modify if Nemotron passes: `src/lib/voice/suitability.ts`
- Modify if Nemotron passes: `src/lib/voice/preflight.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: either a Nemotron runtime default with its proven variant, or an unchanged Gemini runtime default with documented rejection evidence.

- [ ] **Step 1: If and only if Nemotron passed, write the failing default-model test**

Change the existing preflight expectation to
`nvidia/nemotron-3.5-lightning`, assert the classifier-specific DeepInfra
options and reasoning disabled, and run:

```bash
bunx vitest run src/lib/voice/preflight.test.ts
```

Expected: FAIL because production still selects Gemini.

- [ ] **Step 2: If and only if Nemotron passed, switch the default**

Change only the fallback value of `DEFAULT_SUITABILITY_MODEL` to
`nvidia/nemotron-3.5-lightning`; preserve both explicit environment overrides.
Run the focused test again and expect PASS.

- [ ] **Step 3: Update the changelog with the truthful outcome**

If Nemotron passed, record the bounded default switch and benchmark gate. If it
failed, record the deterministic voice safeguards and that Gemini remains the
classifier after the bounded trial.

- [ ] **Step 4: Run fresh verification**

Run:

```bash
bun run typecheck
bun run test
bunx biome check scripts/benchmark-voice-classifier.ts src/lib/benchmark/voice-classifier.ts src/lib/benchmark/voice-classifier.test.ts src/lib/voice/suitability-prompt.ts src/lib/voice/suitability.ts src/lib/voice/preflight.test.ts
git diff --check
```

Then run `bun run lint`; if it fails only on the known unrelated
`.impeccable/hook.cache.json`, `communication-style.ts`, or `light-prompt.ts`,
report that exact boundary and do not modify those files.

- [ ] **Step 5: Create the final scoped commit**

Stage only files owned by this plan. Use
`feat(voice): adopt Nemotron suitability classification` when the gate passes,
or `fix(voice): harden automatic delivery classification` when Gemini remains.
