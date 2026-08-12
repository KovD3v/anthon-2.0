# Contextual Emoji Intensity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Anthon a selective but perceptible emoji presence, calibrated around one response in six to eight, with emotionally matched clusters instead of a one-emoji hard cap.

**Architecture:** Keep emoji policy in the existing shared communication-style constants so full, guest, compact, and light social prompts inherit one consistent behavior. Do not add counters, randomness, persistence, schema changes, or model-routing logic; the model selects emoji from conversational context and recent history.

**Tech Stack:** TypeScript, Vitest, Biome, existing Next.js AI orchestrator prompt composition.

## Global Constraints

- Ordinary, sober, explanatory, and operational turns use no emoji.
- Contextually marked turns may use two or three emoji; longer clusters are exceptional.
- The semantic palette is `💪🏻`, `❤️`, `💥`, `🔥`, `🎯`, `🤣`, and `😂`.
- One response in six to eight is a calibration target, never a random per-message quota.
- Consecutive emoji-bearing replies are allowed only while the same emotional moment continues.
- Decorative headings, emoji-led lists, random variety, and a mandatory closing signature remain prohibited.
- Preserve unrelated worktree changes and stage only task-owned hunks.

---

### Task 1: Replace the restrictive emoji policy with contextual intensity

**Files:**
- Modify: `src/lib/ai/communication-style.test.ts`
- Modify: `src/lib/ai/communication-style.ts`
- Modify: `src/lib/ai/orchestrator.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `PROMPT_ANTHON_CONVERSATIONAL_VOICE` and `PROMPT_ANTHON_LIGHT_SOCIAL_VOICE` string constants.
- Produces: shared prompt instructions inherited by full, guest, compact, and light social execution paths.

- [ ] **Step 1: Write failing communication-style regressions**

Add assertions that require the new policy and reject the old hard limits:

```ts
expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
  "selective but perceptible",
);
expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
  "two or three emoji",
);
expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
  "💪🏻, ❤️, 💥, 🔥, 🎯, 🤣, or 😂",
);
expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).toContain(
  "one response in six to eight",
);
expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).not.toContain(
  "use at most one appropriate emoji",
);
expect(PROMPT_ANTHON_CONVERSATIONAL_VOICE).not.toContain(
  "do not use emoji in consecutive assistant replies",
);
```

Update the light-social regression to require contextual emoji use and allow a
short cluster instead of requiring `Default to no emoji`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
bunx vitest run src/lib/ai/communication-style.test.ts src/lib/ai/light-prompt.test.ts
```

Expected: FAIL because the current prompt says emoji are exceptional, caps them
at one, forbids consecutive assistant replies, and defaults the light prompt to
no emoji.

- [ ] **Step 3: Implement the minimal shared prompt change**

Replace the current emoji paragraph in `PROMPT_ANTHON_CONVERSATIONAL_VOICE`
with instructions equivalent to:

```text
Emoji are selective but perceptible, never decorative. Ordinary or sober turns
usually need none. When encouragement, affection, achievement, intensity,
focus, or genuine playfulness is present, choose the matching family: 💪🏻, ❤️,
💥, 🔥, 🎯, 🤣, or 😂. In a marked moment, two or three emoji are natural and
may repeat; reserve longer clusters for exceptional celebrations. Treat one
response in six to eight as a conversational calibration target, never a random
quota. Consecutive emoji-bearing replies are acceptable only while the same
emotional moment continues. Never create emoji-led lists or a mandatory closing
signature.
```

Change `PROMPT_ANTHON_LIGHT_SOCIAL_VOICE` so lightweight warmth or genuine
playfulness may use a short contextual cluster, without making emoji mandatory.

- [ ] **Step 4: Update runtime-path and changelog expectations**

In the authenticated and guest prompt assertions, require the new
`selective but perceptible` policy and remove expectations for `Emoji are
exceptional`. Add one `CHANGELOG.md` Changed entry describing selective,
emotionally matched clusters and the removal of the one-emoji hard cap.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
bunx vitest run src/lib/ai/communication-style.test.ts src/lib/ai/light-prompt.test.ts src/lib/ai/orchestrator.test.ts
```

Expected: PASS for communication-style, light prompt, full orchestrator, and
guest prompt coverage.

- [ ] **Step 6: Run scoped formatting and type verification**

Run:

```bash
bunx biome check src/lib/ai/communication-style.ts src/lib/ai/communication-style.test.ts src/lib/ai/light-prompt.test.ts src/lib/ai/orchestrator.test.ts
bun run typecheck
```

Expected: PASS. Do not modify `.impeccable/hook.cache.json` or unrelated local
formatting changes merely to make global lint green.

- [ ] **Step 7: Run the complete unit suite**

Run:

```bash
bun run test
```

Expected: all unit tests pass, apart from tests already explicitly skipped by
the repository.

- [ ] **Step 8: Commit only owned changes**

Stage task-owned files and only task-owned hunks from files that were already
modified:

```bash
git add CHANGELOG.md src/lib/ai/communication-style.test.ts
git add -p src/lib/ai/communication-style.ts src/lib/ai/orchestrator.test.ts
git commit -m "feat(ai): increase contextual emoji expression"
```

- [ ] **Step 9: Publish and verify Production**

After confirming the exact `origin/main..HEAD` range, push `main`, wait for the
Git-triggered Vercel Production deployment to reach `READY`, and verify `/` and
`/chat` return HTTP 200. Report the published commit and preserve all unrelated
unstaged changes.
