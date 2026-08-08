# Chat Title and Icon Model Eval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a stable Italian conversation title and a model-selected icon, persist both, render the icon in the sidebar and header, and choose the metadata model through a reproducible three-model mini-eval.

**Architecture:** A dependency-light shared module owns the closed icon vocabulary and runtime normalizer, while an AI-only contract owns the structured-output schema, prompt, and context builder. A reproducible OpenRouter eval selects the exact metadata model before the production generator is changed. Prisma persists the chosen icon, authenticated and guest APIs serialize it, and one React registry renders the same Lucide component on both UI surfaces.

**Tech Stack:** TypeScript, Next.js 16.3 App Router, React 19, AI SDK 7 `generateText`/`Output.object`, Zod 4, OpenRouter, Prisma/PostgreSQL, Lucide React, Vitest/Testing Library, Biome, Bun.

## Global Constraints

- Evaluate exactly `inclusionai/ling-3.0-flash`, `qwen/qwen3.7-flash`, and `deepseek/deepseek-v4-flash`; never substitute aliases or fallback models silently.
- The winner is used only for conversation metadata generation; do not change the coaching orchestrator or its fallback routing.
- Generate Italian titles of 3-6 words and at most 55 characters.
- Restrict icons to `TARGET`, `TROPHY`, `DUMBBELL`, `ACTIVITY`, `BRAIN`, `HEART_PULSE`, `TIMER`, `CALENDAR_DAYS`, `FLAME`, `SHIELD`, `USERS`, `FOOTPRINTS`, `REFRESH_CCW`, and `MESSAGE_SQUARE`.
- `MESSAGE_SQUARE` is the database default, parsing fallback, and provider-failure fallback.
- Automatic metadata generation runs only at conversation message counts 1, 2, and 4 for chats without a custom title.
- A manual title rename preserves the persisted icon; manual icon editing is outside scope.
- Use only curated, non-sensitive eval fixtures; do not query production conversations.
- Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` before changing route-handler or client-component code.
- Keep unrelated `docs/user-plan-states.md` and `docs/superpowers/plans/2026-08-07-context-aware-rag-implementation.md` changes outside every commit.
- Use `bun run`/`bunx`, Biome, structured logging, test-first implementation, and conventional commits.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/chat-icons.ts` | Closed icon keys, `ChatIcon` type, and dependency-light runtime normalizer shared with client code. |
| `src/lib/ai/chat-metadata-contract.ts` | Zod output schema, prompt, and bounded context construction. |
| `src/lib/ai/chat-metadata-contract.test.ts` | Contract, prompt, and context regression tests. |
| `scripts/evaluate-chat-metadata-models.ts` | Curated 12-scenario, 2-pass OpenRouter runner; validity, latency, usage, cost, and scoring artifacts. |
| `scripts/evaluate-chat-metadata-models.test.ts` | Deterministic scoring, percentile, eligibility, and no-substitution tests. |
| `docs/benchmarks/chat-metadata-model-eval-2026-08-08.json` | Raw attempts, metrics, candidate summaries, and selected exact model ID. |
| `docs/benchmarks/chat-metadata-model-eval-2026-08-08-review.json` | Blinded semantic title/icon review keyed by anonymous attempt ID. |
| `docs/benchmarks/chat-metadata-model-eval-2026-08-08.md` | Human-readable comparison, blinded review, limitations, and decision. |
| `prisma/schema.prisma` and new migration | Persisted `ChatIcon` enum and required `Chat.icon` default. |
| `src/lib/ai/chat-title.ts` | Production structured generation, cleanup, fallback, logging, and usage metering. |
| `src/lib/channels/web/chat-route-handler.ts` | Authenticated automatic generation schedule and atomic metadata persistence. |
| `src/lib/channels/web/guest-chat-route-handler.ts` | Guest automatic generation schedule and atomic metadata persistence. |
| Authenticated and guest chat API routes | Icon selection, serialization, explicit regeneration, and rename preservation. |
| `src/types/chat.ts` | Client-facing `ChatIcon`, `Chat`, and `ChatData` types. |
| `src/app/(chat)/components/ChatIcon.tsx` | Exhaustive Lucide registry and safe renderer. |
| `ChatList.tsx`, `ChatHeader.tsx`, `layout-client.tsx`, `chat-conversation-client.tsx` | Carry and render one persisted icon across sidebar/header and optimistic chat creation. |

---

### Task 1: Build and run the reproducible metadata-model mini-eval

**Files:**
- Create: `src/lib/chat-icons.ts`
- Create: `src/lib/ai/chat-metadata-contract.ts`
- Create: `src/lib/ai/chat-metadata-contract.test.ts`
- Create: `scripts/evaluate-chat-metadata-models.ts`
- Create: `scripts/evaluate-chat-metadata-models.test.ts`
- Create after the run: `docs/benchmarks/chat-metadata-model-eval-2026-08-08.json`
- Create after the run: `docs/benchmarks/chat-metadata-model-eval-2026-08-08-review.json`
- Create after the run: `docs/benchmarks/chat-metadata-model-eval-2026-08-08.md`
- Modify: `package.json`

**Interfaces:**
- Produces from `src/lib/chat-icons.ts`: `CHAT_ICON_KEYS`, `ChatIcon`, and `normalizeChatIcon(value): ChatIcon`.
- Produces from `src/lib/ai/chat-metadata-contract.ts`: `chatMetadataSchema`, `ChatMetadataMessage`, `buildChatMetadataContext(messages, fallbackUserText)`, and `buildChatMetadataPrompt(context)`.
- Produces: an eval report whose `decision.selectedModel` is one of the three exact candidate IDs and whose attempts retain success, validated output, duration, usage, provider metadata, and cost.
- Consumes: `getOpenRouterProviderOptionsForModel(modelId)`, `openrouter(modelId)`, AI SDK `Output.object`, and `extractAIMetrics(...)` for consistent cost extraction.

- [ ] **Step 1: Write failing contract tests**

Create tests that define the exact vocabulary, reject unknown icons, preserve the first user need under a long assistant response, deduplicate the first user turn from the recent slice, and constrain the prompt:

