# Product Alignment Implementation Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to turn one workstream at a time into a task-level plan, then use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement it. Do not execute this program as one change.

**Goal:** Bring the running product into conformance with `CONTEXT.md` and every active ADR without weakening chat reliability or channel isolation.

**Architecture:** Treat the work as ten independently reviewable workstreams. Remove direct launch-policy conflicts first, introduce performance contexts before context-dependent features, and finish with cross-channel launch verification. Each workstream gets its own schema boundary, tests, migration, rollout flag where needed, and rollback gate.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma/PostgreSQL, Clerk, Vercel AI SDK, OpenRouter, PostHog, QStash, Telegram Bot API, WhatsApp Cloud API, Vercel Blob, Vitest.

**Spec:** `CONTEXT.md`, `docs/adr/`, and `docs/product-alignment-gap-analysis.md`

## Global Constraints

- Read `CONTEXT.md` and the relevant ADRs before writing each child plan.
- Keep `openai/gpt-5.6-luna` as the coaching model unless a later approved ADR changes it.
- Preserve one-question-at-a-time coaching and current thread-scoped raw history.
- All plans use the same coaching standards; only capacity, continuity, modality, and retention differ.
- Organizations receive entitlements, never individual coaching content or progress.
- Routines remain cohort-gated and absent from public positioning and primary success metrics.
- Use migration-backed Prisma changes and update generated clients and mocks.
- Read local Next.js 16 documentation before changing routes, caching, Server Components, metadata, proxy, or build configuration.
- Every workstream must be deployable and reversible independently.

---

## Sequence

| Order | Workstream | Priority | Depends on | Exit gate |
| ---: | --- | --- | --- | --- |
| 1 | Coaching contract | P0 | Decision docs | Runtime prompts and regression fixtures match scope and no-referral policy. |
| 2 | Age and paid access | P0 | Legal interpretation recorded | Under-14 access and unpaid registered coaching fail closed; paid tiers are monotonic. |
| 3 | Trace and analytics privacy | P0 | Consent and purpose taxonomy | Readable access is reason-bound; optional analytics is consented and pseudonymous. |
| 4 | Performance contexts | P1 foundation | Workstreams 1–2 contracts | Durable knowledge has an explicit owner and context. |
| 5 | Data lifecycle | P0 | Context schema | Export, deletion, channel-history deletion, and derived cleanup are complete and retryable. |
| 6 | Follow-up commitments | P1 | Context schema and privacy settings | One opted-in commitment reaches one chosen channel exactly once or records a miss. |
| 7 | Channel voice modes | P1 | Preference schema | Web, Telegram, and WhatsApp honor independent Text, Voice, and Auto modes. |
| 8 | Coaching value and experiments | P1 | Context and analytics boundaries | Value/evidence signals are observable; coaching comparisons require participation. |
| 9 | Retention, routines, and public copy | P0/P2 | Context and data lifecycle | Hidden summaries are gone; routine claims are private; plan/privacy copy is true. |
| 10 | Launch qualification | P0 | All earlier workstreams | Technical, legal, privacy, billing, identity, and channel owners sign the release gate. |

## Workstream 1: Align the coaching contract

**Primary files:**

- Modify: `src/lib/ai/orchestrator.ts`
- Modify: `src/lib/ai/coaching-behavior.ts`
- Modify: `src/lib/ai/communication-style.ts`
- Modify: `src/lib/ai/orchestrator.test.ts`
- Modify: `src/lib/benchmark/conversation-scenarios.ts`
- Modify: `src/lib/benchmark/reality.ts`

**Deliverables:**

- Replace the sport-only identity in authenticated and Guest prompts with the general mental-performance definition.
- Remove biomechanics, therapy, medical guidance, and every provider or emergency redirection path.
- Remove the grouped-question instruction and preserve one focused question only when it changes the coaching move.
- Permit direct recommendations and adjacent practical tasks when they support the performance goal.
- Add plain provenance rules for personal documents, lived evidence, curated knowledge, and current web sources.
- Add fixtures for sport, study, work, referenced people, physical symptoms, immediate danger, practical tasks, and source provenance.

**Verification:**

```bash
bunx vitest run src/lib/ai/orchestrator.test.ts src/lib/ai/coaching-behavior.test.ts src/lib/ai/communication-style.test.ts
bun run benchmark:conversation
```

