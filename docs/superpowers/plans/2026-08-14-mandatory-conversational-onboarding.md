# Mandatory Conversational Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Implement the approved, one-time conversational onboarding for new registered accounts. It collects the five ordered profile fields, persists a resumable draft, promotes it to the canonical profile only after explicit confirmation, and blocks registered product usage until completion.

**Architecture:** Add a versioned OnboardingSession state machine separate from Profile. A dedicated /onboarding route and API own the conversation. DeepSeek Flash is called only for extraction, clarification, and natural phrasing; the server validates values, owns the order, owns advancement, and performs the final transaction. A shared server-side onboarding gate protects pages and APIs without moving database work into proxy.ts.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Prisma/PostgreSQL, Clerk, Vercel AI SDK Output.object, OpenRouter, Framer Motion, Vitest, Biome, Bun.

## Global Constraints

- Preserve unrelated work already present in the worktree; edit and commit only onboarding files plus the explicitly required auth/profile/context integrations.
- Keep guests able to use the existing guest flow before registration. Do not add guest onboarding.
- Do not change canonical model routing, title/icon generation, or existing chat model IDs. Pin deepseek/deepseek-v4-flash-0731 only inside onboarding.
- Do not collect symptoms, birthday, diagnosis, routine data, or health data in this flow.
- Keep the five-step order fixed on the server. Model output may suggest values for later fields, but may not advance, skip unresolved fields, complete onboarding, or change the order.
- Use existing logger, API response, auth-continuation, motion, and profile-cache conventions. Do not add production console.log or raw answer text to analytics.
- Before changing Next.js routes, layouts, redirects, or server components, read the applicable local Next.js 16 documentation under .next-docs/ or node_modules/next/dist/docs/.
- Verify incrementally with targeted Vitest tests and Biome, then run the required repository checks before claiming completion.

---

## File map