```ts
import { describe, expect, it } from "vitest";
import {
  buildChatMetadataContext,
  buildChatMetadataPrompt,
  chatMetadataSchema,
} from "./chat-metadata-contract";
import { CHAT_ICON_KEYS, normalizeChatIcon } from "@/lib/chat-icons";

describe("chat metadata contract", () => {
  it("accepts only the approved icon vocabulary", () => {
    expect(CHAT_ICON_KEYS).toHaveLength(14);
    expect(chatMetadataSchema.parse({ title: "Reset dopo un errore", icon: "REFRESH_CCW" })).toEqual({
      title: "Reset dopo un errore",
      icon: "REFRESH_CCW",
    });
    expect(() => chatMetadataSchema.parse({ title: "Reset dopo errore", icon: "ROTATE_CW" })).toThrow();
    expect(() => chatMetadataSchema.parse({ title: "Reset immediato", icon: "REFRESH_CCW" })).toThrow();
    expect(normalizeChatIcon("TARGET")).toBe("TARGET");
    expect(normalizeChatIcon("UNKNOWN")).toBe("MESSAGE_SQUARE");
  });

  it("keeps the first user need and bounded recent context", () => {
    const context = buildChatMetadataContext(
      [
        { role: "user", text: "Ho paura di sbagliare il rigore decisivo" },
        { role: "assistant", text: "x".repeat(2_000) },
        { role: "user", text: "Mi serve una routine di trenta secondi" },
      ],
      "Ho paura di sbagliare il rigore decisivo",
    );
    expect(context).toContain("PRIMO BISOGNO UTENTE: Ho paura di sbagliare il rigore decisivo");
    expect(context).toContain("USER: Mi serve una routine di trenta secondi");
    expect(context.length).toBeLessThanOrEqual(1_600);
  });

  it("requires specific Italian titles and the closed icon semantics", () => {
    const prompt = buildChatMetadataPrompt("USER: Voglio preparare la maratona");
    expect(prompt).toContain("3-6 parole");
    expect(prompt).toContain("massimo 55 caratteri");
    expect(prompt).toContain("MESSAGE_SQUARE");
    expect(prompt).toContain("Evita titoli generici");
  });
});
```

- [ ] **Step 2: Run the contract tests and verify RED**

Run: `bunx vitest run src/lib/ai/chat-metadata-contract.test.ts`

Expected: FAIL because `chat-metadata-contract.ts` and its exports do not exist.

- [ ] **Step 3: Implement the shared contract minimally**

Create the tuple, inferred type, schema, and bounded context builder. Use schema length constraints for the hard character limit while the prompt carries the 3-6-word semantic requirement:

```ts
export const CHAT_ICON_KEYS = [
  "TARGET", "TROPHY", "DUMBBELL", "ACTIVITY", "BRAIN", "HEART_PULSE",
  "TIMER", "CALENDAR_DAYS", "FLAME", "SHIELD", "USERS", "FOOTPRINTS",
  "REFRESH_CCW", "MESSAGE_SQUARE",
] as const;

export type ChatIcon = (typeof CHAT_ICON_KEYS)[number];
export function normalizeChatIcon(value: unknown): ChatIcon {
  return typeof value === "string" &&
    (CHAT_ICON_KEYS as readonly string[]).includes(value)
    ? (value as ChatIcon)
    : "MESSAGE_SQUARE";
}
```

In `chat-metadata-contract.ts`, import the tuple and type, then define:

```ts
import { z } from "zod";
import { CHAT_ICON_KEYS } from "@/lib/chat-icons";

export type ChatMetadataMessage = { role: "user" | "assistant"; text: string };

export const chatMetadataSchema = z.object({
  title: z.string().trim().min(1).max(55).refine((value) => {
    const words = value.split(/\s+/).filter(Boolean).length;
    return words >= 3 && words <= 6;
  }, "title must contain 3-6 words"),
  icon: z.enum(CHAT_ICON_KEYS),
});

export function buildChatMetadataContext(
  messages: readonly ChatMetadataMessage[],
  fallbackUserText: string,
): string {
  const compact = (value: string) => value.replace(/\s+/g, " ").trim();
  const firstUserText =
    messages.find((message) => message.role === "user" && compact(message.text))
      ?.text ?? fallbackUserText;
  const first = compact(firstUserText).slice(0, 1_520).trimEnd();
  const prefix = `PRIMO BISOGNO UTENTE: ${first}`;
  const selected: string[] = [];
  let remaining = Math.max(0, 1_600 - prefix.length - 1);

  for (const message of [...messages].reverse()) {
    const text = compact(message.text);
    if (!text || (message.role === "user" && text === first)) continue;
    const line = `${message.role.toUpperCase()}: ${text}`;
    if (line.length <= remaining) {
      selected.push(line);
      remaining -= line.length + 1;
      continue;
    }
    if (remaining >= 40) selected.push(line.slice(0, remaining).trimEnd());
    break;
  }

  return [prefix, ...selected.reverse()].filter(Boolean).join("\n");
}

export function buildChatMetadataPrompt(context: string): string {
  return `Genera i metadati di una conversazione di coaching in italiano.
Il titolo deve avere 3-6 parole, massimo 55 caratteri, senza virgolette, emoji,
etichette o punteggiatura finale. Descrivi il bisogno, la decisione, l'evento o
l'esito concreto dell'utente. Evita titoli generici come Conversazione,
Supporto, Coaching o Nuova chat quando esiste un tema specifico.

Scegli una sola icona:
TARGET obiettivi e focus; TROPHY gara e risultati; DUMBBELL forza e allenamento;
ACTIVITY prestazione, carico e recupero; BRAIN mentalita e abilita mentali;
HEART_PULSE salute, dolore e segnali fisici; TIMER ritmo e pressione temporale;
CALENDAR_DAYS programmi e pianificazione; FLAME motivazione; SHIELD sicurezza e
fiducia; USERS coach, squadra e relazioni; FOOTPRINTS corsa e progressione;
REFRESH_CCW reset e ripartenza; MESSAGE_SQUARE solo per un tema davvero vago.

