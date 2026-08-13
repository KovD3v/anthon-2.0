# AI Usage Reservation Latency Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the healthy-path `usage_reservation` / “Prenotazione utilizzo” latency from roughly 300 ms to at most 180 ms median, with at least a 40% same-region improvement, without weakening quota enforcement, concurrency serialization, retry recovery, or usage accounting.

**Architecture:** Keep the existing per-user PostgreSQL row lock as the concurrency boundary. Replace the current sequence of reservation reads and writes with one SQL decision-and-upsert statement after that lock, so the healthy path performs two application queries inside one transaction. Move global expiry and retention work out of the request path and into the existing daily retention cron. Keep recovered-response hydration as a rare-path query and preserve every existing public result shape.

**Tech Stack:** TypeScript 5.9, Prisma 7.9, PostgreSQL/Neon, Next.js 16.3 route handlers, Vitest 4, Bun, existing response-profiler telemetry.

## Measured baseline and acceptance gates

- The Development trace measured `usage_reservation` at 296 ms while `rate_limit_check` was 85 ms and `database_connect` was 0 ms.
- A same-database probe measured a median round-trip near 27 ms; an 11-round-trip read-only transaction measured about 285 ms. The primary cost is serialized network round-trips, not query execution or lock waiting.
- The current request path runs the user lock, three cleanup writes, existing-reservation lookup, daily-usage lookup, active-reservation aggregate, reservation create/update, and transaction begin/commit.
- The optimized healthy path must execute exactly two application SQL statements inside the transaction: one `User ... FOR UPDATE` lock and one decision-and-upsert statement.
- In a same-region, warm comparison using at least 20 fresh request keys, the optimized span must satisfy both: median at most 180 ms and median reduction at least 40% from the immediately preceding baseline run.
- P95 must be reported separately and must not exceed 250 ms in the same test conditions. Lock-contention samples are reported separately from uncontended samples.
- Functional gates are hard requirements: no double reservation on finite plans, no double accounting, live duplicate keys remain retryable, expired duplicate keys can reserve immediately, and reconciled responses still recover idempotently.

## Scope boundaries

- Do not change deployment region, database region, connection configuration, or the region metrics the owner is handling separately.
- Do not change `MessageMetrics`, the technical-details UI, plan limits, public error strings, lease duration, recovery retention, or terminal retention.
- Do not remove the per-user lock or replace it with process-local synchronization.
- Do not add a Prisma schema migration; the current unique and composite indexes are sufficient.
- Do not turn the latency target into a flaky CI timing assertion. CI verifies behavior and statement count; live traces verify wall-clock latency.
- Preserve unrelated work and commit only the files listed by each task.

---

### Task 1: Characterize reservation invariants with a real database

**Files:**
- Create: `src/lib/rate-limit/reservations.integration.test.ts`
- Reference: `src/lib/rate-limit/reservations.ts`
- Reference: `scripts/run-ephemeral-integration-tests.ts`

**Interfaces:**
- Consumes: `reserveAiUsage({ userId, requestKey, limits })` and the generated Prisma client.
- Produces: real-PostgreSQL regression coverage for serialization, idempotency, stale leases, and limit denial.

- [ ] **Step 1: Add isolated integration fixtures**

Create a real user for each test with a unique Clerk identifier and delete it in `afterEach`; rely on cascading relations for reservation and usage cleanup. Define one finite limit fixture with request, token, and cost caps and one infinite fixture using `Number.POSITIVE_INFINITY` for all four enforced limits.

- [ ] **Step 2: Write the finite-plan concurrency test**

Start two `reserveAiUsage` calls concurrently for the same user with different request keys. Assert exactly one result is allowed, the other is `{ allowed: false, reason: "Generation already in progress", retryable: true }`, and the database contains exactly one live `RESERVED` row.

- [ ] **Step 3: Write duplicate-key lease tests**

Cover both states using direct fixture inserts:

1. A `RESERVED` row whose `expiresAt` is in the future returns the existing retryable “already in progress” result and does not change its claim token.
2. A `RESERVED` row whose `expiresAt` is in the past is refreshed immediately, remains the same `(userId, requestKey)` row, receives a new claim token and lease, and returns `allowed: true`.

- [ ] **Step 4: Write reconciled retry tests**

Insert one `RECONCILED` row with valid `recoveryText` and sanitized `recoveryMetrics`; assert the response is recovered without creating a second row. Insert another reconciled row without recovery or persisted assistant; assert the existing non-retryable “Generation already accounted for” result.

- [ ] **Step 5: Write usage-boundary tests**

Seed `DailyUsage` at each individual limit and assert the exact existing denial reason. Add an infinite-plan test proving two distinct active request keys are allowed concurrently after lock serialization.

- [ ] **Step 6: Verify the characterization suite**