- prisma/schema.prisma and one new migration own the account completion stamp, profile fields, and versioned draft session.
- src/lib/onboarding/constants.ts, types.ts, schemas.ts, model.ts, and service.ts own the ordered state machine, structured model contract, validation, and promotion transaction.
- src/app/api/onboarding/* owns the authenticated HTTP contract; src/lib/onboarding/gate.ts owns page/API enforcement.
- src/app/(onboarding)/onboarding/* owns the isolated responsive animated UI and does not inherit the chat sidebar.
- src/lib/auth.ts, auth continuation helpers, chat/product boundaries, and direct Clerk API routes enforce the gate without changing guest behavior.
- src/lib/ai/user-knowledge.ts, src/lib/ai/tools/user-context.ts, src/lib/coaching-context.ts, the coaching-context API, and the profile editor expose age and occupation to Anthon and to the user.

## Interfaces used across tasks

The implementation must keep these names and shapes stable so tasks can be executed independently:

~~~ts
export const ONBOARDING_VERSION = 1 as const;
export const ONBOARDING_MODEL_ID = "deepseek/deepseek-v4-flash-0731" as const;

export const ONBOARDING_FIELDS = [
  "name",
  "age",
  "occupation",
  "sportOrSchool",
  "goal",
] as const;

export type OnboardingField = (typeof ONBOARDING_FIELDS)[number];
export type OnboardingDraft = {
  name: string | null;
  age: number | null;
  occupation: string | null;
  sport: string | null;
  experience: string | null;
  goal: string | null;
};

export type OnboardingSessionDto = {
  status: "IN_PROGRESS" | "REVIEW";
  currentStep: number;
  totalSteps: 5;
  currentField: OnboardingField | null;
  question: string | null;
  draft: OnboardingDraft;
  skippedFields: OnboardingField[];
  messages: Array<{ id: string; role: "assistant" | "user"; content: string }>;
};

export async function getOnboardingSessionDto(userId: string): Promise<OnboardingSessionDto>;
export async function applyOnboardingAnswer(input: {
  userId: string;
  expectedStep: number;
  userText: string;
  skip: boolean;
  requestId: string;
}): Promise<OnboardingSessionDto>;
export async function editOnboardingField(input: {
  userId: string;
  field: OnboardingField;
}): Promise<OnboardingSessionDto>;
export async function confirmOnboarding(userId: string): Promise<OnboardingSessionDto>;
~~~

### Task 1: Add the persistence contract and migration

**Files:**
- Modify: prisma/schema.prisma (User, Profile)
- Create: prisma/migrations/20260814150000_add_mandatory_onboarding/migration.sql
- Modify: existing Prisma integration factories and route mocks that fail after Prisma generation
- Test: src/lib/onboarding/persistence.integration.test.ts when the integration harness is available

**Interfaces:** Consumes the existing User/Profile relations. Produces the Prisma models consumed by Tasks 2–7.

- [ ] **Step 1: Write the schema contract test first.** Create one old-style user and one new user, then expect the old row’s completion stamp to be non-null after migration and the new row’s stamp to be null. The same fixture must create Profile.age, Profile.occupation, and one OnboardingSession with version 1.

~~~ts
expect(existingUser.onboardingCompletedAt).not.toBeNull();
expect(newUser.onboardingCompletedAt).toBeNull();
expect(session.version).toBe(1);
expect(session.status).toBe("IN_PROGRESS");
~~~

- [ ] **Step 2: Add the exact Prisma fields and relations.** Keep birthday unchanged and make the session unique by account and version, not by account alone.

~~~prisma
enum OnboardingSessionStatus {
  IN_PROGRESS
  REVIEW
}

model User {
  // existing fields...
  onboardingCompletedAt DateTime?
  onboardingSessions    OnboardingSession[]
}

model Profile {
  // existing fields...
  age        Int?
  occupation String?
}

model OnboardingSession {
  id            String                  @id @default(cuid())
  userId        String
  user          User                    @relation(fields: [userId], references: [id], onDelete: Cascade)
  version       Int                     @default(1)
  status        OnboardingSessionStatus @default(IN_PROGRESS)
  currentStep   Int                     @default(0)
  draft         Json                    @default("{}")
  skippedFields Json                    @default("[]")
  transcript    Json                    @default("[]")
  createdAt     DateTime                @default(now())
  updatedAt     DateTime                @updatedAt

  @@unique([userId, version])
  @@index([userId, status])
}
~~~

- [ ] **Step 3: Create the idempotent SQL migration.** Add nullable columns, enum, table, foreign key, and indexes; then backfill only rows whose stamp is null and whose createdAt predates the feature migration.

~~~sql
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3);
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "age" INTEGER;
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "occupation" TEXT;

UPDATE "User"
SET "onboardingCompletedAt" = "createdAt"
WHERE "onboardingCompletedAt" IS NULL
  AND "createdAt" < TIMESTAMP '2026-08-14 15:00:00+00';
~~~

Create the enum/table using the repository’s normal Prisma migration style, with the compound unique constraint and cascade foreign key. Do not use DROP, destructive defaults, or a non-null constraint on new rows.

- [ ] **Step 4: Validate and regenerate Prisma.** Run the commands below and repair only generated-client fixtures that fail type-checking.

~~~bash
bunx prisma validate
bunx prisma generate
~~~

- [ ] **Step 5: Run the persistence test and commit the isolated schema change.**

~~~bash
bunx vitest run src/lib/onboarding/persistence.integration.test.ts
git add prisma/schema.prisma prisma/migrations src/lib/onboarding/persistence.integration.test.ts
git commit -m "feat: add onboarding persistence"
~~~

### Task 2: Define the ordered domain state machine

**Files:**
- Create: src/lib/onboarding/constants.ts, src/lib/onboarding/types.ts, src/lib/onboarding/schemas.ts, src/lib/onboarding/service.ts
- Test: src/lib/onboarding/service.test.ts, src/lib/onboarding/schemas.test.ts

**Interfaces:** Consumes the Prisma OnboardingSession from Task 1. Produces OnboardingSessionDto and the four service functions defined above for Tasks 3 and 5.

- [ ] **Step 1: Write failing unit tests for the fixed order and skips.** Assert that the first question is name, the sequence is name → age → occupation → sportOrSchool → goal, and a skip marks only the current field.

~~~ts
expect(ONBOARDING_FIELDS).toEqual([
  "name",
  "age",
  "occupation",
  "sportOrSchool",
  "goal",
]);
expect(nextField({ currentStep: 1, skippedFields: ["age"] })).toBe("occupation");
~~~

- [ ] **Step 2: Implement constants and schemas.** Keep age numeric and bounded, strings trimmed and bounded, and draft serialization separate from the Prisma JSON shape.

~~~ts
export const onboardingAgeSchema = z.number().int().min(1).max(120);
export const onboardingTextSchema = z.string().trim().max(500);
export const onboardingAnswerSchema = z.object({
  expectedStep: z.number().int().min(0).max(4),
  text: z.string().max(4000),
  skip: z.boolean().default(false),
  requestId: z.string().uuid(),
});
~~~

- [ ] **Step 3: Write failing transition tests for extraction, ambiguity, and invalid age.** Cover a single answer that fills name plus age, later values stored without changing visible order, clarification with unchanged currentStep, and age 0, 121, or decimal values rejected.

~~~ts
const result = applyModelExtraction(baseState, {
  currentFieldStatus: "accepted",
  extracted: { name: "Giulia", age: 29 },
  assistantMessage: "Perfetto, grazie.",
});
expect(result.draft).toMatchObject({ name: "Giulia", age: 29 });
expect(result.currentStep).toBe(1);

const clarification = applyModelExtraction(baseState, {
  currentFieldStatus: "clarify",
  extracted: {},
  assistantMessage: "Mi dai l'età in anni?",
});
expect(clarification.currentStep).toBe(0);
~~~

- [ ] **Step 4: Implement service.ts with server-owned advancement.** Use ONBOARDING_VERSION, create/resume the compound-key session, normalize niente, nessuno, non lo so, preferisco non dirlo, and empty skip actions, and calculate the first unresolved step after every accepted answer. Persist the transcript and idempotency request id; duplicate request ids return the prior DTO.

~~~ts
function isResolved(field: OnboardingField, state: DraftState): boolean {
  return state.skippedFields.includes(field) || fieldHasValue(field, state.draft);
}

function nextUnresolvedStep(state: DraftState): number | null {
  const step = ONBOARDING_FIELDS.findIndex((field) => !isResolved(field, state));
  return step === -1 ? null : step;
}
~~~

On model/network failure, do not write the accepted draft or increment the step. On clarify, write the exchange but leave the current step unchanged. On edit, reset only the selected field and continue from the first unresolved field after its next answer.

- [ ] **Step 5: Add DTO projection tests and run the state-machine suite.** Assert that Prisma JSON internals, request ids, and diagnostics are not returned to the browser.

~~~bash
bunx vitest run src/lib/onboarding/schemas.test.ts src/lib/onboarding/service.test.ts
~~~

- [ ] **Step 6: Commit the domain state machine.**

~~~bash
git add src/lib/onboarding/constants.ts src/lib/onboarding/types.ts src/lib/onboarding/schemas.ts src/lib/onboarding/service.ts src/lib/onboarding/*.test.ts
git commit -m "feat: add onboarding state machine"
~~~

### Task 3: Add the explicit DeepSeek structured-output contract

**Files:**
- Create: src/lib/onboarding/model.ts
- Test: src/lib/onboarding/model.test.ts
- Modify: existing AI usage helper only if required to call trackSupportAiUsage

**Interfaces:** Consumes OnboardingField, draft, current question, and user text from Task 2. Produces a validated model result consumed only by applyOnboardingAnswer.

- [ ] **Step 1: Write the provider-id test before implementation.** Mock the AI SDK and assert that onboarding never resolves a plan model or title/icon model.

~~~ts
expect(ONBOARDING_MODEL_ID).toBe("deepseek/deepseek-v4-flash-0731");
expect(getModelById).toHaveBeenCalledWith(ONBOARDING_MODEL_ID);
expect(getOpenRouterProviderOptionsForModel).toHaveBeenCalledWith(
  ONBOARDING_MODEL_ID,
);
~~~

- [ ] **Step 2: Implement the structured output schema and prompt builder.** Use generateText plus Output.object, delimit user text, and constrain extraction to known draft fields.

~~~ts
const onboardingModelOutputSchema = z.object({
  extracted: z.object({
    name: z.string().trim().max(500).nullable().optional(),
    age: z.number().int().nullable().optional(),
    occupation: z.string().trim().max(500).nullable().optional(),
    sport: z.string().trim().max(500).nullable().optional(),
    experience: z.string().trim().max(500).nullable().optional(),
    goal: z.string().trim().max(500).nullable().optional(),
  }),
  currentFieldStatus: z.enum(["accepted", "skipped", "clarify"]),
  clarification: z.string().trim().max(500).nullable(),
  assistantMessage: z.string().trim().min(1).max(1000),
});
~~~

The prompt must say that the server controls order/completion, the assistant must not invent values, and sportOrSchool may fill sport and/or experience depending on whether the user describes sport or school.

- [ ] **Step 3: Implement fallback and usage accounting.** Return the fixed current question with clarify on provider failure/invalid output, log the failure through createLogger, and call trackSupportAiUsage with user id, explicit model id, usage, and provider metadata only.

- [ ] **Step 4: Run model tests and commit.**

~~~bash
bunx vitest run src/lib/onboarding/model.test.ts
git add src/lib/onboarding/model.ts src/lib/onboarding/model.test.ts
git commit -m "feat: add onboarding model contract"
~~~

### Task 4: Expose onboarding APIs and atomically promote the profile

**Files:**
- Create: src/app/api/onboarding/route.ts, src/app/api/onboarding/answer/route.ts, src/app/api/onboarding/edit/route.ts, src/app/api/onboarding/confirm/route.ts
- Modify: src/lib/api/responses.ts only for a shared conflict helper if needed
- Test: matching route.test.ts files and src/app/api/onboarding/route.integration.test.ts

**Interfaces:** Consumes Task 2 service functions and Task 3 model runner. Produces JSON DTOs for Task 6 and stable error codes for Task 5.

- [ ] **Step 1: Write route tests for auth and resume.** GET /api/onboarding must create/resume only a version-1 session for an authenticated incomplete account; signed-out and guest requests must not create an account session.

~~~ts
expect(response.status).toBe(200);
expect(body.currentField).toBe("name");
expect(body.totalSteps).toBe(5);
expect(prisma.onboardingSession.create).toHaveBeenCalledTimes(1);
~~~

- [ ] **Step 2: Implement the read and answer handlers.** Parse with the strict body schema, check expectedStep, invoke applyOnboardingAnswer, and return the projected DTO. Use HTTP 409 with code ONBOARDING_STEP_STALE for a stale step and a retryable 503 with code ONBOARDING_MODEL_UNAVAILABLE for a failed model call; neither may advance state.

~~~ts
return Response.json(
  { code: "ONBOARDING_MODEL_UNAVAILABLE", error: "Riprova tra poco." },
  { status: 503 },
);
~~~

- [ ] **Step 3: Implement edit and test review behavior.** POST /api/onboarding/edit accepts only one OnboardingField; it rejects unknown fields and completed accounts, resets the chosen field, and returns the resumed DTO. Assert that the fifth accepted/skipped field produces REVIEW, never completion.

- [ ] **Step 4: Write the confirmation transaction test.** Mock a session in REVIEW, run confirmation, and assert profile promotion plus the account stamp in one transaction; assert a second confirmation cannot update the profile again.

~~~ts
expect(prisma.$transaction).toHaveBeenCalled();
expect(profileUpdate).toMatchObject({ age: 29, occupation: "Designer" });
expect(userUpdateMany).toHaveBeenCalledWith(
  expect.objectContaining({
    where: { id: "user-1", onboardingCompletedAt: null },
  }),
);
~~~

- [ ] **Step 5: Implement confirmOnboarding.** Upsert accepted name, age, occupation, sport, experience, and goal; leave skipped fields’ existing non-null values untouched; never write birthday, notes, preferences, or raw transcript into Profile. Set onboardingCompletedAt with a conditional updateMany and reject when the affected-row count is zero. Revalidate user-auth, profile context, and user-context prompt caches after success.

~~~ts
const stamped = await tx.user.updateMany({
  where: { id: userId, onboardingCompletedAt: null },
  data: { onboardingCompletedAt: new Date() },
});
if (stamped.count !== 1) throw new OnboardingAlreadyCompleteError();
~~~

- [ ] **Step 6: Run route and integration tests, then commit.**

~~~bash
bunx vitest run src/app/api/onboarding
git add src/app/api/onboarding src/lib/api/responses.ts
git commit -m "feat: add onboarding api"
~~~

### Task 5: Add the server-side onboarding gate and safe signup continuation

**Files:**
- Create: src/lib/onboarding/gate.ts, src/lib/onboarding/gate.test.ts
- Modify: src/lib/auth.ts, src/lib/auth-continuation.ts, src/app/(chat)/chat/layout.tsx, src/app/(chat)/chat/[id]/page.tsx, src/app/(marketing)/profile/[[...rest]]/page.tsx, src/app/(marketing)/channels/page.tsx, src/app/organization/[[...rest]]/page.tsx, src/app/(admin)/admin/layout.tsx
- Modify: registered product API routes and src/lib/channels/web/chat-route-handler.ts listed below
- Test: affected page/API/auth tests and continuation tests

**Interfaces:** Consumes AuthUser.onboardingCompletedAt from src/lib/auth.ts. Produces page redirect and API conflict helpers used by Tasks 4 and 6.

- [ ] **Step 1: Extend cached and direct auth selects.** Add onboardingCompletedAt to AuthUser, getCachedUserByClerkId, the direct fallback select, and the create select. Convert the cached date just like createdAt; do not make getAuthUser redirect or return an onboarding error by default.

~~~ts
export interface AuthUser {
  // existing fields...
  onboardingCompletedAt: Date | null;
}
~~~

- [ ] **Step 2: Write gate helper tests.** Cover completed account, incomplete account, guest, signed-out, same-origin continuation, and malicious values such as https://example.com, //example.com, backslashes, encoded control characters, and an unsafe nested next.

~~~ts
expect(buildOnboardingEntry("/chat/thread_1")).toBe(
  "/onboarding?next=%2Fchat%2Fthread_1",
);
expect(safeOnboardingNext("https://example.com")).toBe("/chat");
~~~

- [ ] **Step 3: Implement gate.ts.** Provide requireCompletedOnboardingPage(user, nextPath) for server components and onboardingRequiredResponse(nextPath) for APIs. Pages redirect to /onboarding?next=encodedPath; APIs return HTTP 409 and { code: "ONBOARDING_REQUIRED", redirectTo: "/onboarding", next: safePath }. Permit onboarding endpoints, guest routes, auth/session recovery, webhooks, health, logout, and account deletion/recovery where existing behavior requires it.

- [ ] **Step 4: Gate the page boundaries.** In chat layout/conversation page, profile, channels, organization, and admin layout, run the page helper before loading product data. Keep the existing signed-out and admin redirects. Include the conversation id in the chat next path so guest conversion resumes the original chat.

- [ ] **Step 5: Gate all registered product APIs before side effects.** Add the helper to src/app/api/chats/**, src/app/api/chat/** (including messages, feedback, search, export, voice and warmup), src/app/api/coaching/**, src/app/api/coaching-context/**, src/app/api/preferences, src/app/api/usage, src/app/api/upload, src/app/api/channels/**, src/app/api/rag/search, GET /api/user/me, and model-comparison voting. Leave DELETE /api/user/me available for account deletion/recovery. In handleWebChatPost, check completion immediately after authenticated Clerk identity and before body/rate-limit/chat/model work. Keep /api/onboarding/*, /api/guest/*, auth/session routes, webhooks, health, and account deletion exempt.

- [ ] **Step 6: Update signup/OAuth entry and test it.** Add /onboarding to the safe continuation allowlist, build /onboarding?next=encodedPath for signup completion in SignUpFlow and signup OAuth callback, and validate the nested next on the onboarding page. Existing signed-in users may pass through the route and immediately continue to their safe destination.

~~~ts
export function buildOnboardingEntry(continuation: string): string {
  return "/onboarding?next=" + encodeURIComponent(
    getSafeAuthContinuation(continuation),
  );
}
~~~

- [ ] **Step 7: Run gate/auth regression tests and commit.**

~~~bash
bunx vitest run src/lib/onboarding/gate.test.ts src/lib/auth.test.ts src/lib/auth-continuation.test.ts "src/app/(chat)" src/app/api/chats src/app/api/chat
git add src/lib/onboarding/gate.ts src/lib/onboarding/gate.test.ts src/lib/auth.ts src/lib/auth-continuation.ts src/app src/lib/channels/web/chat-route-handler.ts
git commit -m "feat: enforce onboarding before product access"
~~~

### Task 6: Build the isolated, animated onboarding route

**Files:**
- Create: src/app/(onboarding)/onboarding/page.tsx, src/app/(onboarding)/onboarding/loading.tsx, src/app/(onboarding)/onboarding/onboarding-client.tsx
- Create: focused components under src/app/(onboarding)/onboarding/components/
- Test: src/app/(onboarding)/onboarding/onboarding-client.test.tsx and component behavior tests

**Interfaces:** Consumes OnboardingSessionDto and API codes from Tasks 2 and 4. Produces navigation to the safe continuation or /chat after confirmation.

- [ ] **Step 1: Write the initial render test.** Mock GET /api/onboarding and assert no sidebar, the first Anthon question, 1 di 5, fixed composer, skip action, and the profile-in-construction panel.

~~~ts
expect(screen.getByText("Come vuoi che ti chiami?")).toBeInTheDocument();
expect(screen.getByText("1 di 5")).toBeInTheDocument();
expect(screen.queryByRole("navigation", { name: /chat/i })).toBeNull();
~~~

- [ ] **Step 2: Implement the server page and isolated client shell.** Load the DTO server-side, redirect completed users, pass a validated safe next, and keep the route outside src/app/(chat)/chat/layout.tsx.

- [ ] **Step 3: Implement the five ordered messages and composer.** Render Anthon left/user right, a fixed bottom textarea, contextual skip button, submit-on-enter with Shift+Enter newline, focus restoration, aria-live reading status, and authoritative DTO reconciliation. Keep the user bubble immediate while the API is pending; on failure preserve a retryable local state without advancing the server session.

- [ ] **Step 4: Implement the animated draft panel and review.** Show accepted/skipped values as labeled chips, distribute multi-field chips sequentially, allow Modifica, return to the first unresolved field, and show the final summary with only Conferma e inizia as completion action.

- [ ] **Step 5: Add motion and reduced-motion behavior.** Use the existing MotionProvider, m, AnimatePresence, layout transitions, interruptible springs, and useReducedMotion. Replace springs/movement with short fades/static states when reduced motion is requested; never delay input, retry, or confirmation.

~~~tsx
const prefersReducedMotion = useReducedMotion();
const transition = prefersReducedMotion
  ? { duration: 0.12 }
  : { type: "spring", stiffness: 420, damping: 32 };
~~~

- [ ] **Step 6: Add behavior/accessibility tests and browser verification.** Test skip, clarification, reading state, retry, multi-field chips, edit/review, keyboard interaction, reload/resume, responsive panel mode, reduced-motion fallback, and final redirect. Use the T3 preview/dev server for one real browser pass.

~~~bash
bunx vitest run "src/app/(onboarding)/onboarding"
~~~

- [ ] **Step 7: Commit the UI.**

~~~bash
git add "src/app/(onboarding)"
git commit -m "feat: add animated onboarding experience"
~~~

### Task 7: Promote and expose age and occupation in Anthon’s profile context

**Files:**
- Modify: src/lib/ai/user-knowledge.ts, src/lib/ai/tools/user-context.ts, src/lib/coaching-context.ts, src/app/api/coaching-context/route.ts
- Modify: src/app/(marketing)/profile/components/CoachingContextSection.tsx
- Test: existing coaching-context/profile/user-context tests and new age/occupation cases

**Interfaces:** Consumes promoted Profile data from Task 4. Produces context visible to the first normal chat and editable after completion.

- [ ] **Step 1: Write failing profile schema/API tests.** Assert valid age 29, null/empty normalization, rejection of 0, 121, non-integers, oversized occupation, and unknown fields.

~~~ts
expect(coachingProfilePatchSchema.safeParse({ age: 29 }).success).toBe(true);
expect(coachingProfilePatchSchema.safeParse({ age: 121 }).success).toBe(false);
expect(
  coachingProfilePatchSchema.safeParse({ occupation: "x".repeat(501) }).success,
).toBe(false);
~~~

- [ ] **Step 2: Extend canonical profile updates.** Add age?: number | null and occupation?: string | null to CanonicalProfilePatch, validate at the boundary, and keep Clerk name synchronization unchanged. Do not let background Clerk sync replace a non-empty explicit onboarding name.

- [ ] **Step 3: Extend full and tiny user-context projections.** Add p."age" and p."occupation" to the SQL row type/queries, full tool result, and compact prompt labels. Invalidate the existing user-context prompt caches after onboarding promotion or profile edits.

~~~ts
if (row.profileAge !== null) {
  lines.push("- **Età**: " + row.profileAge + " anni");
}
if (row.profileOccupation) {
  lines.push("- **Lavoro/studio**: " + row.profileOccupation);
}
~~~

- [ ] **Step 4: Extend coaching-context API and editor.** Return and patch age/occupation, add controlled inputs, preserve existing sport/experience/goal behavior, and keep name managed by the existing profile/Clerk surface.

- [ ] **Step 5: Run context/profile tests and commit.**

~~~bash
bunx vitest run src/app/api/coaching-context src/app/"(marketing)"/profile src/lib/ai/tools/user-context* src/lib/ai/user-knowledge*
git add src/lib/ai/user-knowledge.ts src/lib/ai/tools/user-context.ts src/lib/coaching-context.ts src/app/api/coaching-context "src/app/(marketing)/profile"
git commit -m "feat: expose onboarding profile context"
~~~

### Task 8: Add privacy-safe lifecycle telemetry and complete verification

**Files:** src/lib/analytics/funnel.ts, src/lib/analytics/funnel.test.ts, onboarding tests/fixtures.

**Interfaces:** Consumes state transitions from Tasks 2–6. Produces low-cardinality lifecycle events without user content.

- [ ] **Step 1: Write the telemetry contract test.** Assert that event payloads contain only version, step, status, and outcome fields and never include text, draft, profile values, transcript, prompt, or model output.

~~~ts
expect(captureEvent).toHaveBeenCalledWith(
  "onboarding_completed",
  expect.objectContaining({ version: 1, step: 5 }),
);
expect(JSON.stringify(captureEvent.mock.calls)).not.toContain("Giulia");
~~~

- [ ] **Step 2: Emit lifecycle events.** Add onboarding_started, onboarding_step_advanced, onboarding_skipped, onboarding_clarification, onboarding_resumed, onboarding_error, and onboarding_completed; use only aggregate metadata and keep raw answers out of logs and analytics.

- [ ] **Step 3: Run targeted verification.**

~~~bash
bunx prisma validate
bunx prisma generate
bunx vitest run src/lib/onboarding src/app/api/onboarding "src/app/(onboarding)" src/lib/auth.test.ts src/lib/auth-continuation.test.ts src/lib/protected-routes.test.ts
bun run lint
~~~

- [ ] **Step 4: Run the full suite and integration checks.** Use bun run test; run the Neon integration suite when credentials are available. If an external integration is unavailable, report it rather than weakening production code.

- [ ] **Step 5: Perform the browser acceptance pass.** Against a running dev server verify: new account → /onboarding; all five ordered answers including one skip and one multi-field response; reload mid-flow; clarification/retry; review edit; confirmation → /chat; direct chat/API bypass blocked; existing account exempt; guest chat and conversion preserved; reduced-motion UI remains usable.

- [ ] **Step 6: Inspect and commit only the implementation.** Run git diff --check, inspect staged paths for unrelated profiler/benchmark edits, then commit with a conventional message.

~~~bash
git diff --check
git status --short
git commit -m "feat: complete mandatory account onboarding"
~~~