Contesto:
${context}`;
}
```

The complete prompt must document all 14 icon meanings and explicitly ban `Conversazione`, `Supporto`, `Coaching`, and `Nuova chat` when a concrete topic is available.

- [ ] **Step 4: Run the contract tests and verify GREEN**

Run: `bunx vitest run src/lib/ai/chat-metadata-contract.test.ts`

Expected: PASS with all contract tests green.

- [ ] **Step 5: Write failing eval/scoring tests**

Export pure scoring helpers from the eval script and test that invalid attempts lose reliability, zero-success candidates are ineligible, p50/p95 use successful positive-duration attempts, icon acceptance is fixture-specific, and the exact candidate list cannot be overridden by aliases:

```ts
it("rejects a candidate with no successful positive-duration output", () => {
  expect(summarizeCandidate("qwen/qwen3.7-flash", [
    failedAttempt("qwen/qwen3.7-flash", "schema_error", 120),
  ]).eligible).toBe(false);
});

it("scores accepted icons without treating neutral fallback as universally correct", () => {
  expect(scoreIcon("pre_competition_pressure", "TROPHY")).toBe(1);
  expect(scoreIcon("pre_competition_pressure", "MESSAGE_SQUARE")).toBe(0);
  expect(scoreIcon("vague_opening", "MESSAGE_SQUARE")).toBe(1);
});

it("pins the exact requested candidates", () => {
  expect(EVAL_MODELS).toEqual([
    "inclusionai/ling-3.0-flash",
    "qwen/qwen3.7-flash",
    "deepseek/deepseek-v4-flash",
  ]);
});
```

- [ ] **Step 6: Run the eval tests and verify RED**

Run: `bunx vitest run scripts/evaluate-chat-metadata-models.test.ts`

Expected: FAIL because the runner and scoring exports do not exist.

- [ ] **Step 7: Implement the eval runner**

Define these 12 non-sensitive fixtures. `conceptGroups` contains alternatives, so a title receives concept credit when it matches at least one term in each relevant group:

```ts
const scenarios: EvalScenario[] = [
  {
    id: "pre_competition_pressure",
    messages: [{ role: "user", text: "Domenica gioco la finale e sento troppa pressione prima di entrare in campo." }],
    fallbackUserText: "Domenica gioco la finale e sento troppa pressione prima di entrare in campo.",
    conceptGroups: [["finale", "gara"], ["pressione", "ansia"]],
    acceptedIcons: ["TROPHY", "BRAIN", "SHIELD"],
    inappropriateIcons: ["CALENDAR_DAYS", "USERS"],
  },
  {
    id: "post_mistake_reset",
    messages: [{ role: "user", text: "Dopo un doppio fallo continuo a pensarci e sbaglio anche il punto successivo. Come resetto?" }],
    fallbackUserText: "Dopo un doppio fallo continuo a pensarci e sbaglio anche il punto successivo. Come resetto?",
    conceptGroups: [["errore", "fallo"], ["reset", "ripartenza"]],
    acceptedIcons: ["REFRESH_CCW", "BRAIN"],
    inappropriateIcons: ["TROPHY", "CALENDAR_DAYS"],
  },
  {
    id: "short_mental_routine",
    messages: [{ role: "user", text: "Costruiamo una routine mentale di trenta secondi prima del servizio." }],
    fallbackUserText: "Costruiamo una routine mentale di trenta secondi prima del servizio.",
    conceptGroups: [["routine"], ["servizio", "trenta secondi"]],
    acceptedIcons: ["BRAIN", "TIMER"],
    inappropriateIcons: ["USERS", "HEART_PULSE"],
  },
  {
    id: "lost_motivation",
    messages: [{ role: "user", text: "Da tre settimane salto gli allenamenti e ho perso completamente la motivazione." }],
    fallbackUserText: "Da tre settimane salto gli allenamenti e ho perso completamente la motivazione.",
    conceptGroups: [["motivazione", "costanza"], ["allenamenti"]],
    acceptedIcons: ["FLAME", "BRAIN"],
    inappropriateIcons: ["TROPHY", "USERS"],
  },
  {
    id: "weekly_training_plan",
    messages: [{ role: "user", text: "Organizziamo i miei tre allenamenti della prossima settimana senza sovraccaricarmi." }],
    fallbackUserText: "Organizziamo i miei tre allenamenti della prossima settimana senza sovraccaricarmi.",
    conceptGroups: [["settimana", "settimanale"], ["allenamenti", "piano"]],
    acceptedIcons: ["CALENDAR_DAYS", "DUMBBELL", "ACTIVITY"],
    inappropriateIcons: ["TROPHY", "USERS"],
  },
  {
    id: "injury_safety_warning",
    messages: [{ role: "user", text: "Durante la corsa sento un dolore acuto al ginocchio e aumenta a ogni passo." }],
    fallbackUserText: "Durante la corsa sento un dolore acuto al ginocchio e aumenta a ogni passo.",
    conceptGroups: [["ginocchio", "dolore"], ["corsa"]],
    acceptedIcons: ["HEART_PULSE", "SHIELD", "ACTIVITY"],
    inappropriateIcons: ["FLAME", "TROPHY"],
  },
  {
    id: "talk_with_coach",
    messages: [{ role: "user", text: "Mi vergogno a dire al coach che dopo le sconfitte mi sento senza valore." }],
    fallbackUserText: "Mi vergogno a dire al coach che dopo le sconfitte mi sento senza valore.",
    conceptGroups: [["coach", "allenatore"], ["parlare", "confronto", "vergogna"]],
    acceptedIcons: ["USERS", "BRAIN", "SHIELD"],
    inappropriateIcons: ["TIMER", "CALENDAR_DAYS"],
  },
  {
    id: "team_dynamics",
    messages: [{ role: "user", text: "In squadra ci accusiamo dopo ogni errore e voglio ricostruire fiducia tra compagni." }],
    fallbackUserText: "In squadra ci accusiamo dopo ogni errore e voglio ricostruire fiducia tra compagni.",
    conceptGroups: [["squadra", "compagni"], ["fiducia"]],
    acceptedIcons: ["USERS", "SHIELD"],
    inappropriateIcons: ["FOOTPRINTS", "TIMER"],
  },
  {
    id: "race_pace_timing",
    messages: [{ role: "user", text: "Parto troppo forte nei dieci chilometri e crollo nel finale: devo gestire il ritmo." }],
    fallbackUserText: "Parto troppo forte nei dieci chilometri e crollo nel finale: devo gestire il ritmo.",
    conceptGroups: [["ritmo", "passo"], ["dieci chilometri", "10 km"]],
    acceptedIcons: ["TIMER", "FOOTPRINTS"],
    inappropriateIcons: ["USERS", "DUMBBELL"],
  },
  {
    id: "running_goal",
    messages: [{ role: "user", text: "Voglio correre la mia prima mezza maratona sotto le due ore a ottobre." }],
    fallbackUserText: "Voglio correre la mia prima mezza maratona sotto le due ore a ottobre.",
    conceptGroups: [["mezza maratona"], ["due ore", "ottobre"]],
    acceptedIcons: ["FOOTPRINTS", "TARGET", "TIMER"],
    inappropriateIcons: ["USERS", "DUMBBELL"],
  },
  {
    id: "confidence_after_loss",
    messages: [{ role: "user", text: "Dopo la sconfitta di ieri non mi fido piu dei miei colpi importanti." }],
    fallbackUserText: "Dopo la sconfitta di ieri non mi fido piu dei miei colpi importanti.",
    conceptGroups: [["fiducia", "sicurezza"], ["sconfitta"]],
    acceptedIcons: ["SHIELD", "BRAIN", "REFRESH_CCW"],
    inappropriateIcons: ["CALENDAR_DAYS", "USERS"],
  },
  {
    id: "vague_opening",
    messages: [{ role: "user", text: "Ciao, possiamo parlare un attimo?" }],
    fallbackUserText: "Ciao, possiamo parlare un attimo?",
    conceptGroups: [["parlare", "confronto"]],
    acceptedIcons: ["MESSAGE_SQUARE"],
    inappropriateIcons: ["TROPHY", "HEART_PULSE", "DUMBBELL"],
  },
];
```