**Commit boundary:** `feat: align the mental-performance coaching contract`

## Workstream 2: Enforce date of birth, age, and paid access

**Primary files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260822090000_enforce_birth_date_and_paid_access/migration.sql`
- Modify: `src/lib/onboarding/constants.ts`
- Modify: `src/lib/onboarding/schemas.ts`
- Modify: `src/lib/onboarding/service.ts`
- Modify: `src/lib/onboarding/persistence.ts`
- Modify: `src/app/(onboarding)/onboarding/onboarding-client.tsx`
- Modify: `src/lib/onboarding/gate.ts`
- Modify: `src/lib/plans/types.ts`
- Modify: `src/lib/plans/catalog.ts`
- Modify: `src/lib/plans/resolver.ts`
- Modify: `src/lib/organizations/entitlements.ts`
- Modify: `src/app/(chat)/chat/layout.tsx`
- Modify: `src/app/(marketing)/profile/components/CoachingContextSection.tsx`

**Interfaces to define in the child plan:**

```ts
type AgeEligibility =
  | { allowed: true; age: number; promptAge: number | "14-17" }
  | { allowed: false; reason: "UNDER_14" | "MISSING_BIRTH_DATE" };

function deriveAgeEligibility(birthDate: Date, now: Date): AgeEligibility;
function hasCoachingEntitlement(snapshot: EffectiveEntitlements): boolean;
```

**Deliverables:**

- Replace onboarding integer age with mandatory date of birth and an explanation of use.
- Store birth date, audit and rate-limit corrections, recalculate eligibility immediately, and block under-14 product access.
- Send only the derived age band or materially useful adult age into coaching context.
- Remove Trial from canonical launch plans and reject coaching for registered users without a paid or organization entitlement while preserving Web data/privacy access.
- Make Basic, Basic Plus, and Pro monotonic across requests, tokens, context, uploads, voice, and retention.

**Verification:**

```bash
bunx prisma validate
bunx prisma generate
bunx vitest run src/lib/onboarding src/lib/plans src/lib/organizations/entitlements.test.ts
bun run test:integration
```

**Commit boundaries:**

- `feat: enforce age eligibility from date of birth`
- `feat: require paid coaching access after guest conversion`

## Workstream 3: Make trace access and analytics consent real

**Primary files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260822100000_govern_trace_access_and_analytics_consent/migration.sql`
- Modify: `src/app/api/admin/ai-traces/[traceId]/route.ts`
- Modify: `src/app/(admin)/admin/ai-traces/page.tsx`
- Modify: `src/lib/ai/trace.ts`
- Modify: `src/app/api/cron/cleanup-ai-traces/route.ts`
- Modify: `src/components/providers/identify-user.tsx`
- Modify: `src/lib/posthog-client.ts`
- Modify: `src/lib/posthog.ts`
- Modify: `src/app/api/preferences/route.ts`
- Modify: `src/app/(marketing)/profile/components/PreferencesSection.tsx`
- Modify: `src/lib/analytics/funnel.ts`
- Modify: `src/app/(marketing)/privacy/page.tsx`

**Interfaces to define in the child plan:**

```ts
type TraceAccessPurpose =
  | "DEBUGGING"
  | "USER_SUPPORT"
  | "SAFETY_ABUSE_INVESTIGATION"
  | "APPROVED_QUALITY_REVIEW";

type ProductAnalyticsConsent = "NOT_ASKED" | "GRANTED" | "DENIED";
```

**Deliverables:**

- Require purpose, written reason, and linked case or review project before decryption.
- Retain actor, trace reference, purpose, timestamp, and case independently of 30-day content deletion.
- Represent quality-review approval, reviewer separation, bounded sample, and expiry.
- Show the readable-trace disclosure before the first Guest message and provide browser-bound deletion.
- Replace Clerk/profile identification in PostHog with a pseudonymous analytics ID.
- Start optional product analytics disabled and keep necessary operational telemetry content-free.
- Rewrite privacy copy to state authorized human readability plainly.

**Verification:**

```bash
bunx prisma validate
bunx prisma generate
bunx vitest run src/app/api/admin/ai-traces src/lib/ai/trace.test.ts src/lib/analytics src/lib/posthog-client.test.ts
bun run test:integration
```

