# Beta Access Gate Implementation Plan

**Goal:** Gate every human-facing Anthon surface behind one persistent shared beta password, add a release mailing list, and provide SUPER_ADMIN password/subscriber management without coupling access to Clerk accounts.

**Architecture:** A singleton Prisma configuration stores a versioned scrypt password digest. A signed 180-day HttpOnly cookie carries only the configuration version and expiry. The Next.js proxy classifies routes, verifies the cookie, and checks the current singleton version so rotation revokes all prior access. Public unlock/subscription APIs and SUPER_ADMIN APIs use focused beta-access services. The beta screen and admin console remain separate clients over those APIs.

**Tech stack:** Next.js 16.3 App Router/Proxy, React 19, TypeScript, Prisma 7/PostgreSQL, Node crypto, Clerk authorization, Tailwind CSS 4, TanStack Query, Vitest/Testing Library, Biome, Bun.

## Global constraints

- Work only in `/Users/kovd3v/Documents/Projects/anthon-2.0/.worktrees/beta-access-gate` on `feat/beta-access-gate`.
- Keep `openai/gpt-5.6-luna` and all AI orchestration untouched.
- Follow TDD: add one failing behavioral test, observe the intended failure, then add the minimum production behavior.
- Use `Request` in route handlers and `src/lib/logger/` for operational logs.
- Never log passwords, emails, cookie values, raw IPs, password derivatives, or CSV bodies.
- Public gate checks are not substitutes for Clerk or role authorization. Admin APIs must independently call `requireSuperAdmin()`.
- Preserve webhooks, queues, cron, health, static assets, `/privacy`, `/terms`, and admin authorization behavior.
- Use `bun run`/`bunx`, Prisma migration workflow, and Biome.
- Do not push, merge, deploy a database migration, or deploy Production in this plan.

---

## Task 1: Add the beta data model and cryptographic contracts