For every model, scenario, and pass, call:

```ts
const result = await generateText({
  model: openrouter(modelId),
  output: Output.object({ schema: chatMetadataSchema }),
  temperature: 0.2,
  maxOutputTokens: 80,
  maxRetries: 0,
  timeout: { totalMs: timeoutMs },
  providerOptions: {
    openrouter: {
      ...getOpenRouterProviderOptionsForModel(modelId),
      provider: { require_parameters: true },
    },
  },
  prompt: buildChatMetadataPrompt(
    buildChatMetadataContext(scenario.messages, scenario.fallbackUserText),
  ),
});
```

Alternate model ordering between attempts. Record failures instead of aborting the full run. Calculate title deterministic score from schema validity, word count, banned-generic terms, and required-concept coverage; calculate icon score from the fixture sets; calculate reliability over all attempts. Normalize eligible candidates for title 50%, icon 25%, reliability 15%, lower latency 7%, and lower cost 3%. Never rank an ineligible candidate.

Add `"eval:chat-metadata": "bun run scripts/evaluate-chat-metadata-models.ts"` to `package.json`. Accept `--runs 2`, `--timeout-ms`, `--output-json`, and `--output-md`; reject a `--models` argument so the exact comparison cannot drift.

- [ ] **Step 8: Run the eval tests and verify GREEN**

Run: `bunx vitest run scripts/evaluate-chat-metadata-models.test.ts src/lib/ai/chat-metadata-contract.test.ts`

Expected: PASS; the tests perform no live OpenRouter calls.

- [ ] **Step 9: Execute the 72-call eval and validate the artifact**

Run:

```bash
bun run eval:chat-metadata --runs 2 --timeout-ms 15000 \
  --output-json docs/benchmarks/chat-metadata-model-eval-2026-08-08.json \
  --output-md docs/benchmarks/chat-metadata-model-eval-2026-08-08.md
```

Expected: 24 attempts per exact model, 72 total. The command must exit non-zero before writing a winner if every candidate is ineligible. Inspect failures for provider policy or unsupported structured output and verify every successful duration is positive.

- [ ] **Step 10: Complete blinded semantic review and finalize the decision**

Export anonymous attempt IDs, context, title, and icon without model identity to `docs/benchmarks/chat-metadata-model-eval-2026-08-08-review.json`. Review those rows, adding `titleScore` from 0-1, `iconScore` from 0-1, and a one-sentence `note`; then rerun the pure report aggregation against that completed review file. The final JSON must contain:

```json
{
  "decision": {
    "selectedModel": "one exact ID from EVAL_MODELS",
    "reason": "quality, icon fit, reliability, Italy latency, and cost summary"
  }
}
```

Confirm with:

```bash
bun -e 'const r = await Bun.file("docs/benchmarks/chat-metadata-model-eval-2026-08-08.json").json(); if (!r.decision?.selectedModel) process.exit(1); console.log(r.decision.selectedModel)'
```

Expected: exactly one of the three requested IDs, with no alias.

- [ ] **Step 11: Commit the eval contract, runner, and evidence**

```bash
git add package.json src/lib/chat-icons.ts src/lib/ai/chat-metadata-contract.ts src/lib/ai/chat-metadata-contract.test.ts scripts/evaluate-chat-metadata-models.ts scripts/evaluate-chat-metadata-models.test.ts docs/benchmarks/chat-metadata-model-eval-2026-08-08.json docs/benchmarks/chat-metadata-model-eval-2026-08-08-review.json docs/benchmarks/chat-metadata-model-eval-2026-08-08.md
git diff --cached --check
git commit -m "test(ai): evaluate chat metadata models"
```