**Commit boundaries:**

- `feat: require audited purpose before trace decryption`
- `feat: add consented pseudonymous product analytics`

## Workstream 4: Add performance contexts and safe memory ownership

**Primary files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260822110000_add_performance_contexts/migration.sql`
- Create: `src/lib/performance-contexts/types.ts`
- Create: `src/lib/performance-contexts/service.ts`
- Create: `src/lib/performance-contexts/inference.ts`
- Modify: `src/lib/ai/tools/memory.ts`
- Modify: `src/lib/ai/memory-facts.ts`
- Modify: `src/lib/ai/memory-consolidator.ts`
- Modify: `src/lib/ai/tools/user-context.ts`
- Modify: `src/lib/ai/orchestrator.ts`
- Modify: `src/app/api/coaching-context/route.ts`
- Modify: `src/app/api/coaching-context/memories/[memoryId]/route.ts`
- Modify: `src/app/(marketing)/profile/components/CoachingContextSection.tsx`

**Core schema contract:**

```ts
type PerformanceContextStatus = "ACTIVE" | "ARCHIVED";
type KnowledgeScope =
  | { kind: "PERSON_WIDE" }
  | { kind: "CONTEXT"; performanceContextId: string };
type CoachedSubject = "ACCOUNT_HOLDER" | "REFERENCED_PERSON";
```

**Deliverables:**

- Add performance contexts and link context-owned chats, memories, attempts, evidence, and personal documents. Experimental routines may hold an optional context reference, but the context model must not depend on them.
- Create contexts only when the first durable contextual item is saved; support rename, merge, archive, correction, and explicit switching.
- Prevent referenced-person facts from reaching profile or memory.
- Require confirmation before promoting a contextual pattern to person-wide knowledge.
- Expand sensitive-memory classification, assign expiry or review dates to temporary facts, and exclude expired or superseded values from prompts.
- Add context labels, revision restore, and a memory-saved indicator with undo.

**Verification:**

```bash
bunx prisma validate
bunx prisma generate
bunx vitest run src/lib/performance-contexts src/lib/ai/memory-facts.test.ts src/lib/ai/tools/memory.test.ts src/app/api/coaching-context
bun run test:integration
```

**Commit boundaries:**

- `feat: add performance-context ownership`
- `feat: enforce subject-safe contextual memory`
- `feat: expose context-aware memory controls`

## Workstream 5: Replace synchronous deletion and add full export

**Primary files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260822120000_add_account_lifecycle_jobs/migration.sql`
- Create: `src/lib/account-lifecycle/deletion.ts`
- Create: `src/lib/account-lifecycle/export.ts`
- Create: `src/app/api/queues/account-deletion/route.ts`
- Modify: `src/app/api/user/me/route.ts`
- Create: `src/app/api/user/export/route.ts`
- Modify: `src/app/api/chats/[id]/route.ts`
- Modify: `src/app/api/channels/[id]/route.ts`
- Modify: `src/app/(marketing)/profile/components/DangerZoneSection.tsx`
- Modify: `src/app/(marketing)/channels/client.tsx`
- Modify: `src/lib/ai/conversation-index.ts`
- Modify: `src/lib/maintenance/session-archiver.ts`

**Lifecycle states:**

```ts
type AccountDeletionStatus =
  | "REQUESTED"
  | "BILLING_CANCELLATION_PENDING"
  | "ERASING"
  | "COMPLETED"
  | "BLOCKED";
```

**Deliverables:**

- Revoke access immediately, confirm subscription cancellation, and erase through an idempotent QStash job.
- Keep retry evidence and a support path without retaining coaching content after erasure.
- Build a full account export with structured JSON and readable per-channel conversations.
- Add explicit disconnect-only and disconnect-plus-channel-history deletion.
- Show linked durable knowledge when deleting a chat and default contextual derivatives to deletion.
- Remove or rebuild memory links, summaries, archived summaries, recall chunks, embeddings, and caches when source content disappears.

**Verification:**

```bash
bunx prisma validate
bunx prisma generate
bunx vitest run src/lib/account-lifecycle src/app/api/user src/app/api/chats/\[id\]/route.test.ts src/app/api/channels/\[id\]/route.test.ts src/lib/ai/conversation-index.test.ts
bun run test:integration
```

