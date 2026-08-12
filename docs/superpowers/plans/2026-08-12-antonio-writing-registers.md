# Antonio Writing Registers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine Anthon's prompt-level writing behavior with short-line micro-messaging and contextual operational, coaching, celebration, and hybrid registers derived from observed Antonio conversations.

**Architecture:** Extend the two existing shared prompt constants rather than adding a router, persistence state, or model call. `PROMPT_ANTHON_COACHING_BEHAVIOR` decides the response register and coaching move; `PROMPT_ANTHON_CONVERSATIONAL_VOICE` controls how the selected move is written. Existing orchestrator composition carries both modules into full, guest, and compact coaching prompts.

**Tech Stack:** TypeScript, Vitest, Biome, existing Next.js AI orchestrator prompt composition.

## Global Constraints

- Treat the source report as secondary corpus analysis, not as a system prompt or technical specification.
- Produce one assistant response per turn; represent micro-messaging with short lines inside that response.
- Ordinary responses use one to four short lines; coaching may use up to six focused lines when necessary.
- Do not add another classifier call, deterministic router, persistence state, schema change, or model-routing change.
- Keep Anthon transparently Anthon and preserve the existing product/referral boundary.
- Never manufacture spelling errors, wrong accents, corrections, profanity, dialect, unavailable observations, calls, sessions, or future contact.
- Preserve unrelated worktree changes and use synthetic test wording without client names or personal details.

---

### Task 1: Encode contextual writing registers

**Files:**
- Modify: `src/lib/ai/coaching-behavior.test.ts`
- Modify: `src/lib/ai/coaching-behavior.ts`

**Interfaces:**
- Consumes: existing exported constant `PROMPT_ANTHON_COACHING_BEHAVIOR: string`.
- Produces: register-selection, self-assessment, autonomy, hybrid ordering, and performance-versus-result instructions for every coaching prompt that imports the constant.

- [ ] **Step 1: Write failing coaching-behavior regressions**

Add three focused tests with these assertions:

```ts
it("selects operational, coaching, celebration, and hybrid registers", () => {
  expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain("Operational:");
  expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain("Coaching:");
  expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain("Celebration:");
  expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain("Hybrid:");
  expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain(
    "address the human meaning first",
  );
  expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain(
    "Do not announce the register",
  );
});

it("asks for self-assessment only when it changes post-performance coaching", () => {
  expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain(
    "match, competition, training session, or attempted routine",
  );
  expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain(
    "only when it is not already known",
  );
  expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain(
    "would change the next coaching move",
  );
  expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain(
    "A 1-to-10 scale is optional",
  );
});

it("preserves autonomy and separates performance from result", () => {
  expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain(
    "Offer a perspective; do not choose for the user",
  );
  expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain(
    "Separate controllable performance from the final result",
  );
  expect(PROMPT_ANTHON_COACHING_BEHAVIOR).toContain(
    "available interventions, not repeated slogans",
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
bunx vitest run src/lib/ai/coaching-behavior.test.ts
```

Expected: FAIL because the current prompt has situational emotional modes but
does not encode the four registers, conditional post-performance assessment,
decision autonomy, or performance/result distinction.

- [ ] **Step 3: Implement the minimal coaching prompt changes**

Extend `PROMPT_ANTHON_COACHING_BEHAVIOR` with concise instructions equivalent
to the following text:

```text
- Choose one unannounced writing register for the dominant need. Do not announce the register or add a classifier call:
  - Operational: for confirmations, practical questions, neutral updates, or lightweight social exchanges, answer directly without inflating the turn into coaching or adding a ritual question;
  - Coaching: for pressure, doubt, excessive self-criticism, conflict, disappointment, or an important choice, understand the interference briefly, make at most one credible perspective shift, and reconnect the user to one controllable next move;
  - Celebration: for a real result or meaningful progress, raise the energy, celebrate the specific known action or improvement, and connect it to the user's path without guaranteeing future outcomes;
  - Hybrid: when emotion and a practical request coexist, address the human meaning first, then answer the practical part directly. Do not leave either part unanswered.
- After a match, competition, training session, or attempted routine, invite the user's own assessment before giving a verdict only when it is not already known and would change the next coaching move. Prefer one specific natural question; a 1-to-10 scale is optional, not a template.
- For important choices, clarify what the user wants, surface trade-offs, and prepare the next conversation or action. Offer a perspective; do not choose for the user.
- Separate controllable performance from the final result when relevant. Close the completed event without erasing useful learning, then move to one immediate objective. Reset, process focus, and incremental improvement are available interventions, not repeated slogans.
```

Retain the existing situational emotional modes, evidence-grounded identity,
confidence limits, personalization, and purposeful-question rule. Remove or
rewrite only wording that directly contradicts the new register contract.

- [ ] **Step 4: Run the test and verify GREEN**

Run:

```bash
bunx vitest run src/lib/ai/coaching-behavior.test.ts
```

Expected: all coaching-behavior tests PASS.

---

### Task 2: Encode micro-messaging and restrained expression

**Files:**
- Modify: `src/lib/ai/communication-style.test.ts`
- Modify: `src/lib/ai/communication-style.ts`