Run:

```bash
bun run test:integration -- src/lib/rate-limit/reservations.integration.test.ts
```

Expected before optimization: all cases pass. The expired duplicate-key case currently succeeds because hot-path cleanup first converts the row to `EXPIRED`; retain it as the invariant that must survive cleanup removal.

- [ ] **Step 7: Freeze the new-region baseline before changing code**

After one warm-up, collect at least 20 sequential fresh-key `usage_reservation` samples from the current deployment/database pairing. Record deployment identity, function region, database target identity, sample count, P50, P90, P95, minimum, maximum, and failures. Exclude intentionally concurrent requests. This is the only baseline used for the Task 4 percentage comparison; keep the earlier 296 ms trace as diagnostic history, not as the new-region control.

- [ ] **Step 8: Commit**

```bash
git add -- src/lib/rate-limit/reservations.integration.test.ts
git commit -m 'test(rate-limit): characterize usage reservation invariants'
```

---

### Task 2: Move reservation retention out of the request path

**Files:**
- Create: `src/lib/rate-limit/reservation-retention.ts`
- Create: `src/lib/rate-limit/reservation-retention.test.ts`
- Modify: `src/lib/rate-limit/reservations.ts`
- Create: `src/app/api/cron/cleanup-ai-traces/route.test.ts`
- Modify: `src/app/api/cron/cleanup-ai-traces/route.ts`
- Modify: `docs/maintenance.md`
- Modify: `docs/api.md`

**Interfaces:**
- Produces: `cleanupExpiredAiUsageReservations(now?: Date): Promise<{ expired: number; recoveryCleared: number; deleted: number }>`.
- Extends: the authenticated AI-retention cron response while retaining its existing `deleted` trace count.
- Preserves: a live request ignores expired reservations even if the daily cron has not run.

- [ ] **Step 1: Write failing retention unit tests**

Mock the top-level Prisma client and assert the new function performs these three global operations in order:

1. Change expired `RESERVED` rows to `EXPIRED` and set `releasedAt` to `now`.
2. Clear `recoveryText`, `recoveryMetrics`, and `recoveryExpiresAt` on `RECONCILED` rows whose recovery lease expired.
3. Delete `RECONCILED`, `RELEASED`, and `EXPIRED` rows with no recovery payload and `updatedAt` older than 30 days.

Assert the returned count object maps each Prisma mutation count to `expired`, `recoveryCleared`, and `deleted`.

- [ ] **Step 2: Implement the retention service**

Move `TERMINAL_RESERVATION_RETENTION_MS` and the three cleanup mutations from `reservations.ts` into `reservation-retention.ts`. Keep `Prisma.DbNull` for clearing JSON. Make the cleanup global rather than user-scoped because it now runs once per cron invocation.

- [ ] **Step 3: Write failing cron route tests**

Mock `deleteExpiredAiTurnTraces` and `cleanupExpiredAiUsageReservations`. Verify:

- missing or incorrect `CRON_SECRET` returns 401 and calls neither cleanup;
- an authorized request invokes both cleanups and returns `{ success: true, deleted: <traceCount>, usageReservations: <countObject> }`;
- a cleanup failure returns 500 without exposing the thrown error.

- [ ] **Step 4: Extend the existing cron route**

Call both retention functions in `POST`; keep `GET` delegating to `POST`. Preserve the `deleted` property for existing consumers and add `usageReservations`. Update the structured maintenance log with both count groups. Do not add a second cron schedule.

- [ ] **Step 5: Remove hot-path cleanup**

Delete `cleanupAiReservations(tx, userId, now)` and its call from `reserveAiUsage`. Do not yet change the reservation decision queries in this task. Update the active-reservation predicate to include `expiresAt: { gt: now }`; this preserves correctness between daily cron runs and ensures stale rows no longer block unrelated keys.

- [ ] **Step 6: Update maintenance documentation**

Describe `/api/cron/cleanup-ai-traces` as AI retention cleanup: encrypted traces plus expired/recoverable usage reservations. Keep the unchanged `15 3 * * *` schedule in `docs/maintenance.md`; update both GET and POST descriptions in `docs/api.md`.

- [ ] **Step 7: Verify focused behavior**

Run:

```bash
bunx vitest run src/lib/rate-limit/reservation-retention.test.ts src/lib/rate-limit/reservations.test.ts src/app/api/cron/cleanup-ai-traces/route.test.ts
bun run test:integration -- src/lib/rate-limit/reservations.integration.test.ts
bunx biome check src/lib/rate-limit/reservation-retention.ts src/lib/rate-limit/reservation-retention.test.ts src/lib/rate-limit/reservations.ts src/app/api/cron/cleanup-ai-traces/route.ts src/app/api/cron/cleanup-ai-traces/route.test.ts docs/maintenance.md docs/api.md
```