**Commit boundaries:**

- `feat: add retryable account erasure`
- `feat: add portable account export`
- `feat: propagate source deletion through derived knowledge`

## Workstream 6: Add explicit follow-up commitments

**Primary files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260822130000_add_follow_up_commitments/migration.sql`
- Create: `src/lib/follow-ups/types.ts`
- Create: `src/lib/follow-ups/service.ts`
- Create: `src/lib/follow-ups/delivery.ts`
- Create: `src/lib/ai/tools/follow-up.ts`
- Create: `src/app/api/follow-ups/route.ts`
- Create: `src/app/api/follow-ups/[commitmentId]/route.ts`
- Create: `src/app/api/queues/follow-up/route.ts`
- Modify: `src/app/api/preferences/route.ts`
- Modify: `src/app/(marketing)/profile/components/PreferencesSection.tsx`
- Modify: `src/lib/channels/telegram/webhook-handler.ts`
- Modify: `src/lib/channels/whatsapp/webhook-handler.ts`

**Core contract:**

```ts
type NotificationChannel = "WEB_PUSH" | "TELEGRAM" | "WHATSAPP";
type FollowUpStatus = "SCHEDULED" | "DELIVERED" | "MISSED" | "CLOSED" | "EXPIRED";
```

**Deliverables:**

- Require explicit subject, local delivery time, and one verified destination.
- Store timezone, quiet hours, default channel, and preview-detail preference on Web.
- Deliver idempotently to one channel, never fall back, and mark late or failed work as missed.
- Keep minimal lock-screen copy by default and suppress every generic, repeated, or guilt-based nudge.
- Revisit one relevant open commitment on natural return, then wait for user action.

**Verification:**

```bash
bunx prisma validate
bunx prisma generate
bunx vitest run src/lib/follow-ups src/app/api/follow-ups src/app/api/queues/follow-up src/lib/channels/telegram src/lib/channels/whatsapp
bun run test:integration
```

**Commit boundary:** `feat: add opted-in cross-channel follow-ups`

## Workstream 7: Add per-channel voice modes

**Primary files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260822140000_add_channel_voice_modes/migration.sql`
- Modify: `src/lib/voice/config.ts`
- Modify: `src/lib/voice/funnel.ts`
- Modify: `src/lib/channels/web/chat-route-handler.ts`
- Modify: `src/lib/channels/telegram/webhook-handler.ts`
- Modify: `src/lib/channels/whatsapp/webhook-handler.ts`
- Modify: `src/app/api/preferences/route.ts`
- Modify: `src/app/(marketing)/profile/components/PreferencesSection.tsx`
- Modify: `src/app/(marketing)/channels/client.tsx`

**Core contract:**

```ts
type ChannelVoiceMode = "TEXT" | "VOICE" | "AUTO";
```

**Deliverables:**

- Replace the global voice Boolean with a setting per Web, Telegram, and WhatsApp channel.
- Make Text and Voice deterministic; keep existing cadence and anti-spam rules only for Auto.
- Preserve text fallback after voice-generation failure without silently changing the saved mode.
- Add mental-performance media guardrails and remove technique-scoring or medical-inference language from multimodal prompts.

**Verification:**

```bash
bunx prisma validate
bunx prisma generate
bunx vitest run src/lib/voice src/lib/channels/web src/lib/channels/telegram src/lib/channels/whatsapp src/app/api/preferences
```

**Commit boundary:** `feat: add per-channel voice delivery modes`

## Workstream 8: Measure coaching value and gate experiments

