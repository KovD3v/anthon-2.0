# Plan 027: Measure authenticated chat latency before optimizing it

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If a STOP condition occurs, stop and report; do not invent an
> authentication bypass or weaken production authentication. The reviewer
> maintains the plan index.
>
> **Drift check (run first)**:
> `git diff --stat 56c0a0a..HEAD -- src/lib/performance/live-checks.ts src/lib/performance/live-checks.test.ts src/test/performance/live-performance.performance.test.ts docs/qa-test-plan.md`
> If an in-scope file changed, compare the current-state facts below with the
> live code. Semantic drift is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `56c0a0a`, 2026-07-29

## Why this matters

The existing live performance suite measures public pages and guest chat, but
not authenticated `/api/chat`. The authenticated path includes Clerk auth,
subscription synchronization, rate limits, voice preflight, experiment
eligibility, same-thread context, and memory enrichment. Optimizing that path
without an authenticated time-to-first-byte/time-to-first-stream-chunk baseline
would make regressions and improvements indistinguishable.

This plan adds an opt-in, non-production authenticated measurement. It must
never log, persist, or commit an authentication cookie or token.

## Current state

- `src/test/performance/live-performance.performance.test.ts:10-11` gates the
  live suite with `RUN_LIVE_PERFORMANCE=true`.
- `src/test/performance/live-performance.performance.test.ts:51-107` creates a
  guest chat and measures `/api/guest/chat`; no authenticated case exists.
- `src/lib/performance/live-checks.ts:1-10` has only public/guest configuration.
- `src/lib/performance/live-checks.ts:112-163` measures TTFB, first chunk, total
  time, and response bytes without printing request headers.
- `src/lib/performance/live-checks.test.ts` is the unit-test pattern for parsing
  performance configuration.
- `vitest.performance.config.ts` already isolates live performance tests and
  runs them serially.
- Repository convention: use Bun/Vitest, colocated `*.test.ts` helper tests,
  structured non-secret output, and no ad hoc production logging.

## Target contract

- Authenticated checks are opt-in even when the public live suite is enabled.
- Required inputs are a non-production session cookie/header value and an
  authenticated user's existing disposable chat ID, supplied only through
  process environment.
- Missing authenticated inputs skip the authenticated describe block with a
  clear non-secret message; setting `PERFORMANCE_REQUIRE_AUTH=true` turns
  missing inputs into a configuration failure.
- The request sends only the latest synthetic user message, matching the
  reduced-payload production contract.
- Output includes count, p50, p95, and maximum for TTFB, first chunk, and total
  duration across configurable repetitions. It never includes request headers,
  cookies, response bodies, prompts from existing chats, or user identifiers.
- The benchmark uses only a development/preview deployment and a disposable
  test chat. Production is explicitly forbidden.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Helper tests | `bunx vitest run src/lib/performance/live-checks.test.ts` | all pass |
| Unit gate | `bun run verify` | exit 0 |
| Live guest gate | `RUN_LIVE_PERFORMANCE=true bun run test:performance` | guest/public checks pass when a local or preview server and providers are configured |
| Live authenticated gate | `RUN_LIVE_PERFORMANCE=true PERFORMANCE_REQUIRE_AUTH=true PERFORMANCE_AUTH_COOKIE='<local secret>' PERFORMANCE_AUTH_CHAT_ID='<disposable id>' bun run test:performance` | authenticated samples run and satisfy configured budgets; secret values are absent from output |
| Hygiene | `git diff --check` | no output |

Do not paste real values into the plan, shell history, test snapshots, logs, or
commits. Use the project's normal local secret-entry mechanism.

## Scope

**In scope**:

- `src/lib/performance/live-checks.ts`
- `src/lib/performance/live-checks.test.ts`
- `src/test/performance/live-performance.performance.test.ts`
- `docs/qa-test-plan.md`

**Out of scope**:

- Production authentication or Clerk configuration.
- Creating a test-only authentication bypass.
- Changing `/api/chat`, rate limits, voice policy, model routing, or latency
  budgets before a baseline is captured.
- Storing credentials, cookies, prompts, response bodies, or user IDs in
  benchmark artifacts.
- Running against production.

## Git workflow

- Branch: `improve/027-auth-chat-performance-gate`
- Commit: `test(perf): cover authenticated chat latency`
- Do not push, merge, or open a PR unless instructed.