Expected: all reservation invariants pass; the normal reservation unit test observes three fewer Prisma mutations.

- [ ] **Step 8: Commit**

```bash
git add -- src/lib/rate-limit/reservation-retention.ts src/lib/rate-limit/reservation-retention.test.ts src/lib/rate-limit/reservations.ts src/app/api/cron/cleanup-ai-traces/route.ts src/app/api/cron/cleanup-ai-traces/route.test.ts docs/maintenance.md docs/api.md
git commit -m 'perf(rate-limit): move reservation cleanup off request path'
```

---

### Task 3: Collapse quota decision and reservation write into one SQL statement

**Files:**
- Modify: `src/lib/rate-limit/reservations.test.ts`
- Modify: `src/lib/rate-limit/reservations.ts`
- Verify: `src/lib/rate-limit/reservations.integration.test.ts`

**Interfaces:**
- Adds private type `ReservationDecisionRow` with outcome, reservation identity, recovery payload, and persisted assistant identity.
- Adds private helper `decideAndReserveAiUsage(tx, input): Promise<ReservationDecisionRow>`.
- Preserves the exported `AiUsageReservationResult` union exactly.

- [ ] **Step 1: Rewrite healthy-path unit expectations first**

Replace mocks for `dailyUsage.findUnique`, reservation aggregate, create, and update on the reservation path with one decision-row result from `$queryRaw`. Assert a fresh successful reservation makes exactly two raw calls total: first the user lock, then the decision/upsert. Keep Prisma model mocks used by reconciliation and release functions.

Add decision mapping tests for all outcomes:

- `reserved` -> allowed identity;
- `in_progress` -> retryable existing reason;
- `request_limit`, `input_limit`, `output_limit`, `cost_limit` -> exact non-retryable public reasons;
- `recovered` with valid payload -> allowed recovery;
- `recovered` with malformed payload -> persisted-assistant fallback when present, otherwise accounted;
- `reconciled` with an assistant ID -> rare-path persisted-assistant hydration;
- `accounted` -> existing non-retryable accounted result.

- [ ] **Step 2: Define the SQL output contract**

Use this private shape, converting nullable SQL fields before returning the public union:

```ts
type ReservationDecisionOutcome =
  | "reserved"
  | "in_progress"
  | "request_limit"
  | "input_limit"
  | "output_limit"
  | "cost_limit"
  | "recovered"
  | "reconciled"
  | "accounted";

interface ReservationDecisionRow {
  outcome: ReservationDecisionOutcome;
  reservationId: string | null;
  claimToken: string | null;
  recoveryText: string | null;
  recoveryMetrics: Prisma.JsonValue | null;
  assistantMessageId: string | null;
}
```

Throw an internal error if the query returns anything other than exactly one row, or if `reserved`, `recovered`, or `reconciled` lacks reservation identity. Do not silently allow usage on malformed output.

- [ ] **Step 3: Implement one decision-and-upsert CTE**

After `lockUser`, execute one parameterized `Prisma.sql` statement with these CTEs:

1. `existing`: select the current `(userId, requestKey)` row, including status, expiry, claim token, recovery fields, and assistant message ID.
2. `usage_totals`: select today's `DailyUsage`, defaulting each counter to zero.
3. `active_totals`: aggregate only `RESERVED` rows for the same user/date whose `expiresAt > now`, excluding the current request key. Cast integer sums to `integer` and cost to `double precision` so Prisma does not return `bigint` for token counters.
4. `decision`: choose exactly one outcome in this precedence order:
   - existing `RECONCILED` with both recovery fields -> `recovered`;
   - existing `RECONCILED` with assistant ID -> `reconciled`;
   - existing `RECONCILED` without either -> `accounted`;
   - existing live `RESERVED` -> `in_progress`;
   - another live reservation and any finite budget -> `in_progress`;
   - effective usage at request, input, output, or cost limit -> the corresponding limit outcome, preserving current check order;
   - otherwise -> `reserved`.
5. `upserted`: only for `reserved`, insert the supplied random UUID row ID and claim token, or update the existing unique `(userId, requestKey)` row. Set a fresh ten-minute lease, clear all actual/recovery/reconciliation/release fields, reserve one request, and reserve each finite remaining token/cost allowance exactly as today. On conflict, retain the original row ID and `createdAt` while replacing the claim token and setting `updatedAt = now`.
6. Final select: return one row combining the decision with `upserted` identity for a fresh reservation or `existing` identity/payload for all idempotent outcomes.

Pass finite limits as nullable SQL parameters: `null` means unlimited. This avoids serializing infinite plans and prevents PostgreSQL from receiving JavaScript `Infinity`. Generate row ID and claim token with `randomUUID()` before the query. Use the function's captured `now` consistently for date, lease, and stale checks.

