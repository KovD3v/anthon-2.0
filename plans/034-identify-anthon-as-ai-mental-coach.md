# Plan 034: Identify Anthon honestly as an AI mental coach

> **Executor instructions**: Follow this small plan literally. Anthon remains
> an AI mental coach; do not broaden this into a rebrand, legal rewrite, or
> safety overhaul. The reviewer maintains the plan index.
>
> **Drift check (run first)**:
> `git diff --stat 4f17dd9..HEAD -- src/lib/ai/orchestrator.ts src/lib/ai/orchestrator.test.ts src/app/layout.tsx 'src/app/(marketing)'`
> If prompt assembly or public positioning changed, reconcile before editing.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `4f17dd9`, 2026-07-31

## Why this matters

Public product surfaces correctly call Anthon an AI mental coach. The full and
guest system prompts instead instruct it never to admit being AI and to claim
it is a professional coach. That contradiction is unnecessary and damages
trust. The correction is deliberately minor: align two prompt identities with
the existing product positioning.

## Current state

- `src/app/layout.tsx:40-42` titles the product “Anthon - AI Mental Coach”.
- The help page and footer also describe it as AI-based.
- `src/lib/ai/orchestrator.ts:84-87` says “NEVER say you are an AI” and “You
  are a professional coach.”
- `src/lib/ai/orchestrator.ts:263-266` repeats the denial in the guest prompt.
- Existing safety instructions already prohibit diagnosis and direct serious
  health concerns to healthcare professionals.

## Target contract

- Both full and guest prompts identify Anthon as an AI mental coach focused on
  sports performance.
- Anthon never claims to be human, licensed, or a healthcare professional.
- If asked what it is, it answers plainly that it is an AI mental coach.
- Existing public copy, coaching scope, safety rules, prompt modules, and model
  routing remain unchanged.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Prompt test | `bunx vitest run src/lib/ai/orchestrator.test.ts` | all pass |
| Old-copy search | `rg -n 'NEVER say you are an AI|You are a professional coach' src/lib/ai` | no matches |
| Full gate | `bun run verify` | exit 0 |
| Hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- `src/lib/ai/orchestrator.ts`
- `src/lib/ai/orchestrator.test.ts`

**Out of scope**:

- Marketing, brand name, visual design, or pricing.
- Medical/legal copy, crisis escalation, or safety policy redesign.
- Coach credentials, disclaimers, terms, or consent flows.
- Model routing, RAG, memory, voice, or channel behavior.

## Git workflow

- Branch: `improve/034-transparent-ai-identity`
- Commit: `fix(ai): identify Anthon as an AI mental coach`
- Do not push, merge, or open a PR unless instructed.

## Steps

### Step 1: Add prompt-contract assertions

In `src/lib/ai/orchestrator.test.ts`, use existing captured `streamText`
instructions to assert both an authenticated full-prompt turn and a guest turn:

- contain “AI mental coach”;
- contain an instruction not to claim human/licensed/professional status;
- do not contain the old AI-denial sentence.

Assert behavior through assembled instructions, not by source-file string
inspection alone.

**Verify**:
the focused test fails against the current prompt for the intended reason.

### Step 2: Correct both identity blocks

Replace the full and guest identity wording with one consistent contract:
Anthon is an AI mental coach for sports performance; it helps athletes,
coaches, and parents; it must be transparent if asked; it must not claim to be
human, licensed, or a healthcare professional.

Avoid adding a disclaimer to every answer. This is an identity rule, not a
forced response suffix.

**Verify**:
`bunx vitest run src/lib/ai/orchestrator.test.ts` passes and the old-copy search
returns no matches.

### Step 3: Run repository gates

**Verify**:
`bun run verify && git diff --check` exits 0, and the diff is limited to prompt
identity plus its assertions.

## Test plan

- Authenticated assembled prompt is transparent.
- Guest assembled prompt is transparent.
- Old denial/false professional claim is absent.
- Existing prompt-profile, safety, and tool-policy tests remain green.

## Done criteria

- [ ] Anthon is consistently described as an AI mental coach.
- [ ] It cannot be instructed to deny being AI or impersonate a professional.
- [ ] No unrelated product copy or safety behavior changed.
- [ ] Focused and full verification pass.

## STOP conditions

- Public positioning no longer describes Anthon as AI.
- Prompt identity is now owned by a remote prompt/configuration not covered by
  this repository.
- The requested change would require a wider legal or clinical policy decision.
- Verification fails twice after a reasonable correction.

## Maintenance notes

Keep the identity contract shared or covered across every prompt profile so a
new compact/guest/channel prompt cannot silently reintroduce contradictory
claims.
