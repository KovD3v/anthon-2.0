# Plan 033: Prevent registration from reducing guest entitlements

> **Executor instructions**: Follow this plan step by step and run every
> verification command. This is a catalog correction plus a durable monotonic
> entitlement test, not a billing redesign. The reviewer maintains the plan
> index.
>
> **Drift check (run first)**:
> `git diff --stat 4f17dd9..HEAD -- src/lib/plans/catalog.ts src/lib/plans/resolver.ts src/lib/plans/snapshot.test.ts src/lib/rate-limit/upgrade.test.ts docs/rate-limiting.md`
> If guest/trial resolution or Clerk subscription synchronization changed,
> reconcile before editing. An ambiguous live plan mapping is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (execute after 032 for the product sequence)
- **Category**: bug
- **Planned at**: commit `4f17dd9`, 2026-07-31

## Why this matters

Guests receive 10 requests per day, while the repository fallback for a newly
registered user without an active mapped plan is `TRIAL`, which receives 3.
Registration should never make the core coaching experience worse. The
smallest correction is to lift trial requests to the guest floor and encode
the broader monotonic rule in tests.

## Current state

- `src/lib/plans/catalog.ts:37-71` gives `GUEST` 10 requests/day and `TRIAL` 3.
- Trial already exceeds guest input tokens, output tokens, cost allowance,
  context messages, and attachment retention.
- `src/lib/plans/resolver.ts:43-70` resolves a non-guest user with no recognized
  personal plan to `TRIAL`.
- The chat client attempts Clerk trial enrollment before sending, but proceeds
  when that synchronization is unavailable; the fallback is therefore a real
  product state.
- `docs/rate-limiting.md` publishes the same 10-versus-3 inversion.

## Target contract

- `TRIAL.maxRequestsPerDay` is 10: equal to, not lower than, the guest floor.
- Every enforced numeric trial allowance is greater than or equal to guest.
- Any feature unavailable to guests must not become less available in trial.
- Paid tiers, model routing, voice enablement, checkout, and Clerk product
  configuration do not change.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Catalog tests | `bunx vitest run src/lib/plans/snapshot.test.ts src/lib/plans/resolver.test.ts` | all pass |
| Rate-limit tests | `bunx vitest run src/lib/rate-limit/upgrade.test.ts` | all pass |
| Full gate | `bun run verify` | exit 0 |
| Hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- `src/lib/plans/catalog.ts`
- A catalog invariant test in the existing plans test area.
- Affected snapshots/resolver/rate-limit expectations.
- `docs/rate-limiting.md`

**Out of scope**:

- Raising trial above the guest request floor.
- Paid plan price or allowance changes.
- Voice access changes.
- Clerk dashboard products, checkout, organizations, or billing.
- Usage reset semantics, model selection, or rate-limit architecture.

## Git workflow

- Branch: `improve/033-registration-entitlement-floor`
- Commit: `fix(plans): preserve guest entitlement floor after signup`
- Do not push, merge, or open a PR unless instructed.

## Steps

### Step 1: Encode the monotonic contract first

Add a named test that compares `PLAN_CATALOG.TRIAL` with
`PLAN_CATALOG.GUEST`. Cover request, token, cost, context, attachment-retention,
and other enforced numeric allowances. For boolean capabilities, assert trial
does not disable a capability that guest has; do not infer ordering from
unrelated configuration such as voice cadence while voice is disabled.

The failure message should identify the regressed field so future catalog
changes are diagnosable.

**Verify**:
run the new focused test and confirm it fails only on
`maxRequestsPerDay: 3 < 10`.

### Step 2: Lift trial to the guest request floor

Change only `TRIAL.limits.maxRequestsPerDay` from 3 to 10. Update exact catalog
snapshots and expectations. Do not alter tokens, cost, context, retention,
voice, or model routing.

**Verify**:
`bunx vitest run src/lib/plans/snapshot.test.ts src/lib/plans/resolver.test.ts src/lib/rate-limit/upgrade.test.ts`
passes.

### Step 3: Update the source-of-truth documentation

Change the `TRIAL` requests/day row in `docs/rate-limiting.md` to 10 and add
one sentence stating that registration fallback entitlements may equal or
exceed, but never fall below, guest entitlements.

**Verify**:
`rg -n '\\| \`(GUEST|TRIAL)\`' docs/rate-limiting.md` shows 10 for both.

### Step 4: Run repository gates

Run the full verification suite and inspect the diff for accidental plan or
pricing changes.

**Verify**:
`bun run verify && git diff --check` exits 0.

## Test plan

- Catalog invariant identifies any guest-to-trial numeric regression.
- Resolver still maps missing/non-active personal state to trial.
- Upgrade copy and blocking behavior reflect 10 trial requests.
- Existing catalog snapshot changes only at the intended value.

## Done criteria

- [ ] Trial requests/day equals the guest floor of 10.
- [ ] A durable test enforces monotonic guest-to-trial allowances.
- [ ] Documentation matches runtime catalog.
- [ ] No paid, voice, model, or billing behavior changed.
- [ ] Focused tests, `bun run verify`, and `git diff --check` pass.

## STOP conditions

- Live Clerk product mapping proves the fallback is not `TRIAL`.
- A remote billing/config change is required to make repository behavior true.
- The monotonic comparison reveals a product-sensitive feature inversion not
  described in this plan; report it instead of silently widening scope.
- Verification fails twice after a reasonable correction.

## Maintenance notes

Keep the invariant close to the catalog. Any future guest acquisition
experiment must preserve the registered fallback floor or explicitly change
both the product decision and this test in the same review.
