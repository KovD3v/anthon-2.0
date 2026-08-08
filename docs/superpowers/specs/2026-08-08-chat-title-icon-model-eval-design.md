# Chat title and icon generation design

**Date:** 2026-08-08
**Status:** Approved design, pending implementation plan

## Goal

Improve automatic conversation titles and let the same generation step choose a
semantically appropriate icon from a closed set. Persist and show that icon in
both the chat sidebar and the conversation header. Select the title-generation
model through a small, reproducible evaluation of these exact OpenRouter IDs:

- `inclusionai/ling-3.0-flash`
- `qwen/qwen3.7-flash`
- `deepseek/deepseek-v4-flash`

The selected model is only for conversation metadata generation. This work must
not change the primary chat orchestrator or its fallback routing.

## Current behavior and problems

`src/lib/ai/chat-title.ts` currently asks
`google/gemini-2.5-flash-lite` for an unstructured title string. It cleans that
string locally and falls back to words from the first content line when the
provider fails. Automatic generation runs after conversation message counts 1,
2, 4, and then every fifth message. Only the title is persisted.

The sidebar always renders `MessageSquare`, and chat API responses do not carry
icon metadata. Long-running chats can also have their title repeatedly changed
after the topic has already become clear. The existing prompt constrains length
and language, but the context window can let recent assistant text overshadow
the user's concrete need.

## Chosen approach

Persist an icon key on `Chat` and generate a validated metadata object:

```ts
interface GeneratedChatMetadata {
  title: string;
  icon: ChatIcon;
}
```

The generation function returns `{ title, icon }` as structured output. Its
schema restricts `icon` to a stable application-owned enum. The application
maps enum keys to Lucide components through one shared registry; it never
renders a component name supplied directly by a model.

This is preferred over embedding an icon in the title, which would mix content
and presentation, and over deriving the icon independently in the client,
which could make surfaces disagree and would not satisfy model selection.

## Icon vocabulary

The closed icon set is:

| Persisted key | Lucide icon | Intended semantic range |
| --- | --- | --- |
| `TARGET` | `Target` | goals, focus, objectives |
| `TROPHY` | `Trophy` | competition, results, winning |
| `DUMBBELL` | `Dumbbell` | training and strength |
| `ACTIVITY` | `Activity` | performance, load, recovery |
| `BRAIN` | `Brain` | mindset and mental skills |
| `HEART_PULSE` | `HeartPulse` | health, injury, physical warning |
| `TIMER` | `Timer` | timing, pace, time pressure |
| `CALENDAR_DAYS` | `CalendarDays` | schedules and plans |
| `FLAME` | `Flame` | motivation and drive |
| `SHIELD` | `Shield` | safety, confidence, protection |
| `USERS` | `Users` | coach, team, relationships |
| `FOOTPRINTS` | `Footprints` | running and progressive steps |
| `REFRESH_CCW` | `RefreshCcw` | reset, recovery from mistakes, restart |
| `MESSAGE_SQUARE` | `MessageSquare` | neutral fallback or unclear topic |

`MESSAGE_SQUARE` is the database default and runtime fallback. Existing chats
therefore remain renderable without a separate remote backfill operation.

## Data model and API contract

Add a Prisma enum for the keys above and a required `Chat.icon` field with
`MESSAGE_SQUARE` as its default. Create a migration, validate the schema, and
regenerate the Prisma client.

Every chat summary or detail response used by the web chat surfaces must include
the persisted icon. This includes authenticated and guest list, create, detail,
and update paths. Shared TypeScript chat types must represent the same closed
union.

Title and icon generated from a conversation are written together in one
`prisma.chat.update`. A manual title rename continues to set `customTitle` and
changes only `title`; it preserves the existing icon. Manual icon editing is
out of scope.

## Generation behavior

Rename the conceptual operation from title-only generation to conversation
metadata generation. The implementation may retain a compatibility wrapper
temporarily only if it materially reduces call-site risk, but production call
sites must consume the structured title and icon together.

The prompt must:

- produce a natural Italian title of 3-6 words and at most 55 characters;
- describe the user's concrete need, decision, event, or intended outcome;
- prefer distinctive terms from the user over generic coaching language;
- avoid generic labels such as "Conversazione", "Supporto", "Coaching", or
  "Nuova chat" when a specific subject is available;
- avoid quotes, emoji, labels, and decorative or final punctuation;
- select exactly one icon based on the conversation's primary subject, using
  the documented semantic vocabulary;
- use `MESSAGE_SQUARE` only when the topic is genuinely unclear.

Use low generation variance appropriate for metadata. The same prompt, schema,
token budget, and generation settings must be used for all eval candidates.

Generation context consists of the first non-empty user message plus the most
recent relevant user and assistant turns within a bounded character budget.
Role labels remain explicit. The first user need cannot be dropped merely
because later assistant output is longer. Duplicate content is removed when the
first user message is already inside the recent slice.

