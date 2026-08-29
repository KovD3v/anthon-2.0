# Product Alignment Gap Analysis

## Purpose

This document compares the current repository with `CONTEXT.md` and the active decisions in `docs/adr/`. It is a planning baseline, not evidence that a feature is deployed or legally approved.

Status meanings:

- **Aligned**: the current behavior already matches the decision closely enough to preserve.
- **Partial**: useful foundations exist, but the decision is not complete.
- **Conflict**: current behavior directly contradicts the decision.
- **Missing**: no dependable product implementation exists yet.
- **Superseded**: a later ADR replaces the decision.

## Executive finding

Anthon already has a capable multi-channel coaching runtime, but its product model is still athlete-only and user-wide. The code has no first-class performance context, follow-up commitment, consented analytics boundary, durable deletion workflow, or account-wide export. Several launch-facing paths also contradict settled decisions: age is skippable and entered as an integer, registered accounts fall back to Trial, the prompt permits a medical referral exception, PostHog receives Clerk identity data, routines are marketed publicly, and trace decryption needs no stated reason.

The safest sequence is to remove direct launch-policy conflicts first, then add the performance-context foundation before building notifications or value measurement on top of the wrong ownership model.

## Foundations worth keeping

- `src/lib/ai/coaching-behavior.ts` already uses one focused question at a time and stops interviewing once the coaching move is clear.
- `src/lib/ai/turn-plan.ts` keeps ordinary raw history thread-scoped. `src/lib/ai/recall-planner.ts` permits cross-channel conversation recall only when the user explicitly invokes past history.
- `Memory`, `MemoryRevision`, `MemoryApproval`, and `expiresAt` provide a usable base for visible, revisable, time-aware memory.
- `src/lib/coaching/routine-feature.ts` fails closed for ordinary users when its cohort flag is unavailable.
- `src/lib/ai/trace.ts` encrypts readable trace content and enforces a 30-day expiry.
- `src/app/api/admin/ai-traces/[traceId]/route.ts` already requires `SUPER_ADMIN` before decryption.
- `ChannelIdentity` and one-time `ChannelLinkToken` records enforce a unique external identity mapping.
- Organization contracts currently resolve entitlements without exposing coaching content to organization-management routes.
- AI usage is reserved before generation, and persisted assistant retries are idempotent.

## ADR-by-ADR assessment