**Files**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260816090000_add_beta_access_gate/migration.sql`
- Create: `src/lib/beta-access/constants.ts`
- Create: `src/lib/beta-access/password.ts`
- Create: `src/lib/beta-access/password.test.ts`
- Create: `src/lib/beta-access/cookie.ts`
- Create: `src/lib/beta-access/cookie.test.ts`
- Modify: `.env.example`

**Steps**

1. Write failing password tests for versioned scrypt serialization, correct/incorrect verification, malformed digest rejection, and constant-length derived values.
2. Run `bunx vitest run src/lib/beta-access/password.test.ts` and confirm failure because the module is absent.
3. Implement the minimal async scrypt wrapper with random salt, bounded parameters, and timing-safe verification; rerun to green.
4. Write failing cookie tests for 180-day issuance, HMAC tamper rejection, expiry, malformed payloads, and config-version extraction.
5. Run `bunx vitest run src/lib/beta-access/cookie.test.ts` and confirm the missing contract fails.
6. Implement cookie signing/verification and cookie option constants; rerun to green.
7. Add `BetaAccessConfig`, `BetaMailingSubscriber`, `BetaAbuseAction`, and `BetaAbuseBucket` to Prisma plus the matching SQL migration and indexes. Add `BETA_ACCESS_COOKIE_SECRET` documentation to `.env.example` without a value.
8. Run `bunx prisma validate`, `bunx prisma generate`, the focused tests, and targeted Biome.
9. Commit as `feat(beta): add access security model`.

---

## Task 2: Implement configuration, access validation, subscriber consent, and abuse control

**Files**

- Create: `src/lib/beta-access/return-to.ts`
- Create: `src/lib/beta-access/return-to.test.ts`
- Create: `src/lib/beta-access/route-policy.ts`
- Create: `src/lib/beta-access/route-policy.test.ts`
- Create: `src/lib/beta-access/client-fingerprint.ts`
- Create: `src/lib/beta-access/abuse.ts`
- Create: `src/lib/beta-access/abuse.test.ts`
- Create: `src/lib/beta-access/service.ts`
- Create: `src/lib/beta-access/service.test.ts`
- Create: `src/lib/beta-access/subscribers.ts`
- Create: `src/lib/beta-access/subscribers.test.ts`

**Steps**

1. Write failing table tests for safe internal `returnTo`, segment-aware public/admin/technical exceptions, normal page gating, and interactive API gating.
2. Implement pure route-policy and destination functions, then rerun to green.
3. Write failing abuse tests for domain-separated HMAC fingerprints, trusted header rules, ten failed unlocks per 15 minutes, five subscriptions per hour, atomic reservation, and bounded retention.
4. Implement `BetaAbuseBucket` reservations using database conflict handling and no raw address storage; rerun to green.
5. Write failing service tests for inactive/no-row state, missing secret fail-closed behavior, successful unlock, wrong-password neutrality, version comparison, and transactional SUPER_ADMIN rotation.
6. Implement focused service functions over injected/default Prisma boundaries and the crypto contracts; rerun to green.
7. Write failing subscriber tests for normalized unique upsert, explicit release consent, optional updates opt-in, later opt-out, neutral duplicate result, pagination/filtering, and counts.
8. Implement the subscriber service with Zod validation and transactional upsert semantics; rerun to green.
9. Run the task's focused tests and targeted Biome.
10. Commit as `feat(beta): add access and consent services`.

---

## Task 3: Add public APIs and central proxy enforcement

**Files**

- Create: `src/app/api/beta-access/unlock/route.ts`
- Create: `src/app/api/beta-access/unlock/route.test.ts`
- Create: `src/app/api/beta-access/subscribe/route.ts`
- Create: `src/app/api/beta-access/subscribe/route.test.ts`
- Create: `src/lib/beta-access/proxy-gate.ts`
- Create: `src/lib/beta-access/proxy-gate.test.ts`
- Modify: `src/proxy.ts`
- Create: `src/proxy.test.ts`

**Steps**

1. Write failing unlock route tests for body validation, inactive state, wrong password, throttling, successful cookie properties, safe destination, and generic failures.
2. Implement the unlock route using the access service and `NextResponse`; rerun to green.
3. Write failing subscribe route tests for invalid email/consent, throttling, idempotent success, and neutral failures.
4. Implement the subscription route; rerun to green.
5. Write failing proxy-gate tests for missing/invalid/expired/stale/current cookies, page redirect, API `403`, DB failure `503`, public exceptions, and cookie expiry.
6. Implement the proxy gate. The singleton lookup happens only after local cookie verification.
7. Add orchestration tests proving the beta gate runs before the existing signed-out protected-route redirect while admin/technical exceptions retain current behavior.
8. Compose the beta gate into `clerkMiddleware` without weakening downstream auth. Rerun proxy and existing protected-route/auth tests.
9. Run targeted Biome and `git diff --check`.
10. Commit as `feat(beta): enforce site access gate`.

---

## Task 4: Build the public beta screen

**Files**

- Create: `src/app/(beta)/beta-access/layout.tsx`
- Create: `src/app/(beta)/beta-access/page.tsx`
- Create: `src/app/(beta)/beta-access/beta-access-client.tsx`
- Create: `src/app/(beta)/beta-access/beta-access-client.test.tsx`
- Reuse: `src/app/(auth)/_components/auth-controls.tsx`
- Reuse/reference: `src/app/(auth)/_components/auth-shell.tsx`

**Steps**

1. Write failing Testing Library tests for independent password and mailing forms, unchecked consents, generic error states, successful navigation, neutral subscription confirmation, double-submit prevention, and no cross-effect between forms.
2. Run the focused test and confirm the page client is absent.
3. Build an auth-consistent beta shell with an editorial private-beta heading, responsive one/two-column content, labelled password controls, release email input, required release checkbox, optional updates checkbox, Privacy link, and accessible status feedback.
4. Keep both mutations independent and preserve input on recoverable failures. Never create guest state during page render.
5. Run the component tests, targeted Biome, and reduced-motion/accessibility source checks.
6. Commit as `feat(beta): add private beta entry screen`.

---

## Task 5: Add SUPER_ADMIN settings, subscriber list, and safe CSV export

**Files**

- Create: `src/lib/beta-access/csv.ts`
- Create: `src/lib/beta-access/csv.test.ts`
- Create: `src/app/api/admin/beta-access/route.ts`
- Create: `src/app/api/admin/beta-access/route.test.ts`
- Create: `src/app/api/admin/beta-access/subscribers/route.ts`
- Create: `src/app/api/admin/beta-access/subscribers/route.test.ts`
- Create: `src/app/api/admin/beta-access/export/route.ts`
- Create: `src/app/api/admin/beta-access/export/route.test.ts`
- Create: `src/app/(admin)/admin/beta/page.tsx`
- Create: `src/app/(admin)/admin/beta/beta-admin-client.tsx`
- Create: `src/app/(admin)/admin/beta/beta-admin-client.test.tsx`
- Modify: `src/app/(admin)/admin/layout-client.tsx`

**Steps**

1. Write failing CSV tests for quoting, CR/LF, formula-prefix neutralization, headings, and consent timestamps; implement to green.
2. Write failing admin API tests proving `requireSuperAdmin()` protects every method, no secret fields escape, password confirmation/strength is validated, rotation increments version, list filters/paginates, and export is private/no-store.
3. Implement the settings/list/export APIs over the services and rerun to green.
4. Write failing admin client tests for current status, subscriber metrics, rotation warning, confirmation mismatch, refresh after success, filter/pagination, and CSV download link.
5. Implement the responsive admin console using existing Card/Input/Button/Table patterns and add `Beta` to both desktop/mobile navigation.
6. Run focused tests, existing admin authorization tests, targeted Biome, and `git diff --check`.
7. Commit as `feat(admin): manage private beta access`.

---

## Task 6: Verify migration, runtime behavior, and release quality

**Files**

- Add or update integration tests under `src/app/api/` or `src/lib/beta-access/` only if the real database exposes a missing contract.
- Update plan checkboxes/results as implementation evidence if useful; do not rewrite the approved design.

**Steps**

1. Run `bunx prisma validate`, `bunx prisma generate`, and `bunx prisma migrate status` against the configured development target without deploying Production.
2. Run the relevant ephemeral-Neon integration command if credentials are available. Verify migration application, singleton rotation, concurrent subscriber uniqueness, and consent transitions.
3. Run all beta/admin/proxy tests plus existing auth, protected-route, guest-auth, and admin suites.
4. Run `bun run lint`, `bun run test`, `bun run build`, and `git diff --check`. Report generated-cache lint contamination separately if it recurs; do not edit `.impeccable/hook.cache.json`.
5. Start `bun run dev`. Use the project `next-dev-loop` requirements: verify Next.js 16.3+, `/_next/mcp`, compilation issues, server errors, then browser behavior.
6. Verify desktop and mobile gate rendering, wrong/correct password, persistence, safe return, independent mailing subscription, public legal pages, API denial, admin rotation, stale-cookie rejection, and technical endpoint exceptions. Use a disposable development password and do not print it.
7. Inspect `git status`, staged scope, migration SQL, generated client status, and secrets. Ensure the root checkout stayed unchanged.
8. Commit any final verified fixes with conventional messages. Leave the worktree clean and report commits, exact checks, and any environment-limited verification.