### Task 2: Persist the closed icon enum and expose shared client types

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260808140000_add_chat_icon/migration.sql`
- Modify: `prisma/migrations.test.ts`
- Modify: `src/types/chat.ts`

**Interfaces:**
- Consumes: `ChatIcon` vocabulary from `src/lib/chat-icons.ts` as the semantic source of truth.
- Produces: Prisma `ChatIcon` enum, `Chat.icon: ChatIcon @default(MESSAGE_SQUARE)`, and client `ChatData.icon`/`Chat.icon` fields.

- [ ] **Step 1: Write failing migration/type tests**

Add migration assertions:

```ts
it("creates the ChatIcon enum and a required Chat.icon fallback", () => {
  const sql = allMigrationSql();
  expect(sql).toMatch(/CREATE TYPE "ChatIcon" AS ENUM/);
  expect(sql).toMatch(/ADD COLUMN "icon" "ChatIcon" NOT NULL DEFAULT 'MESSAGE_SQUARE'/);
});
```

Add a compile-visible `icon: ChatIcon` requirement to `Chat` and `ChatData`, importing the type from `src/lib/chat-icons.ts`.

- [ ] **Step 2: Run the migration test and verify RED**

Run: `bunx vitest run prisma/migrations.test.ts`

Expected: FAIL because no icon enum/column migration exists.

- [ ] **Step 3: Add the Prisma enum, field, and migration**

Add this enum and field:

```prisma
enum ChatIcon {
  TARGET
  TROPHY
  DUMBBELL
  ACTIVITY
  BRAIN
  HEART_PULSE
  TIMER
  CALENDAR_DAYS
  FLAME
  SHIELD
  USERS
  FOOTPRINTS
  REFRESH_CCW
  MESSAGE_SQUARE
}

// Add this field to the existing model Chat declaration:
icon ChatIcon @default(MESSAGE_SQUARE)
```

Create this additive SQL; do not alter existing titles or `customTitle` values:

```sql
CREATE TYPE "ChatIcon" AS ENUM (
  'TARGET', 'TROPHY', 'DUMBBELL', 'ACTIVITY', 'BRAIN', 'HEART_PULSE',
  'TIMER', 'CALENDAR_DAYS', 'FLAME', 'SHIELD', 'USERS', 'FOOTPRINTS',
  'REFRESH_CCW', 'MESSAGE_SQUARE'
);

ALTER TABLE "Chat"
ADD COLUMN "icon" "ChatIcon" NOT NULL DEFAULT 'MESSAGE_SQUARE';
```

- [ ] **Step 4: Validate and generate Prisma artifacts**

Run:

```bash
bunx prisma validate
bunx prisma generate
bunx vitest run prisma/migrations.test.ts
```

Expected: schema valid, client generated, migration test PASS.

- [ ] **Step 5: Commit persistence and types**

```bash
git add prisma/schema.prisma prisma/migrations/20260808140000_add_chat_icon/migration.sql prisma/migrations.test.ts src/types/chat.ts src/generated/prisma
git diff --cached --check
git commit -m "feat(chat): persist conversation icons"
```

If `src/generated/prisma` is ignored or generation creates no tracked diff, omit it from `git add` and report that explicitly.

### Task 3: Replace title-only generation with validated conversation metadata

**Files:**
- Modify: `src/lib/ai/chat-title.ts`
- Modify: `src/lib/ai/chat-title.test.ts`

**Interfaces:**
- Consumes: eval artifact `decision.selectedModel`, `chatMetadataSchema`, `buildChatMetadataContext`, and `buildChatMetadataPrompt`.
- Produces: `generateChatMetadata(messages, fallbackUserText, options?): Promise<{ title: string; icon: ChatIcon }>`.
- Preserves: local cleanup and usage metering, now keyed to the exact selected model.

- [ ] **Step 1: Write failing structured-generation tests**

Change the AI SDK mock to expose `Output.object` and make `generateText` return `output`. Cover selected model, structured output, cleanup, metering, and all fallback branches:

```ts
import { readFileSync } from "node:fs";

const selectedModelFromEval = JSON.parse(
  readFileSync(
    "docs/benchmarks/chat-metadata-model-eval-2026-08-08.json",
    "utf8",
  ),
).decision.selectedModel;

it("returns cleaned structured metadata and meters the selected model", async () => {
  mocks.generateText.mockResolvedValue({
    output: { title: '"Titolo: Reset dopo un errore!!!"', icon: "REFRESH_CCW" },
    usage: { inputTokens: 40, outputTokens: 8 },
    providerMetadata: { openrouter: { usage: { cost: 0.0001 } } },
  });

  await expect(generateChatMetadata(
    [{ role: "user", text: "Ho sbagliato il rigore, devo resettare" }],
    "Ho sbagliato il rigore, devo resettare",
    { userId: "user-1" },
  )).resolves.toEqual({ title: "Reset dopo un errore", icon: "REFRESH_CCW" });

  expect(mocks.trackSupportAiUsage).toHaveBeenCalledWith(
    expect.objectContaining({ modelId: selectedModelFromEval }),
  );
});
```

Add separate tests for provider rejection, schema rejection, empty cleaned title, overlong word-boundary cleanup, and invalid icon; every failure returns the first-user fallback title plus `MESSAGE_SQUARE`.

- [ ] **Step 2: Run the generator tests and verify RED**

Run: `bunx vitest run src/lib/ai/chat-title.test.ts`

Expected: FAIL because `generateChatMetadata` and structured `output` handling do not exist.

- [ ] **Step 3: Implement the production generator**

Read `decision.selectedModel` from the committed eval JSON during implementation and copy that exact literal into `CHAT_METADATA_MODEL_ID`. Do not choose by memory or price alone. Implement:

```ts
export async function generateChatMetadata(
  messages: readonly ChatMetadataMessage[],
  fallbackUserText: string,
  options?: { userId?: string },
): Promise<{ title: string; icon: ChatIcon }> {
  try {
    const result = await generateText({
      model: openrouter(CHAT_METADATA_MODEL_ID),
      output: Output.object({ schema: chatMetadataSchema }),
      prompt: buildChatMetadataPrompt(
        buildChatMetadataContext(messages, fallbackUserText),
      ),
      maxOutputTokens: 80,
      temperature: 0.2,
      providerOptions: {
        openrouter: getOpenRouterProviderOptionsForModel(CHAT_METADATA_MODEL_ID),
      },
    });
    const title = cleanupTitle(result.output.title);
    if (!title) return fallbackChatMetadata(fallbackUserText);
    // meter actual selected model when userId is present
    return { title, icon: result.output.icon };
  } catch (error) {
    titleLogger.error("metadata.generation_failed", "Chat metadata generation failed", { error });
    return fallbackChatMetadata(fallbackUserText);
  }
}
```

Keep fallback construction deterministic and never emit a value outside `ChatIcon`.

- [ ] **Step 4: Run the generator tests and verify GREEN**

Run: `bunx vitest run src/lib/ai/chat-title.test.ts src/lib/ai/chat-metadata-contract.test.ts`

Expected: PASS with the eval-selected exact model asserted.

- [ ] **Step 5: Commit structured generation**

```bash
git add src/lib/ai/chat-title.ts src/lib/ai/chat-title.test.ts
git diff --cached --check
git commit -m "feat(ai): generate chat title metadata"
```

### Task 4: Update authenticated and guest automatic generation flows

**Files:**
- Modify: `src/lib/channels/web/chat-route-handler.ts`
- Modify: `src/lib/channels/web/guest-chat-route-handler.ts`
- Modify: `src/app/api/chat/route.test.ts`
- Modify: `src/app/api/guest/chat/route.test.ts`

**Interfaces:**
- Consumes: `generateChatMetadata(messages, fallbackUserText, { userId })`.
- Produces: automatic scheduling only at message counts 1, 2, and 4 and one atomic `{ title, icon }` Prisma update.

- [ ] **Step 1: Read the local Next.js route-handler guide**

Read: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`