**Primary files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260822150000_add_coaching_loop_signals/migration.sql`
- Create: `src/lib/coaching-loops/signals.ts`
- Create: `src/lib/coaching-loops/service.ts`
- Modify: `src/lib/channel-flow/persistence.ts`
- Modify: `src/app/api/chat/feedback/route.ts`
- Modify: `src/app/api/guest/chat/feedback/route.ts`
- Modify: `src/lib/model-experiments/eligibility.ts`
- Modify: `src/lib/model-experiments/runtime.ts`
- Modify: `src/app/(admin)/admin/model-experiments/page.tsx`
- Modify: `src/lib/analytics/funnel.ts`

**Core contract:**

```ts
type CoachingLoopSignalType = "VALUE_CREATED" | "EVIDENCE_RECEIVED";
type SignalEvidence = "USER_EXPLICIT" | "USER_FEEDBACK" | "REVIEW_APPROVED";
```

**Deliverables:**

- Record value only from attributable user evidence, not an assistant or model self-score.
- Link later evidence to the relevant performance context and open loop when possible.
- Keep response feedback optional and supporting.
- Replace message-count/session-count success claims with loop signals in product reporting.
- Require explicit participation before side-by-side model or coaching comparisons.
- Restrict silent experiments to low-risk presentation or execution-equivalent variants.
- Encode evaluation, privacy, latency, cost, staged rollout, monitoring, and rollback as activation gates.

**Verification:**

```bash
bunx prisma validate
bunx prisma generate
bunx vitest run src/lib/coaching-loops src/lib/model-experiments src/lib/analytics src/app/api/chat/feedback src/app/api/guest/chat/feedback
bun run test:integration
```

**Commit boundaries:**

- `feat: record evidence-backed coaching loop value`
- `feat: require participation for coaching comparisons`

## Workstream 9: Correct retention, routine exposure, and public copy

**Primary files:**

- Modify: `src/lib/maintenance/session-archiver.ts`
- Modify: `src/lib/maintenance/retention-policy.ts`
- Modify: `src/lib/coaching/routine-feature.ts`
- Modify: `src/app/(marketing)/components/Hero.tsx`
- Modify: `src/app/(marketing)/components/HowItWorks.tsx`
- Modify: `src/app/(marketing)/components/Features.tsx`
- Modify: `src/app/(marketing)/components/Testimonials.tsx`
- Modify: `src/app/(marketing)/components/CTA.tsx`
- Modify: `src/app/(marketing)/components/AnthonScenarioDemo.tsx`
- Modify: `src/app/(marketing)/pricing/page.tsx`
- Modify: `src/app/(marketing)/privacy/page.tsx`
- Modify: `src/app/(marketing)/terms/page.tsx`
- Modify: `docs/user-plan-states.md`
- Modify: `docs/rate-limiting.md`

**Deliverables:**

- Stop hidden `ArchivedSession` summaries from outliving raw history; preserve only visible contextual knowledge.
- Keep routines behind explicit cohorts and remove them from landing-page promises and primary metrics.
- Preserve athlete-first acquisition without defining the product boundary as sport.
- Remove Trial copy and make Guest-to-paid behavior, plan retention, trace readability, age eligibility, and channel capabilities accurate.
- Run the legal-copy changes through the recorded pre-launch legal review rather than treating repository text as approval.

**Verification:**

```bash
bunx vitest run src/lib/maintenance/session-archiver.test.ts src/lib/coaching/routine-feature.test.ts
bunx biome check 'src/app/(marketing)' src/lib/maintenance src/lib/coaching docs/user-plan-states.md docs/rate-limiting.md
```

**Commit boundaries:**

- `fix: align retained coaching knowledge with plan windows`
- `fix: remove experimental routines from public promises`
- `docs: align launch copy with product decisions`

## Workstream 10: Qualify the launch

**Primary files:**

- Create: `docs/launch-readiness.md`
- Modify: `docs/qa-test-plan.md`
- Modify: `docs/README.md`
- Modify: `CHANGELOG.md`

**Required evidence:**

- Legal sign-off covers age 14 access, minor payments, sensitive disclosures, processing bases, contract terms, and the no-referral policy.
- Privacy sign-off covers readable traces, access audits, optional analytics, Guest deletion, exports, erasure, backups, and vendors.
- Billing tests prove no future charge survives a completed deletion request.
- Identity tests prove an external Telegram or WhatsApp identity cannot cross accounts or move history.
- Reliability tests cover successful, duplicate, failed, and recovered turns on Web, Telegram, and WhatsApp.
- Browser verification covers onboarding, under-14 blocking, unpaid registered access, profile privacy controls, export, deletion, notification preferences, and per-channel voice modes.
- Production rollout has named owner, rollback trigger, rollback command, and post-deploy observation window.

**Final verification:**

```bash
bun run lint
bun run test
bun run test:integration
bun run build
```

The launch gate passes only when every required evidence item is linked from `docs/launch-readiness.md` and each owner has signed it. A passing build alone is not launch readiness.
