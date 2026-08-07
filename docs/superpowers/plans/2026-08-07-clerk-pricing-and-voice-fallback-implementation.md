# Clerk Pricing and Voice Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Localize voice-unavailability UX, add a durable pricing CTA to ineligible voice responses, and publish current plan benefits directly in Clerk.

**Architecture:** Clerk `PricingTable` remains the only commercial-plan renderer. Prisma voice metadata is projected into the existing chat DTO so `MessageList` can render a normal Next.js link without injecting markup into assistant text.

**Tech Stack:** Next.js 16.3, React 19, TypeScript, Prisma, Clerk Billing, Vitest, Testing Library, Biome.

## Global Constraints

- Clerk owns customer-facing plan names, prices, descriptions, features, billing periods, and purchase actions.
- Do not present trial as a fourth plan or add a custom pricing comparison.
- Do not change prices, quotas, routing, entitlements, synchronization timing, or trial policy.
- Preserve persisted `metadata.voice.reasonCode`; never inject URLs or Markdown into assistant text.
- Use catalog limits exactly and preserve unrelated work.

## File Structure

- `src/lib/voice/policy.ts` and `.test.ts`: Italian fallback copy.
- `src/types/chat.ts`, `src/lib/chat.ts`, and `src/lib/chat.test.ts`: persisted reason-code DTO projection.
- `src/app/(chat)/components/MessageList.tsx` and behavior test: durable `/pricing` CTA.
- Clerk Billing dashboard: Italian Basic, Basic Plus, and Pro benefits.

---

### Task 1: Localize voice-unavailability policy

**Files:**
- Modify: `src/lib/voice/policy.ts`
- Test: `src/lib/voice/policy.test.ts`

**Interfaces:**
- Consumes and preserves: `getVoiceUnavailability(code: VoiceUnavailableCode): VoiceUnavailability`.
- Produces: stable Italian `userMessage` strings.

- [ ] **Step 1: Write failing tests**

Assert the exact messages:

```ts
expect(getVoiceUnavailability("PLAN_NOT_ELIGIBLE").userMessage).toBe(
  "Ho ricevuto e trascritto il tuo messaggio vocale. Le risposte vocali non sono ancora disponibili durante la prova, quindi ti rispondo in testo.",
);
expect(getVoiceUnavailability("QUIET_MODE").userMessage).toBe(
  "Le risposte vocali sono disattivate nelle tue preferenze, quindi ti rispondo in testo.",
);
expect(getVoiceUnavailability("PROVIDER_UNAVAILABLE").userMessage).toBe(
  "Le risposte vocali non sono temporaneamente disponibili, quindi ti rispondo in testo.",
);
expect(getVoiceUnavailability("QUOTA_REACHED").userMessage).toBe(
  "Hai raggiunto il limite attuale di risposte vocali, quindi ti rispondo in testo.",
);
```

- [ ] **Step 2: Verify RED**

Run `bunx vitest run src/lib/voice/policy.test.ts`; expect failures against English copy.

- [ ] **Step 3: Implement minimal copy change**

Replace only the four values in `getVoiceUnavailability`; keep codes and return shape unchanged.

- [ ] **Step 4: Verify GREEN and commit**

Run `bunx vitest run src/lib/voice/policy.test.ts src/lib/voice/decision.test.ts src/lib/voice/preflight.test.ts`, then commit with `fix(voice): localize unavailable response copy`.

### Task 2: Expose persisted ineligibility in the chat DTO

**Files:**
- Modify: `src/types/chat.ts`
- Modify: `src/lib/chat.ts`
- Test: `src/lib/chat.test.ts`

**Interfaces:**
- Consumes: unknown Prisma JSON at `Message.metadata.voice.reasonCode`.
- Produces: optional `reasonCode` and optional `status` on `ChatMessage.voice`.

- [ ] **Step 1: Write a failing persisted-message test**

Use a text assistant fixture with no voice job and:

```ts
metadata: { voice: { category: "VOICE_REQUIRED", reasonCode: "PLAN_NOT_ELIGIBLE" } },
```

Assert:

```ts
expect(result?.messages[0]?.voice).toEqual({
  isExplicitRequest: true,
  reasonCode: "PLAN_NOT_ELIGIBLE",
});
```

- [ ] **Step 2: Verify RED**

Run `bunx vitest run src/lib/chat.test.ts`; expect `voice` to be missing.

- [ ] **Step 3: Implement safe metadata projection**

Add this narrow parser:

```ts
function getVoiceReasonCode(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const voice = (metadata as { voice?: unknown }).voice;
  if (!voice || typeof voice !== "object") return undefined;
  const reasonCode = (voice as { reasonCode?: unknown }).reasonCode;
  return typeof reasonCode === "string" ? reasonCode : undefined;
}
```

Make `ChatMessage.voice.status` optional and emit `voice` when either a job or reason code exists, preserving job error and explicit-request detection.

- [ ] **Step 4: Verify GREEN and commit**

Run `bunx vitest run src/lib/chat.test.ts src/lib/chat-client.test.ts`, then commit with `feat(chat): expose persisted voice fallback reason`.

### Task 3: Render the durable pricing CTA

**Files:**
- Modify: `src/app/(chat)/components/MessageList.tsx`
- Test: `src/app/(chat)/components/MessageList.behavior.test.tsx`

**Interfaces:**
- Consumes: `message.voice?.reasonCode`.
- Produces: `Scopri i piani` linking to `/pricing` only for `PLAN_NOT_ELIGIBLE`.

- [ ] **Step 1: Write failing UI tests**

Render an assistant message with `voice: { reasonCode: "PLAN_NOT_ELIGIBLE", isExplicitRequest: true }`. Assert the named link has `/pricing`; assert a normal assistant message has no such link.

- [ ] **Step 2: Verify RED**

Run `bunx vitest run 'src/app/(chat)/components/MessageList.behavior.test.tsx'`; expect the link lookup to fail.

- [ ] **Step 3: Implement the CTA**

Import `Link` from `next/link` and render below assistant Markdown:

```tsx
<Link
  href="/pricing"
  className="mt-3 inline-flex border-black/10 border-t pt-3 text-xs font-semibold text-black underline underline-offset-4"
>
  Scopri i piani
</Link>
```

Gate it with `message.voice?.reasonCode === "PLAN_NOT_ELIGIBLE"`.

- [ ] **Step 4: Verify GREEN, inspect, and commit**

Run the behavior test, `src/lib/chat.test.ts`, and `src/lib/chat-client.test.ts`. Then run the Impeccable detector once on `MessageList.tsx`, resolve only new findings, and commit with `feat(chat): link voice trial fallback to pricing`.

### Task 4: Configure Clerk plan benefits

**Files:**
- Modify externally: Clerk Billing plans `Basic`, `Basic Plus`, `Pro`
- Verify: `src/lib/plans/catalog.ts` and `/pricing`

**Interfaces:**
- Consumes: exact catalog limits.
- Produces: ordered Italian Clerk features.

- [ ] **Step 1: Confirm the Clerk instance**

Use an existing authenticated browser session. Match the dashboard instance to the app publishable-key environment without printing credentials; do not edit an unmatched instance.

- [ ] **Step 2: Configure the same ordered feature categories**

```text
Basic
50 richieste AI al giorno
Contesto fino a 15 messaggi
25 upload al giorno, fino a 250 MB
Allegati conservati per 30 giorni
Fino a 10 risposte vocali ogni 12 ore

Basic Plus
50 richieste AI al giorno
Contesto fino a 30 messaggi
50 upload al giorno, fino a 500 MB
Allegati conservati per 60 giorni
Fino a 20 risposte vocali ogni 12 ore

Pro
100 richieste AI al giorno
Contesto fino a 100 messaggi
100 upload al giorno, fino a 2 GB
Allegati conservati per 180 giorni
Fino a 50 risposte vocali ogni 36 ore
```

- [ ] **Step 3: Verify saved external state**

Reload all three plans; confirm names, prices, periods, and feature order. Record no secrets or billing data.

### Task 5: Full verification

**Files:**
- Verify all scoped files and Clerk state.

**Interfaces:**
- Produces: release-ready evidence for chat fallback and pricing.

- [ ] **Step 1: Run gates**

Run focused tests, `bun run lint`, `bun run test`, and `git diff --check`.

- [ ] **Step 2: Run Next.js runtime checks**

Start or reuse `bun run dev`. Confirm Next.js 16.3, Turbopack, `/_next/mcp`, `get_compilation_issues`, and route health with `next-dev-loop`.

- [ ] **Step 3: Verify browser UX**

Using T3 preview first, verify `/pricing` on desktop and mobile: exactly three Clerk cards, Italian features, no trial card or duplicate matrix, working billing controls. Verify a persisted `PLAN_NOT_ELIGIBLE` chat response shows Italian copy and the pricing link before and after refresh.

- [ ] **Step 4: Commit verification fixes**

Stage only scoped files, use a conventional commit, and leave the unrelated context-aware RAG plan untouched.