Automatic metadata generation runs at message counts 1, 2, and 4 while the chat
does not have a custom title. It stops after count 4 instead of continuing every
five messages, stabilizing the label and icon once the initial intent is clear.
Explicit user-requested regeneration may still run later and updates both
generated fields, provided the existing endpoint's ownership checks pass.

## Validation and fallbacks

The structured response is validated before persistence. The existing local
title cleanup remains a defensive second layer for whitespace, labels,
punctuation, length, and weak trailing words.

If generation throws, structured parsing fails, the title becomes empty after
cleanup, or the icon is outside the enum, return:

- a cleaned local title based primarily on the first user message; and
- `MESSAGE_SQUARE`.

Failures use the existing structured logger and never block delivery of the chat
response. When a user ID is available, usage metering records the actual model
ID selected by the eval, token usage, and provider metadata.

## Mini-evaluation

### Corpus

Use 12 curated, non-sensitive Italian scenarios. Cover at least:

1. pressure before a competition;
2. recovery after a mistake;
3. a short mental routine;
4. loss of motivation;
5. weekly training planning;
6. injury or a physical safety warning;
7. a difficult conversation with a coach;
8. team dynamics;
9. pace or timing;
10. a specific running goal;
11. confidence after a poor result;
12. a genuinely vague opening where the neutral icon is reasonable.

Each fixture defines the source conversation, important concepts that a good
title should retain, acceptable icons, and clearly inappropriate icons. The
fixtures contain no production user data.

### Execution

Run each exact candidate twice on every scenario, for 72 calls total, from the
same development machine in Italy. Keep prompt, structured schema, provider
routing behavior, and sampling settings identical. Capture raw output,
validated output, failures, end-to-end duration, usage, provider metadata, and
reported or calculated cost without logging credentials.

An unavailable model, a provider-policy rejection, or incompatibility with the
required structured output is reported against the exact requested ID. Do not
silently substitute a dated alias, fallback, or different model.

### Gate and ranking

A candidate must produce at least one successful, non-empty, positive-duration
result and must not show a systemic structured-output failure. Report validity
rate for all candidates before ranking.

For candidates that pass the gate, use this decision score:

- title quality: 50%;
- icon appropriateness: 25%;
- structured-output reliability: 15%;
- Italy end-to-end latency: 7%;
- cost: 3%.

Title scoring combines deterministic checks with blinded human review for
semantic specificity and naturalness. Icon scoring uses each fixture's accepted
and clearly inappropriate sets, with blinded review for ambiguous but defensible
choices. Do not use a judge from one of the candidate model families. Report
median and p95 latency, total and per-call cost, and reliability separately so
the aggregate score cannot hide operational weaknesses.

The highest-ranked eligible model becomes the metadata-generation model. Save
the corpus, outputs, metrics, scoring rationale, and decision under
`docs/benchmarks/` in a compact, reproducible format.

## UI behavior

Create one exhaustive `ChatIcon` registry that maps each persisted key to its
Lucide component. Both sidebar and header consume that registry. Unknown values
at an untrusted API boundary resolve to `MESSAGE_SQUARE` rather than causing a
render failure.

The sidebar replaces its fixed `MessageSquare` with the selected icon while
retaining existing active, hover, size, and accessible title behavior. The
conversation header displays the same icon adjacent to the title without
changing rename, export, navigation, or mobile layout semantics. Decorative
icons should be hidden from assistive technology because the adjacent title
already names the conversation.

## Testing and verification

Follow test-driven development for implementation. Coverage must include:

- the exact model ID selected by the eval;
- structured title and icon parsing;
- prompt requirements and bounded context construction;
- cleanup and fallback on provider, schema, empty-title, and invalid-icon
  failures;
- metering with the selected model ID;
- generation at counts 1, 2, and 4 but not later automatic counts;
- atomic persistence of title and icon in authenticated and guest flows;
- manual rename preserving the icon;
- authenticated and guest API serialization;
- fallback parsing of unknown API icon values;
- matching accessible rendering in sidebar and conversation header;
- migration presence and Prisma schema consistency.

Verification includes targeted Vitest files, Prisma validation and generation,
Biome, the relevant unit and integration suites when the database is available,
`git diff --check`, a production build, and browser runtime verification of both
desktop and mobile chat surfaces. Runtime verification must demonstrate that
sidebar and header render the same generated icon and that a legacy/default chat
renders `MessageSquare`.

## Scope boundaries

This feature does not:

- change the main coaching orchestrator or fallback models;
- expose arbitrary icon names or user-supplied SVG;
- add manual icon selection;
- use production conversations for evaluation;
- retroactively generate semantic icons for all existing chats;
- deploy risky database changes to production without target confirmation.

Unrelated worktree changes, including the existing modification to
`docs/user-plan-states.md` and the untracked context-aware RAG plan, must remain
untouched and outside this feature's commits.