| ADR | Status | Current evidence | Required result |
| --- | --- | --- | --- |
| 0001 General mental performance | **Conflict** | `src/lib/ai/orchestrator.ts` defines Anthon as a sports-performance coach; marketing is also sport-specific. | Generalize the runtime identity and examples while keeping athlete-first acquisition copy. |
| 0002 Referenced people | **Superseded** | ADR-0028 replaces the exclusion rule. | No implementation should target ADR-0002. |
| 0003 Multiple performance contexts | **Missing** | `Profile`, `Memory`, `Chat`, and experimental `Routine` records are user-scoped without a performance-context relation. | Add one identity with context-owned goals, pressures, attempts, and evidence; an experimental routine may reference a context without becoming a core dependency. |
| 0004 Organization privacy | **Partial** | Organization routes manage contracts and memberships, not coaching content. | Preserve that boundary, remove any member-facing Clerk surface that implies organization access, and constrain future reporting to aggregate data. |
| 0005 Context inference and knowledge partition | **Missing** | No context inference or context-aware persistence contract exists. | Infer one dominant context, ask only when ambiguity changes the coaching move, and require confirmation for person-wide promotion. |
| 0006 Plans and access | **Conflict** | `PLAN_CATALOG` includes Trial; registered accounts without a paid entitlement resolve to Trial; Trial exceeds Basic on daily requests. | Make Guest the only unpaid coaching state, require a paid or organization entitlement after registration, and make paid capacity monotonic. |
| 0007 Web and channel history | **Partial** | Web owns most controls; thread history and explicit cross-channel recall are already close to the decision. | Add context-aware cross-channel knowledge and keep document, export, billing, and privacy management on Web. |
| 0008 Adult-only accounts | **Superseded** | ADR-0011 and ADR-0013 replace it. | No implementation should target ADR-0008. |
| 0009 Knowledge-source separation | **Partial** | Shared curated RAG and live web tools are separate, but personal documents are attachments rather than context-owned knowledge. | Add source provenance and context ownership for personal documents without merging them into curated RAG. |
| 0010 Opted-in follow-up | **Missing** | Legacy notification tables were removed; `Preferences.push` remains a global Boolean defaulting to true. | Add explicit follow-up commitments, one chosen delivery channel, timezone, quiet hours, minimal previews, expiry, and missed-delivery state. |
| 0011 Date of birth onboarding | **Conflict** | Onboarding asks for skippable integer age and accepts ages 1–120; prompt context receives exact stored age. | Ask for mandatory date of birth, explain collection, derive eligibility and age bands, audit corrections, and never send birth date to the model. |
| 0012 Readable trace governance | **Partial** | Successful persisted turns can create encrypted 30-day traces across shared channel persistence. Decryption is `SUPER_ADMIN`-only. | Require purpose and linked case before access, retain access audits independently, govern quality projects, add guest disclosure/deletion, and state human readability plainly. |
| 0013 Self-managed access at 14 | **Missing** | There is no under-14 gate or runtime eligibility recalculation. | Block users below 14, preserve the same coaching experience for 14–17, and complete legal review before launch. |
| 0014 Account deletion | **Conflict** | `/api/user/me` deletes Clerk first, then blobs and the database synchronously; billing cancellation is not confirmed first. | Revoke access immediately, confirm billing cancellation, run retryable erasure, and report completion only after all active stores clear. |
| 0015 Full account export | **Missing** | Only a single-chat Markdown export exists. | Add a portable account-wide package with readable conversations and structured profile, context, memory, document metadata, billing, and usage data. |
| 0016 Account-holder data ownership | **Partial** | Seat removal does not transfer coaching data, and channel disconnection preserves history. | Add read-only data access without entitlement, separate channel-history deletion, and linked-memory choices during chat deletion. |
| 0017 Direct coaching and provenance | **Partial** | Coaching cadence is mostly aligned; web use is limited to current facts. | Remove the remaining grouped-question instruction, allow clear recommendations, and label material document, lived-evidence, and external-source provenance. |
| 0018 No guidance or referral | **Conflict** | The current prompt allows brief direction to doctors, pediatricians, and emergency services for specified cases. | Remove every referral exception and stop with a scope statement when no safe mental-performance move remains. |
| 0019 Visible and time-aware memory | **Partial** | Sensitive approval, revisions, expiry fields, and profile edit/delete exist. | Expand sensitive categories, add context labels, assign expiry to temporary facts, expose revision restore, and show a non-conversational save indicator with undo. |
| 0020 Context creation | **Missing** | No performance-context entity or lifecycle exists. | Create a context only with the first durable contextual item and support rename, merge, archive, and correction. |
| 0021 Derived deletion and guest promotion | **Partial** | Some relations cascade, but deleting source messages can leave memory facts with null source links; archived summaries can outlive raw messages. | Rebuild or remove every derived representation and prevent retrospective guest-memory extraction after conversion. |
| 0022 Channel and media boundaries | **Partial** | Telegram and WhatsApp support text, audio, and images; identity links are unique. Voice is controlled by one global Boolean. | Add per-channel Text, Voice, and Auto modes, retain bounded Auto cadence, add Web deep links, and enforce mental-performance-only media interpretation. |
| 0023 Coaching-value measurement | **Conflict** | Funnel analytics counts messages and sessions; PostHog identification sends Clerk ID, email, name, image, and other profile properties without a product-analytics consent boundary. | Add pseudonymous consented product analytics and explicit `value_created` and `evidence_received` signals. Keep operational telemetry separate. |
| 0024 Experiments and AI release gates | **Partial** | Model experiments have lifecycle controls and benchmarks, but feature-flag eligibility can expose real users without explicit participation. | Limit silent tests to low-risk equivalents, require opt-in for side-by-side coaching comparisons, and codify staged evaluation and rollback gates. |
| 0025 Admin separation and launch gates | **Partial** | `ADMIN` and `SUPER_ADMIN` roles exist, and trace content is already super-admin-only. | Add approval separation for quality review and a release checklist that cannot pass with an unsigned legal, privacy, identity, billing, deletion, or reliability gate. |
| 0026 Quota completion and retention | **Partial** | Usage reservation happens before generation, but old raw sessions are converted into hidden long-term `ArchivedSession` summaries. | Finish accepted turns, expose exact reset time, and delete hidden summaries or convert them into visible contextual knowledge when raw history expires. |
| 0027 Bounded routine experiment | **Conflict** | Routine access is cohort-gated and fails closed, but landing-page copy presents routines as a public product promise and routine events are tracked as a product funnel. | Remove public routine claims and primary-metric treatment; keep optional context ownership inside the experiment and promote only from completed-loop evidence. |
| 0028 Referenced-person memory | **Aligned** | Post-turn extraction identifies the subject; consolidation keeps referenced-person facts in `Memory` with attributed keys and values instead of changing `Profile` or `Preferences`. | Preserve one account-owned memory and explicit subject attribution. |

## Priority order

### P0 — blocks public launch

1. Coaching identity, scope, and no-referral prompt alignment.
2. Mandatory date of birth, 14+ eligibility, and legal review.
3. Paid-access enforcement with no Trial fallback and monotonic entitlements.
4. Trace purpose controls, independent audits, guest disclosure, and plain privacy copy.
5. Optional analytics consent and removal of identity/profile data from PostHog.
6. Retryable account deletion, billing cancellation, and full account export.
7. Explicit participation for side-by-side coaching experiments.
8. Removal of routines from public product positioning.

### P1 — required product foundation

1. Performance contexts and context-owned knowledge.
2. Referenced-person attribution in the account holder's single memory.
3. Memory expiry, revision restore, save visibility, and derived deletion.
4. Follow-up commitments and notification delivery.
5. Per-channel voice modes and channel-history deletion.
6. Coaching-loop value and evidence signals.

### P2 — hardening before scale

1. Account-wide provenance across lived evidence, documents, curated knowledge, and web sources.
2. Retention cleanup that never leaves hidden summaries behind.
3. Organization aggregate-reporting contracts, if reporting is introduced.
4. Automated release gates for prompts, models, memory, routing, privacy, latency, and cost.

## Non-code launch evidence

The repository cannot prove the following gates by itself:

- legal review of access from age 14, contracts, minor-paid subscriptions, sensitive disclosures, processing bases, and the no-referral policy;
- a documented backup-expiry schedule;
- named owners and reviewer training for trace quality-review projects;
- operational support procedures for failed billing cancellation, deletion, and data-rights requests;
- sign-off that critical Web, Telegram, and WhatsApp flows meet the launch reliability threshold.

Record this evidence beside the release checklist. Do not encode a legal or operational assertion in UI copy before its owner signs it.