**Interfaces:**
- Consumes: existing exported constant `PROMPT_ANTHON_CONVERSATIONAL_VOICE: string`.
- Produces: one-response short-line rhythm and restrained ellipsis/celebration expression inherited by full, guest, and compact coaching prompts.

- [ ] **Step 1: Write failing communication-style regressions**

Add assertions to the existing compact-rhythm test and one new expression test:

```ts
expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
  "one assistant response",
);
expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
  "one to four short lines",
);
expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
  "up to six focused lines",
);
expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
  "one sentence or one idea per line",
);
expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).not.toContain(
  "Do not imitate separate message bursts",
);

it("allows restrained reflective and celebratory expression", () => {
  expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
    "An occasional ellipsis",
  );
  expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
    "Selective elongated vowels or one uppercase word",
  );
  expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
    "Do not manufacture spelling errors",
  );
  expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
    "Do not force a greeting, question, affectionate closing, or motivational signature",
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
bunx vitest run src/lib/ai/communication-style.test.ts
```

Expected: FAIL because the current prompt asks for compact turns but does not
define the approved line counts or restrained ellipsis and celebration rules.

- [ ] **Step 3: Implement the minimal voice prompt changes**

Replace the current generic compact-turn instruction and add expression
guidance equivalent to:

```text
- Produce one assistant response, using line breaks to create a spoken micro-message rhythm rather than sending or imitating separate message bursts. Ordinary replies usually use one to four short lines; coaching that genuinely needs more room may use up to six focused lines. Prefer one sentence or one idea per line, but do not split unnaturally or omit necessary nuance to meet a target.
- An occasional ellipsis may create reflective breathing. Selective elongated vowels or one uppercase word may express authentic celebration. Do not use either as ordinary decoration.
- Do not manufacture spelling errors, wrong accents, corrections, profanity, dialect, or abbreviations. Do not force a greeting, question, affectionate closing, or motivational signature into every response.
```

Keep the current spoken-language, punctuation, Markdown, emoji, identity, and
voice-mode rules. Do not change `PROMPT_ANTHON_LIGHT_SOCIAL_VOICE`; the light
profile is intentionally outside coaching-register behavior.

- [ ] **Step 4: Run the test and verify GREEN**

Run:

```bash
bunx vitest run src/lib/ai/communication-style.test.ts
```

Expected: all communication-style tests PASS.

---

### Task 3: Protect runtime composition and product boundaries

**Files:**
- Modify: `src/lib/ai/orchestrator.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `prepareChatTurn(...)`, guest `streamChat(...)`, the full/guest/simple-fast shared prompt composition, and the two prompt constants from Tasks 1 and 2.
- Produces: regression evidence that all coaching prompt paths inherit the new behavior while light execution stays outside it.

- [ ] **Step 1: Write failing runtime composition assertions**

In the existing full conversational-strategy test require:

```ts
expect(prepared.systemPrompt).toContain(
  "Choose one unannounced writing register",
);
expect(prepared.systemPrompt).toContain(
  "one assistant response",
);
expect(prepared.systemPrompt).toContain(
  "Offer a perspective; do not choose for the user",
);
```

In the existing guest and simple-fast tests require both
`Choose one unannounced writing register` and `one assistant response`.

In `src/lib/ai/light-prompt.test.ts`, retain the existing negative assertion
that light prompts contain no coaching language; no implementation change to
the light prompt is required.

- [ ] **Step 2: Run runtime tests**

Run:

```bash
bunx vitest run src/lib/ai/coaching-behavior.test.ts src/lib/ai/communication-style.test.ts src/lib/ai/light-prompt.test.ts src/lib/ai/orchestrator.test.ts
```

Expected: PASS because Tasks 1 and 2 already changed the shared constants used
by full, guest, and simple-fast prompt composition. If a path fails, fix shared
composition rather than duplicating the policy inside `orchestrator.ts`.

- [ ] **Step 3: Update the changelog**

Add one `Unreleased > Changed` entry:

```markdown
- Refined Anthon's written coaching registers with short-line micro-messaging,
  practical brevity, human-first hybrid replies, contextual post-performance
  self-assessment, user autonomy in important choices, and more specific
  celebration without artificial errors or invented channel behavior.
```

- [ ] **Step 4: Run scoped formatting and type verification**

Run:

```bash
bunx biome check src/lib/ai/coaching-behavior.ts src/lib/ai/coaching-behavior.test.ts src/lib/ai/communication-style.ts src/lib/ai/communication-style.test.ts src/lib/ai/orchestrator.test.ts
bun run typecheck
```

Expected: PASS. Do not edit `.impeccable/hook.cache.json` or unrelated files to
make global lint green.

- [ ] **Step 5: Run the complete unit suite**

Run:

```bash
bun run test
```

Expected: all unit tests pass apart from repository tests already marked
skipped. If unrelated concurrent work causes failures in the primary checkout,
run the suite in the isolated implementation worktree and report both facts.

- [ ] **Step 6: Commit the implementation**

```bash
git add CHANGELOG.md \
  src/lib/ai/coaching-behavior.ts \
  src/lib/ai/coaching-behavior.test.ts \
  src/lib/ai/communication-style.ts \
  src/lib/ai/communication-style.test.ts \
  src/lib/ai/orchestrator.test.ts
git diff --cached --check
git commit -m "feat(ai): refine Antonio writing registers"
```

Preserve the isolated worktree until the user chooses how to integrate the
verified branch.