Confirm `waitUntil` work remains non-blocking and route responses are unchanged.

- [ ] **Step 2: Write failing authenticated and guest route tests**

Update mocks to return `{ title: "Reset rapido", icon: "REFRESH_CCW" }`. Assert:

```ts
expect(mocks.generateChatMetadata).toHaveBeenCalledWith(
  expect.arrayContaining([{ role: "user", text: "first prompt" }]),
  "first prompt",
  { userId: "user-1" },
);
expect(mocks.prismaChatUpdate).toHaveBeenCalledWith({
  where: { id: "chat-1" },
  data: { title: "Reset rapido", icon: "REFRESH_CCW" },
});
```

Add table-driven message-count cases `1`, `2`, `4` => called and `5`, `10` => not called. Preserve tests showing duplicate inbound retries do not trigger a second generation.

- [ ] **Step 3: Run route tests and verify RED**

Run: `bunx vitest run src/app/api/chat/route.test.ts src/app/api/guest/chat/route.test.ts`

Expected: FAIL because handlers still call `generateChatTitle`, update only `title`, and schedule count 5.

- [ ] **Step 4: Implement atomic metadata updates and stable scheduling**

Replace the old schedule with:

```ts
const shouldRefresh =
  requestConversationMessageCount === 1 ||
  requestConversationMessageCount === 2 ||
  requestConversationMessageCount === 4;
```

Normalize all non-empty request messages into `{ role, text }` objects, pass the current user text as fallback, and persist:

```ts
generateChatMetadata(metadataMessages, aiUserMessageText, { userId: user.id })
  .then(({ title, icon }) => prisma.chat.update({
    where: { id: chatId },
    data: { title, icon },
  }))
  .catch((error) => logger.error(
    "chat.metadata.update_failed",
    "Failed updating generated chat metadata",
    { error, chatId },
  ));
```

Use the guest logger event prefix in the guest handler. Retain `inboundClaim.created && !chat.customTitle` fencing.

- [ ] **Step 5: Run route tests and verify GREEN**

Run: `bunx vitest run src/app/api/chat/route.test.ts src/app/api/guest/chat/route.test.ts`

Expected: PASS with all automatic schedule and persistence assertions green.

- [ ] **Step 6: Commit channel-flow integration**

```bash
git add src/lib/channels/web/chat-route-handler.ts src/lib/channels/web/guest-chat-route-handler.ts src/app/api/chat/route.test.ts src/app/api/guest/chat/route.test.ts
git diff --cached --check
git commit -m "feat(chat): persist generated metadata"
```

### Task 5: Extend authenticated and guest chat API contracts

**Files:**
- Modify: `src/app/api/chats/route.ts`
- Modify: `src/app/api/chats/route.test.ts`
- Modify: `src/app/api/chats/[id]/route.ts`
- Modify: `src/app/api/chats/[id]/route.test.ts`
- Modify: `src/app/api/chats/[id]/route.integration.test.ts`
- Modify: `src/app/api/guest/chats/route.ts`
- Modify: `src/app/api/guest/chats/route.test.ts`
- Modify: `src/app/api/guest/chats/[id]/route.ts`
- Modify: `src/app/api/guest/chats/[id]/route.test.ts`
- Modify: `src/lib/chat.ts`
- Modify: `src/lib/chat.test.ts`
- Modify: `src/lib/guest-auth.ts`
- Modify: `src/lib/guest-auth.test.ts`

**Interfaces:**
- Consumes: Prisma `Chat.icon` and `generateChatMetadata`.
- Produces: `icon` on list/create/detail/update responses; explicit generation updates `{ title, icon }`; manual title update changes `{ title, customTitle: true }` only.

- [ ] **Step 1: Write failing API contract tests**

For authenticated and guest list/create/detail routes, include `icon: "TARGET"` in Prisma fixtures and assert the JSON response includes it. Add the same assertions to `getSharedChats` and `getSharedChat`, because server-rendered sidebar/detail data bypasses the HTTP list route. Assert both existing-guest and newly-created-guest branches select and return `icon`. For explicit `generateTitle: true`, mock metadata and assert both fields are updated:

```ts
mocks.generateChatMetadata.mockResolvedValue({
  title: "Obiettivo maratona autunnale",
  icon: "FOOTPRINTS",
});

expect(mocks.prismaChatUpdate).toHaveBeenCalledWith(
  expect.objectContaining({
    data: expect.objectContaining({
      title: "Obiettivo maratona autunnale",
      icon: "FOOTPRINTS",
    }),
  }),
);
```