- [ ] **Step 4: Keep persisted-assistant hydration off the healthy path**

Only when the SQL outcome is `reconciled` with `assistantMessageId`, or a `recovered` payload fails `parseRecovery` and has an assistant ID, issue the existing Prisma lookup with message metrics and map it through `textFromMessageParts`. A malformed recovered payload without an assistant maps to the existing accounted result. Never include `Message` or `MessageMetrics` joins in the normal decision query.

- [ ] **Step 5: Remove superseded helpers and model calls**

Delete `finiteRemaining`, `finiteRemainingCost`, `getLimitReason`, and the old sequential existing/usage/aggregate/create-update branch once no longer referenced. Narrow `TransactionClient` only as far as reconciliation and rare recovery still require; do not disturb reconcile/release transaction behavior.

- [ ] **Step 6: Verify unit and real-database semantics**

Run:

```bash
bunx vitest run src/lib/rate-limit/reservations.test.ts src/lib/rate-limit/reservation-retention.test.ts
bun run test:integration -- src/lib/rate-limit/reservations.integration.test.ts src/lib/model-experiments/service.integration.test.ts
bunx biome check src/lib/rate-limit/reservations.ts src/lib/rate-limit/reservations.test.ts src/lib/rate-limit/reservations.integration.test.ts
```

Expected: all public outcomes remain unchanged, finite concurrency still permits exactly one reservation, expired same-key retry succeeds, and the healthy-path unit test proves two application statements.

- [ ] **Step 7: Commit**

```bash
git add -- src/lib/rate-limit/reservations.ts src/lib/rate-limit/reservations.test.ts src/lib/rate-limit/reservations.integration.test.ts
git commit -m 'perf(rate-limit): collapse usage reservation round trips'
```

---

### Task 4: Verify latency, tails, and end-to-end profiler attribution

**Files:**
- Modify only if behavior documentation needs clarification: `docs/ai-system.md`
- Do not change profiler metric names or region telemetry in this task.

**Interfaces:**
- Consumes: existing `usage_reservation` span and technical-details panel.
- Produces: a before/after verification note in the final implementation report, split into uncontended latency, lock contention, and cleanup cron behavior.

- [ ] **Step 1: Run repository verification**

Run:

```bash
bun run lint
bun run typecheck
bun run test
bun run test:integration -- src/lib/rate-limit/reservations.integration.test.ts src/lib/model-experiments/service.integration.test.ts
git diff --check
```

Expected: every command exits 0. If unrelated pre-existing failures appear, report them with exact commands and prove the focused suites still pass.

- [ ] **Step 2: Verify the retention route in a development/preview environment**

Invoke the authenticated cron once. Confirm the response retains `deleted` and adds all three usage-reservation counts; confirm a second immediate invocation is idempotent and returns zero for already-cleaned rows. Do not invoke Production unless the intended deployment target is explicitly confirmed.

- [ ] **Step 3: Capture a same-region warm baseline and optimized sample**

Use the same deployment and database region for both cohorts. For each cohort, send at least 20 sequential turns with fresh request keys after one warm-up. Export `usage_reservation` span durations and report sample count, P50, P90, P95, minimum, maximum, failures, deployment identity, function region, and database target identity. Do not mix the owner's region-change samples into the optimization comparison.

- [ ] **Step 4: Verify the acceptance gates**

The implementation is accepted only if:

- optimized uncontended P50 is at most 180 ms;
- optimized P50 is at least 40% lower than its same-region baseline;
- optimized uncontended P95 is at most 250 ms;
- traces still show `usage_reservation` separately from `rate_limit_check` and database connection;
- no errors, duplicate usage rows, duplicate request charges, or stranded live reservations appear in the sample.

If semantics pass but latency misses, stop before deployment and inspect transaction begin/commit and lock wait separately. Do not remove the user lock to force the target.

- [ ] **Step 5: Exercise contention deliberately**

Send two same-user finite-plan requests concurrently. Report the waiting request separately as lock contention, confirm one is allowed and one gets the retryable in-progress result, and ensure the waiting sample is not included in the uncontended P50/P95 gate.

- [ ] **Step 6: Final commit if documentation changed**

```bash
git add -- docs/ai-system.md
git commit -m 'docs(ai): document usage reservation latency behavior'
```

Skip this commit when no documentation edit is necessary.

## Expected result

The healthy request path falls from roughly ten serialized database exchanges to transaction begin, user lock, one decision/upsert query, and commit. At the observed 27 ms database RTT, that predicts approximately 100–150 ms instead of about 300 ms. Cleanup remains durable through the existing daily cron, stale leases never block a request, and idempotent recovery remains available without adding joins to every new generation.