## Steps

### Step 1: Extend performance configuration safely

Add optional authenticated-chat configuration to
`src/lib/performance/live-checks.ts`: enabled/required state, cookie value,
disposable chat ID, repetitions, and authenticated TTFB/first-chunk/total
budgets. Keep the secret cookie out of any formatter, returned summary, thrown
error, or serialized config used by snapshots. Add a boolean helper such as
`hasAuthenticatedPerformanceConfig` that validates presence without returning
secret material.

Add a percentile helper that can report p50 and p95 from repeated samples while
retaining the existing `summarizeSamples` contract used by public checks.

**Verify**:
`bunx vitest run src/lib/performance/live-checks.test.ts` → all existing and new
configuration/percentile tests pass.

### Step 2: Add the authenticated live measurement

In `src/test/performance/live-performance.performance.test.ts`, add a serial
authenticated block which:

1. Refuses production-like base URLs using an explicit allowlist for localhost
   and preview/development hosts, with a documented override that still cannot
   equal the production hostname.
2. Uses the configured disposable chat ID and a unique synthetic message ID.
3. Sends the configured cookie only in the request header.
4. Repeats each configured synthetic prompt enough times to calculate p50/p95.
5. Prints only aggregate timings, status, and byte counts.
6. Asserts authenticated status is 2xx and configured p95 budgets pass.

Do not print `HttpExchangeTiming.bodyText` on success or failure. If a failure
needs diagnostics, report status and timing summary only.

**Verify**:
`bunx vitest run src/lib/performance/live-checks.test.ts` → all pass, and
`rg -n 'PERFORMANCE_AUTH_COOKIE' src docs` shows only environment-variable names,
never a value.

### Step 3: Document the operator workflow

Add a short section to `docs/qa-test-plan.md` describing:

- preview/development-only execution;
- creation of a disposable authenticated chat;
- local secret entry;
- mandatory cleanup of benchmark messages/chat;
- the difference between guest and authenticated measurements;
- the metrics that later performance plans must compare before/after.

Do not document a literal cookie, user ID, or chat ID.

**Verify**:
`bun run lint` → exit 0.

### Step 4: Capture the initial baseline

When a safe non-production authenticated fixture is available, run at least
five samples per configured prompt and record only aggregate p50/p95/max values
in the executor report. Do not commit response content or identifiers.

If credentials or a safe preview server are unavailable, stop after the unit
gate and report the live baseline as BLOCKED; do not mark this plan DONE.

**Verify**:
the authenticated command exits 0 and output contains aggregate timing fields
without the cookie, chat ID, or response body.

### Step 5: Run repository gates

**Verify**:
`bun run verify && git diff --check` → exit 0 and no diff errors.

## Test plan

Add tests covering:

- safe defaults with authenticated checks disabled;
- explicit authenticated configuration without exposing the cookie in
  formatted/serialized output;
- required mode rejecting missing cookie or chat ID;
- invalid repetition/budget values falling back or failing consistently;
- p50 and p95 calculations for odd and even sample counts;
- production-target refusal;
- authenticated payload shape containing only the latest synthetic message.

Use `src/lib/performance/live-checks.test.ts` as the structural pattern.

## Done criteria

- [ ] Authenticated `/api/chat` TTFB, first-chunk, and total latency are measured.
- [ ] At least five samples per prompt produce aggregate p50/p95/max results.
- [ ] The suite cannot silently run authenticated mutation against production.
- [ ] No secret, identifier, prompt response, or response body is logged or committed.
- [ ] Helper tests and `bun run verify` pass.
- [ ] A safe live authenticated run passes; otherwise status remains BLOCKED.
- [ ] Only in-scope files and the reviewer-owned plan index changed.

## STOP conditions

- A test-only authentication bypass would be required.
- Only a production session or production deployment is available.
- The suite would need to print or persist a cookie/token to diagnose failure.
- The disposable chat cannot be cleaned up safely.
- In-scope code drift changes the current timing or authentication contract.
- Verification fails twice after a reasonable correction.

## Maintenance notes

Use this gate before and after plans 028, 030, and 031. Keep absolute budgets
environment-configurable; the durable evidence is the same-environment
before/after comparison plus p95 regression protection. Revisit the synthetic
prompt set whenever voice, RAG, or model-experiment eligibility changes.