For a manual rename, begin with `icon: "BRAIN"` and assert update data equals `{ title: "Nuovo titolo", customTitle: true }` with no `icon` property.

- [ ] **Step 2: Run API tests and verify RED**

Run:

```bash
bunx vitest run src/app/api/chats/route.test.ts 'src/app/api/chats/[id]/route.test.ts' src/app/api/guest/chats/route.test.ts 'src/app/api/guest/chats/[id]/route.test.ts' src/lib/chat.test.ts src/lib/guest-auth.test.ts
```

Expected: FAIL because selects/responses omit `icon` and explicit generation still expects a title string.

- [ ] **Step 3: Implement authenticated and guest API serialization**

Add `icon: true` to every relevant Prisma select and `icon: chat.icon` to list/create/detail/update JSON. Include icon in both normal detail and `sourceAssistantMessageId` detail branches. Update `getSharedChats`, `getSharedChat`, `GuestChatRow`, `createGuestChatForSession`, and `createGuestWithChat` so initial server data and both guest-creation paths carry the field. For explicit regeneration, create a one-message input:

```ts
const generated = await generateChatMetadata(
  [{ role: "user", text: firstUserText }],
  firstUserText,
  { userId: user.id },
);
newTitle = generated.title;
newIcon = generated.icon;
```

Spread `{ icon: newIcon }` only for generated metadata. Do not include icon in the manual rename branch.

- [ ] **Step 4: Run unit API tests and verify GREEN**

Run the four-file command from Step 2.

Expected: PASS.

- [ ] **Step 5: Run the focused integration test when Neon credentials are available**

Run: `bunx vitest run 'src/app/api/chats/[id]/route.integration.test.ts'`

Expected: PASS on the configured ephemeral integration database. If the test is guarded by the repository integration runner, run `bun run test:integration` for this verification instead and report external credential unavailability without weakening assertions.

- [ ] **Step 6: Commit API contract changes**

```bash
git add src/app/api/chats/route.ts src/app/api/chats/route.test.ts 'src/app/api/chats/[id]/route.ts' 'src/app/api/chats/[id]/route.test.ts' 'src/app/api/chats/[id]/route.integration.test.ts' src/app/api/guest/chats/route.ts src/app/api/guest/chats/route.test.ts 'src/app/api/guest/chats/[id]/route.ts' 'src/app/api/guest/chats/[id]/route.test.ts' src/lib/chat.ts src/lib/chat.test.ts src/lib/guest-auth.ts src/lib/guest-auth.test.ts
git diff --cached --check
git commit -m "feat(api): expose conversation icons"
```

### Task 6: Render one safe icon in the sidebar and conversation header

**Files:**
- Create: `src/app/(chat)/components/ChatIcon.tsx`
- Create: `src/app/(chat)/components/ChatIcon.test.tsx`
- Modify: `src/app/(chat)/components/ChatList.tsx`
- Modify: `src/app/(chat)/components/ChatList.test.tsx`
- Modify: `src/app/(chat)/components/chat-periods.ts`
- Modify: `src/app/(chat)/components/ChatHeader.tsx`
- Modify: `src/app/(chat)/components/ChatHeader.test.tsx`
- Modify: `src/app/(chat)/chat/layout-client.tsx`
- Modify: `src/app/(chat)/chat/layout-client.test.tsx`
- Modify: `src/app/(chat)/chat/[id]/chat-conversation-client.tsx`
- Modify: `src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx`

**Interfaces:**
- Consumes: `ChatIcon` and `normalizeChatIcon` from `src/lib/chat-icons.ts`, plus `Chat.icon` and `ChatData.icon`.
- Produces: `<ChatIcon icon={value} className="size-4" />`, with exhaustive mapping and `MESSAGE_SQUARE` fallback for unknown runtime input.

- [ ] **Step 1: Read the local server/client component guide**

Read: `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`

Keep the icon registry client-safe and pass serializable string keys across boundaries.

- [ ] **Step 2: Write failing registry and component tests**

Test a known mapping and hostile runtime value:

```tsx
it("renders the selected icon and falls back safely", () => {
  const { rerender } = render(<ChatIcon icon="TARGET" data-testid="icon" />);
  expect(screen.getByTestId("icon").getAttribute("data-chat-icon")).toBe("TARGET");

  rerender(<ChatIcon icon={"UNKNOWN" as ChatIcon} data-testid="icon" />);
  expect(screen.getByTestId("icon").getAttribute("data-chat-icon")).toBe("MESSAGE_SQUARE");
});
```

Update sidebar fixtures with `icon: "FOOTPRINTS"` and assert the chat link contains that `data-chat-icon`. Render `ChatHeader` with `icon="BRAIN"` and assert its icon is present with `aria-hidden="true"` while the rename button accessible name still contains the title.

- [ ] **Step 3: Run UI tests and verify RED**

Run:

```bash
bunx vitest run 'src/app/(chat)/components/ChatIcon.test.tsx' 'src/app/(chat)/components/ChatList.test.tsx' 'src/app/(chat)/components/ChatHeader.test.tsx'
```

Expected: FAIL because the registry and icon props do not exist.

- [ ] **Step 4: Implement the exhaustive icon registry**

Create a record mapping all 14 keys to imported Lucide components and normalize runtime input through `normalizeChatIcon(icon)`:

```tsx
const ICON_COMPONENTS: Record<ChatIcon, LucideIcon> = {
  TARGET: Target,
  TROPHY: Trophy,
  DUMBBELL: Dumbbell,
  ACTIVITY: Activity,
  BRAIN: Brain,
  HEART_PULSE: HeartPulse,
  TIMER: Timer,
  CALENDAR_DAYS: CalendarDays,
  FLAME: Flame,
  SHIELD: Shield,
  USERS: Users,
  FOOTPRINTS: Footprints,
  REFRESH_CCW: RefreshCcw,
  MESSAGE_SQUARE: MessageSquare,
};
```

Render `data-chat-icon={safeIcon}` and `aria-hidden="true"`. Accept standard SVG props needed by both consumers.

- [ ] **Step 5: Wire sidebar, header, and client state**

Include `icon` in `SidebarChat`. Replace the fixed sidebar `MessageSquare` with `<ChatIcon icon={chat.icon} className="h-4 w-4 shrink-0" />`. Add required `icon: ChatIcon` to `ChatHeaderProps` and render it beside the title without placing it inside the rename button.

Pass `chatData.icon` from `chat-conversation-client.tsx`. In `layout-client.tsx`, parse response icons through the safe normalizer, set new chats to the API value or `MESSAGE_SQUARE`, and include the same icon in optimistic `ChatData` cache entries. A rename must update only title in both list and detail state.

- [ ] **Step 6: Run component and state tests and verify GREEN**

Run:

```bash
bunx vitest run 'src/app/(chat)/components/ChatIcon.test.tsx' 'src/app/(chat)/components/ChatList.test.tsx' 'src/app/(chat)/components/ChatHeader.test.tsx' 'src/app/(chat)/chat/layout-client.test.tsx' 'src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx'
```

Expected: PASS; sidebar and header receive identical icon keys and rename assertions show the icon is preserved.

- [ ] **Step 7: Commit the UI integration**

```bash
git add 'src/app/(chat)/components/ChatIcon.tsx' 'src/app/(chat)/components/ChatIcon.test.tsx' 'src/app/(chat)/components/ChatList.tsx' 'src/app/(chat)/components/ChatList.test.tsx' 'src/app/(chat)/components/chat-periods.ts' 'src/app/(chat)/components/ChatHeader.tsx' 'src/app/(chat)/components/ChatHeader.test.tsx' 'src/app/(chat)/chat/layout-client.tsx' 'src/app/(chat)/chat/layout-client.test.tsx' 'src/app/(chat)/chat/[id]/chat-conversation-client.tsx' 'src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx'
git diff --cached --check
git commit -m "feat(chat): show conversation icons"
```

### Task 7: Run full verification and browser runtime checks

**Files:**
- Modify only if verification exposes a scoped defect: files already listed in Tasks 1-6 and their tests.
- Do not modify: unrelated user-owned worktree files.

**Interfaces:**
- Consumes: completed persistence, generator, routes, APIs, and UI.
- Produces: current evidence that generated/default icons match across sidebar/header on desktop and mobile.

- [ ] **Step 1: Invoke the required verification skills**

Read and follow `superpowers:verification-before-completion`. Because this task edits Next.js app code, also read and follow the repository `next-dev-loop` skill in full before starting the dev server.

- [ ] **Step 2: Run static and targeted verification**

```bash
bunx prisma validate
bunx prisma generate
bunx vitest run src/lib/ai/chat-metadata-contract.test.ts scripts/evaluate-chat-metadata-models.test.ts src/lib/ai/chat-title.test.ts prisma/migrations.test.ts src/lib/chat.test.ts src/lib/guest-auth.test.ts src/app/api/chat/route.test.ts src/app/api/guest/chat/route.test.ts src/app/api/chats/route.test.ts 'src/app/api/chats/[id]/route.test.ts' src/app/api/guest/chats/route.test.ts 'src/app/api/guest/chats/[id]/route.test.ts' 'src/app/(chat)/components/ChatIcon.test.tsx' 'src/app/(chat)/components/ChatList.test.tsx' 'src/app/(chat)/components/ChatHeader.test.tsx' 'src/app/(chat)/chat/layout-client.test.tsx' 'src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx'
bun run lint
git diff --check
```

Expected: all commands PASS. Separate any pre-existing unrelated lint/test failure from regressions introduced by this feature.

- [ ] **Step 3: Run full unit and build gates**

```bash
bun run test
bun run build
```

Expected: PASS. The build uses artifact-only Prisma generation and must not deploy migrations.

- [ ] **Step 4: Run integration coverage when the configured development target is available**

Run: `bun run test:integration`

Expected: PASS on an ephemeral Neon branch derived from development. Do not point the integration runner at Production and do not deploy the migration as part of this step.

- [ ] **Step 5: Verify runtime through the Next.js and browser views**

Start `bun run dev` and complete the exact `next-dev-loop` preflight. Verify:

1. a new chat initially shows `MESSAGE_SQUARE` in sidebar and header;
2. after a representative first message, the generated title and semantic icon appear in both surfaces after refresh/revalidation;
3. sidebar and header expose the same `data-chat-icon` value;
4. renaming the title leaves that value unchanged;
5. a 390px viewport keeps header controls, title, and icon usable without clipping;
6. desktop sidebar active/hover states remain legible;
7. Next.js compilation, server logs, browser console, and network requests show no new errors.

Capture the exact route, viewport, and any limitation caused by authentication or unavailable provider credentials. Do not claim mobile-device verification beyond the browser viewport actually exercised.

- [ ] **Step 6: Re-run affected gates after any runtime fix**

For every fix, first add or strengthen the smallest failing test, observe RED, apply the minimal change, then rerun the targeted file, `bun run lint`, `bun run test`, `bun run build`, and `git diff --check`.

- [ ] **Step 7: Commit only verified follow-up fixes**

If runtime verification required code changes:

```bash
git add src/lib/chat-icons.ts src/lib/ai/chat-metadata-contract.ts src/lib/ai/chat-title.ts src/lib/chat.ts src/lib/guest-auth.ts src/lib/channels/web/chat-route-handler.ts src/lib/channels/web/guest-chat-route-handler.ts src/types/chat.ts src/app/api/chats/route.ts 'src/app/api/chats/[id]/route.ts' src/app/api/guest/chats/route.ts 'src/app/api/guest/chats/[id]/route.ts' 'src/app/(chat)/components/ChatIcon.tsx' 'src/app/(chat)/components/ChatList.tsx' 'src/app/(chat)/components/ChatHeader.tsx' 'src/app/(chat)/chat/layout-client.tsx' 'src/app/(chat)/chat/[id]/chat-conversation-client.tsx'
git diff --cached --check
git commit -m "fix(chat): harden conversation icon rendering"
```

If no follow-up change was needed, do not create an empty commit. Report the eval winner, exact tests, build result, integration status, browser route/viewports, commit list, and the untouched unrelated worktree changes.
