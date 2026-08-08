# Coaching Routine Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trasformare una proposta dell'assistente in una routine esplicitamente salvabile, con tentativi e check-in persistenti e privati.

**Architecture:** Una proposta è una data part validata e persistita insieme al messaggio assistant, ma non crea dati coaching. Una `Routine` user-owned viene creata idempotentemente solo da `POST /api/coaching/routines`; `RoutineAttempt` conserva sia il tentativo sia l'esito/check-in. Le query chat private idratano le routine accanto al messaggio sorgente, mentre chat guest e pubbliche non ricevono mai questi dati. Se il messaggio/chat sorgente viene poi rimosso, una routine attiva conserva il suo snapshot e il rientro apre lo stesso check-in strutturato sulla landing, non un check-in generico.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma/PostgreSQL, Zod, Vercel AI SDK, React, Vitest, Testing Library.

## Global Constraints

- Non modificare né aggiungere ai commit `docs/user-plan-states.md` o `docs/superpowers/plans/2026-08-07-context-aware-rag-implementation.md`.
- Il salvataggio di routine, tentativi ed esiti avviene solo dopo un'azione esplicita dell'utente; il modello non scrive mai un record `Routine`.
- I guest vedono la proposta ma `Salva routine` porta alla route di registrazione con redirect URL della conversazione corrente e non chiama API coaching.
- `Routine` e `RoutineAttempt` appartengono a un utente autenticato; `sourceChatId` e `sourceAssistantMessageId` usano `ON DELETE SET NULL`.
- La chat pubblica/condivisa e qualunque viewer non-owner non serializzano routine, tentativi o esiti.
- Fuori scope: dashboard, calendario/streak, punteggio automatico, reminder/notifiche e una nuova area prodotto separata dalla conversazione.
- Il rendering di `MessageList` resta lineare: non introdurre virtualizzazione né `ResizeObserver`.
- Conservare stream throttled a 50 ms, composer iOS/safe-area, Invio = nuova riga, audio, allegati, edit, delete, rigenerazione e paginazione.
- Usare copy italiano, controlli accessibili, reduced-motion e `bun`/`bunx` per i comandi.

---

## File structure

| File | Responsabilità |
| --- | --- |
| `src/lib/coaching/routine.ts` | Contratti Zod e mapper privati per proposta, routine, tentativo e payload card. |
| `src/lib/coaching/routine.test.ts` | Validazione e mapping puro senza database. |
| `src/lib/ai/tools/routine-proposal.ts` | Tool non persistente che permette al modello di dichiarare una proposta strutturata. |
| `src/lib/ai/tools/routine-proposal.test.ts` | Schema e assenza di side effect del tool. |
| `src/lib/ai/orchestrator.ts` | Abilita il tool per turni coaching idonei e istruisce il modello a non dichiarare salvataggi. |
| `src/lib/channel-flow/persistence.ts` | Aggiunge la data part `data-coachingRoutine` al messaggio assistant persistito. |
| `src/lib/channel-flow/persistence.test.ts` | Regressione sulla persistenza della data part e messaggio senza proposta. |
| `prisma/schema.prisma` | Enum, relazioni e indici `Routine`/`RoutineAttempt`. |
| `prisma/migrations/*_add_coaching_routines/migration.sql` | Migrazione additiva con enum, tabelle, indici e foreign key `SET NULL`. |
| `src/app/api/coaching/routines/route.ts` | Creazione idempotente da un messaggio assistant privato. |
| `src/app/api/coaching/routines/[routineId]/route.ts` | Archiviazione owner-scoped. |
| `src/app/api/coaching/routines/[routineId]/attempts/route.ts` | Creazione idempotente di un tentativo, opzionalmente già con esito. |
| `src/app/api/coaching/attempts/[attemptId]/route.ts` | Salvataggio owner-scoped del check-in sul tentativo esistente. |
| `src/app/api/coaching/**/route.test.ts` | Contratti, autorizzazione, validazione e idempotenza delle route. |
| `src/lib/chat.ts` e `src/app/api/chats/[id]/route.ts` | Idratazione della card solo nel payload privato owner. |
| `src/types/chat.ts` e `src/lib/chat-client.ts` | Tipi `RoutineCardData` e data parts AI SDK. |
| `src/app/(chat)/components/RoutineCard.tsx` | Scheda inline, stati, azioni e mini check-in. |
| `src/app/(chat)/components/RoutineCard.test.tsx` | Salva, guest gate, tentativo, esito, retry e semantica accessibile. |
| `src/app/(chat)/components/RoutineCheckInForm.tsx` | Form strutturato riusabile dalla card e dalla landing se la sorgente non esiste più. |
| `src/app/(chat)/components/RoutineCheckInForm.test.tsx` | Esito, nota opzionale, pending/error e accessibilità del form riusabile. |
| `src/app/(chat)/components/MessageList.tsx` | Posiziona la scheda sotto il messaggio assistant sorgente. |
| `src/app/(chat)/chat/[id]/chat-conversation-client.tsx` | Coordina mutazioni API, refresh, prefill “La provo ora” e apertura check-in. |
| `src/lib/coaching/routine-client.ts` | Client HTTP condiviso e tipizzato per creare tentativi e salvare l'esito da card o landing. |
| `src/app/(chat)/chat/layout.tsx`, `layout-client.tsx`, `page.tsx` | Espongono una routine attiva alla CTA di rientro e aprono il check-in contestuale, anche senza sorgente. |
| `src/test/integration/factories.ts` | Reset sicuro dei nuovi record e factory opzionali per test DB. |

## Task 1: Define the durable coaching contract and database schema

**Files:**

- Create: `src/lib/coaching/routine.ts`
- Create: `src/lib/coaching/routine.test.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/*_add_coaching_routines/migration.sql`
- Modify: `src/test/integration/factories.ts`

**Interfaces:**

- Produces `RoutineProposal`, `routineProposalSchema`, `RoutineCardData`, `routineCardDataSchema`, `toRoutineCardData()`, `getRoutineProposalFromParts()` and `getRoutineProposalFromToolCalls()` for API, persistence and UI.
- Produces Prisma enums `RoutineStatus` (`ACTIVE`, `ARCHIVED`) and `RoutineAttemptOutcome` (`HELPFUL`, `PARTIALLY_HELPFUL`, `NOT_HELPFUL`).
- Produces `Routine` with `@@unique([userId, sourceAssistantMessageId])` and `RoutineAttempt` with `@@unique([routineId, clientActionId])`.

- [ ] **Step 1: Write failing unit tests for the proposal contract and card mapper.**

  In `src/lib/coaching/routine.test.ts`, add cases that accept this complete payload and reject empty title, one step, four steps, and a 281-character trigger:

  ```ts
  const proposal = {
    title: "Reset dopo un errore",
    trigger: "Quando commetti un errore in gara",
    durationLabel: "60 secondi",
    steps: ["Fermati", "Espira lentamente", "Scegli il prossimo gesto"],
    completionCue: "Riparti con lo sguardo sul compito successivo",
  };
  ```

  Add a mapper test asserting that a database routine with its newest attempt becomes a JSON-safe `RoutineCardData` with ISO dates and `latestAttempt` set to `null` when no attempt exists. Assert `routineCardDataSchema` accepts that output and rejects a malformed snapshot/attempt date.

- [ ] **Step 2: Run the focused contract test and confirm it fails because the module does not exist.**

  Run: `bunx vitest run src/lib/coaching/routine.test.ts`

  Expected: failure resolving `@/lib/coaching/routine`.

- [ ] **Step 3: Implement the pure contract module.**

  Create `src/lib/coaching/routine.ts` with these exact public shapes:

  ```ts
  export const routineProposalSchema = z.object({
    title: z.string().trim().min(3).max(96),
    trigger: z.string().trim().min(3).max(280),
    durationLabel: z.string().trim().min(2).max(80).nullable().optional(),
    steps: z.array(z.string().trim().min(2).max(240)).min(2).max(3),
    completionCue: z.string().trim().min(3).max(280),
  });

  export type RoutineProposal = z.infer<typeof routineProposalSchema>;
  export type RoutineCardData = {
    id: string;
    sourceChatId: string | null;
    sourceAssistantMessageId: string | null;
    status: "ACTIVE" | "ARCHIVED";
    proposal: RoutineProposal;
    archivedAt: string | null;
    latestAttempt: {
      id: string;
      attemptedAt: string;
      outcome: "HELPFUL" | "PARTIALLY_HELPFUL" | "NOT_HELPFUL" | null;
      outcomeNote: string | null;
      outcomeRecordedAt: string | null;
    } | null;
  };
  ```

  Define `routineCardDataSchema` from the proposal schema plus source ids, lifecycle status and a nullable latest-attempt object with ISO dates. `getRoutineProposalFromParts(parts)` must locate exactly one `data-coachingRoutine` part, call `routineProposalSchema.safeParse(part.data)`, and return `null` for absent, malformed, duplicated, or invalid data. `toRoutineCardData()` must call the same schema before returning UI data, so malformed legacy JSON cannot reach the client.

- [ ] **Step 4: Add the Prisma models and generated migration.**

  Add relations on `User`, `Chat`, and `Message`, then add:

  ```prisma
  enum RoutineStatus {
    ACTIVE
    ARCHIVED
  }

  enum RoutineAttemptOutcome {
    HELPFUL
    PARTIALLY_HELPFUL
    NOT_HELPFUL
  }

  model Routine {
    id                       String        @id @default(cuid())
    userId                   String
    user                     User          @relation(fields: [userId], references: [id], onDelete: Cascade)
    sourceChatId             String?
    sourceChat               Chat?         @relation("RoutineSourceChat", fields: [sourceChatId], references: [id], onDelete: SetNull)
    sourceAssistantMessageId String?
    sourceAssistantMessage   Message?      @relation("RoutineSourceMessage", fields: [sourceAssistantMessageId], references: [id], onDelete: SetNull)
    title                    String
    trigger                  String
    durationLabel            String?
    steps                    Json
    completionCue            String
    status                   RoutineStatus @default(ACTIVE)
    archivedAt               DateTime?
    attempts                 RoutineAttempt[]
    createdAt                DateTime      @default(now())
    updatedAt                DateTime      @updatedAt

    @@unique([userId, sourceAssistantMessageId])
    @@index([userId, status, updatedAt(sort: Desc)])
    @@index([sourceChatId])
  }

  model RoutineAttempt {
    id                String                 @id @default(cuid())
    routineId         String
    routine           Routine                @relation(fields: [routineId], references: [id], onDelete: Cascade)
    clientActionId    String
    attemptedAt       DateTime               @default(now())
    outcome           RoutineAttemptOutcome?
    outcomeNote       String?                @db.Text
    outcomeRecordedAt DateTime?
    createdAt         DateTime               @default(now())
    updatedAt         DateTime               @updatedAt

    @@unique([routineId, clientActionId])
    @@index([routineId, attemptedAt(sort: Desc)])
  }
  ```

  Generate the additive Prisma migration with `bunx prisma migrate dev --create-only --name add_coaching_routines`, inspect the generated SQL, and require `ON DELETE SET NULL` for both source references. Update `resetIntegrationDb()` to delete `routineAttempt` before `routine` and add focused `createRoutine`/`createRoutineAttempt` factories when route integration tests need them.

- [ ] **Step 5: Generate Prisma client and run contract/schema checks.**

  Run:

  ```bash
  bunx prisma generate
  bunx vitest run src/lib/coaching/routine.test.ts
  ```

  Expected: contract tests pass and generated client exposes `prisma.routine` and `prisma.routineAttempt`.

- [ ] **Step 6: Commit the durable contract.**

  ```bash
  git add prisma/schema.prisma prisma/migrations src/lib/coaching/routine.ts src/lib/coaching/routine.test.ts src/test/integration/factories.ts
  git commit -m "feat(coaching): add routine persistence model"
  ```

## Task 2: Persist a validated assistant proposal without persisting a routine

**Files:**

- Create: `src/lib/ai/tools/routine-proposal.ts`
- Create: `src/lib/ai/tools/routine-proposal.test.ts`
- Modify: `src/lib/ai/orchestrator.ts`
- Modify: `src/lib/channel-flow/persistence.ts`
- Modify: `src/lib/channel-flow/persistence.test.ts`

**Interfaces:**

- Consumes `RoutineProposal` and `routineProposalSchema` from Task 1.
- Produces `createRoutineProposalTool()` with one `proposeRoutine` tool and no database side effect.
- Produces a persisted assistant part `{ type: "data-coachingRoutine", data: RoutineProposal }` only when the tool call validates.

- [ ] **Step 1: Write failing tool and persistence tests.**

  In `routine-proposal.test.ts`, call `createRoutineProposalTool().proposeRoutine.execute(proposal)` and assert the returned value is `{ proposal }` and no Prisma mock is touched. In `persistence.test.ts`, pass an `AIMetrics` object whose `toolCalls` contains:

  ```ts
  { name: "proposeRoutine", args: proposal, result: { proposal } }
  ```

  Assert `message.create` receives `parts` in this order: text part first, `data-coachingRoutine` second. Add a case with invalid `args` asserting only the text part persists.

- [ ] **Step 2: Run the focused tests and confirm the new imports fail.**

  Run: `bunx vitest run src/lib/ai/tools/routine-proposal.test.ts src/lib/channel-flow/persistence.test.ts`

  Expected: the new tool import and `data-coachingRoutine` assertion fail.

- [ ] **Step 3: Implement the non-persistent proposal tool.**

  In `src/lib/ai/tools/routine-proposal.ts`, expose:

  ```ts
  export function createRoutineProposalTool() {
    return {
      proposeRoutine: tool({
        description: "Proponi una routine pratica strutturata. Non salva nulla.",
        inputSchema: routineProposalSchema,
        execute: async (proposal) => ({ proposal }),
      }),
    };
  }
  ```

  Do not import Prisma, `getAuthUser`, or any mutation utility in this file.

- [ ] **Step 4: Enable proposal extraction only for coaching-eligible turns.**

  In `src/lib/ai/orchestrator.ts`, add a positive helper matching coaching circumstances such as `gara`, `partita`, `allenamento`, `errore`, `pressione`, `ansia`, `concentrazione`, `fiducia`, `reset`, `routine` and `piano`. Add `routineProposal` to `ToolPlan`; when true, merge `createRoutineProposalTool()` into both authenticated and guest tool maps and include it in `hasAny` so OpenRouter receives `parallelToolCalls: false`.

  Append a system-prompt rule: call `proposeRoutine` at most once only when the answer contains a concrete two-to-three-step practice; the tool is a proposal, never a saved routine; never claim it was saved. Do not enable it for direct web-search-only requests, model-comparison execution, voice turns, direct-media/attachment turns, or a purely informational reply. Never parse free-form model text to infer a proposal; only the validated tool call can produce the persisted part. Add unit cases for every excluded mode.

- [ ] **Step 5: Persist the proposed data part atomically with the assistant text.**

  Add `getRoutineProposalFromToolCalls(toolCalls)` in `src/lib/coaching/routine.ts`. It must find exactly one `proposeRoutine` call, validate its `args` with `routineProposalSchema`, and return `null` otherwise. In `persistAssistantOutput`, calculate the proposal before `tx.message.create`, then write:

  ```ts
  parts: [
    { type: "text", text },
    ...(routineProposal
      ? [{ type: "data-coachingRoutine", data: routineProposal }]
      : []),
  ] as Prisma.InputJsonValue,
  ```

  Keep `MessageMetrics`, usage reservation, voice job and idempotent inbound-response behavior in the same transaction unchanged.

- [ ] **Step 6: Run focused tests and inspect persistence diffs.**

  Run:

  ```bash
  bunx vitest run src/lib/ai/tools/routine-proposal.test.ts src/lib/channel-flow/persistence.test.ts
  bunx vitest run src/lib/channel-flow/run.test.ts
  ```

  Expected: proposal survives persisted assistant output; ordinary text, voice and recovery flows keep their existing parts and metric writes.

- [ ] **Step 7: Commit proposal persistence.**

  ```bash
  git add src/lib/ai/orchestrator.ts src/lib/ai/tools/routine-proposal.ts src/lib/ai/tools/routine-proposal.test.ts src/lib/coaching/routine.ts src/lib/channel-flow/persistence.ts src/lib/channel-flow/persistence.test.ts
  git commit -m "feat(coaching): persist routine proposals with messages"
  ```

## Task 3: Add owner-scoped, idempotent coaching mutations

**Files:**

- Create: `src/app/api/coaching/routines/route.ts`
- Create: `src/app/api/coaching/routines/route.test.ts`
- Create: `src/app/api/coaching/routines/[routineId]/route.ts`
- Create: `src/app/api/coaching/routines/[routineId]/route.test.ts`
- Create: `src/app/api/coaching/routines/[routineId]/attempts/route.ts`
- Create: `src/app/api/coaching/routines/[routineId]/attempts/route.test.ts`
- Create: `src/app/api/coaching/attempts/[attemptId]/route.ts`
- Create: `src/app/api/coaching/attempts/[attemptId]/route.test.ts`

**Interfaces:**

- `POST /api/coaching/routines` consumes `{ sourceAssistantMessageId: string }` and returns `{ routine: RoutineCardData }`.
- `PATCH /api/coaching/routines/[routineId]` consumes `{ status: "ARCHIVED" }` and returns `{ routine: RoutineCardData }`.
- `POST /api/coaching/routines/[routineId]/attempts` consumes `{ clientActionId: string, outcome?: RoutineAttemptOutcome, outcomeNote?: string | null }` and returns `{ routine: RoutineCardData }`.
- `PATCH /api/coaching/attempts/[attemptId]` consumes `{ outcome: RoutineAttemptOutcome, outcomeNote?: string | null }` and returns `{ routine: RoutineCardData }`.

- [ ] **Step 1: Write route tests for authorization and create idempotence.**

  Mock `getAuthUser` and Prisma. Cover: unauthenticated `401`; authenticated guest `403`; source message missing or owned by another user `404`; source message without valid data part `422`; first creation `201`; second creation from the same owner/message returns the existing routine `200`; no request body may supply title, steps, `userId`, `chatId` or source proposal fields.

- [ ] **Step 2: Run the new route test and confirm it fails because the routes do not exist.**

  Run: `bunx vitest run src/app/api/coaching/routines/route.test.ts`

  Expected: module resolution failure.

- [ ] **Step 3: Implement `POST /api/coaching/routines`.**

  Use `getAuthUser()`, then reject `user.isGuest`. Parse only this strict schema:

  ```ts
  z.object({ sourceAssistantMessageId: z.string().cuid() }).strict()
  ```

  Load `Message` with the exact predicate `{ id: sourceAssistantMessageId, userId: user.id, role: "ASSISTANT", chat: { is: { userId: user.id, visibility: "PRIVATE" } } }`, extract proposal exclusively via `getRoutineProposalFromParts(message.parts)`, then `prisma.routine.upsert` by `{ userId_sourceAssistantMessageId: { userId, sourceAssistantMessageId } }`. Persist snapshot fields from the validated proposal, never client text. Return `toRoutineCardData(routine)` and call `revalidateTag(`chat-${chatId}`, "max")` when the source chat exists.

- [ ] **Step 4: Add failing attempt, check-in and archive tests.**

  Cover owner-only `404` for another user's routine/attempt, `400` for a non-UUID `clientActionId`, `409` for an archived routine, one attempt created once for repeated `{ routineId, clientActionId }`, a successful outcome write on the latest attempt, and an outcome value constrained to `HELPFUL`, `PARTIALLY_HELPFUL`, or `NOT_HELPFUL`. Require `outcomeRecordedAt` when an outcome exists and require no auto-created attempt from a plain `GET` or chat refresh. Assert a new attempt or saved outcome advances the parent routine's `updatedAt`, while a retry with the same action id does not.

- [ ] **Step 5: Implement attempt/check-in/archive routes with exact ownership predicates.**

  Use the following data rules:

  ```ts
  const routineWhere = { id: routineId, userId: user.id, status: "ACTIVE" as const };
  const attemptBodySchema = z.object({
    clientActionId: z.string().uuid(),
    outcome: z.enum(["HELPFUL", "PARTIALLY_HELPFUL", "NOT_HELPFUL"]).optional(),
    outcomeNote: z.string().trim().max(1000).nullable().optional(),
  }).strict();
  ```

  `POST attempts` must be retry-safe: inside one transaction, first return an existing record for `{ routineId, clientActionId }`; otherwise create it, handling a concurrent unique violation by re-reading that same record. Only the first creation touches parent `Routine.updatedAt`; if an outcome exists, write it with `outcomeRecordedAt: new Date()`. `PATCH attempts/[attemptId]` first finds the attempt with `{ id: attemptId, routine: { userId: user.id, status: "ACTIVE" } }`; only after that owner check succeeds, update by its unique `id` with `outcome`, `outcomeNote`, and `outcomeRecordedAt`, then touch the parent `updatedAt` in the same transaction and return `RoutineCardData`. `PATCH routines/[routineId]` accepts only `ARCHIVED`, sets both `status` and `archivedAt`, and never deletes history.

- [ ] **Step 6: Run all coaching route tests.**

  Run:

  ```bash
  bunx vitest run src/app/api/coaching/routines/route.test.ts src/app/api/coaching/routines/'[routineId]'/route.test.ts src/app/api/coaching/routines/'[routineId]'/attempts/route.test.ts src/app/api/coaching/attempts/'[attemptId]'/route.test.ts
  ```

  Expected: all owner, guest, malformed-body, idempotence and status transitions pass.

- [ ] **Step 7: Commit the coaching HTTP boundary.**

  ```bash
  git add src/app/api/coaching
  git commit -m "feat(coaching): add routine lifecycle api"
  ```

## Task 4: Hydrate proposal and routine data only in private owner chat payloads

**Files:**

- Modify: `src/types/chat.ts`
- Modify: `src/lib/model-experiments/types.ts`
- Modify: `src/lib/chat-client.ts`
- Modify: `src/lib/chat.ts`
- Modify: `src/lib/chat.test.ts`
- Modify: `src/app/api/chats/[id]/route.ts`
- Modify: `src/app/api/chats/[id]/route.test.ts`
- Modify: `src/app/api/chats/[id]/route.integration.test.ts`

**Interfaces:**

- `ChatMessage.parts` may contain `data-coachingRoutine`; `AnthonUIMessage` recognizes `coachingRoutine: RoutineProposal`.
- `ChatData.routines` is `RoutineCardData[]`, present only for private authenticated owners and only for source messages in the returned page.
- A private owner, including a guest, may receive a proposal data part; public/shared viewers receive a sanitized message part list without `data-coachingRoutine`.

- [ ] **Step 1: Write failing private/public serialization tests.**

  In `src/lib/chat.test.ts`, fixture an assistant message with a valid routine part and a stored routine. Assert the private authenticated owner receives `routines: [card]`; a guest owner retains the proposal part but receives `routines: []`; a non-owner viewer of a public chat receives `routines: []` and a message part list without `data-coachingRoutine`. In `/api/chats/[id]/route.test.ts`, assert the direct refresh endpoint follows the same rule, including cursor pages.

- [ ] **Step 2: Run the serialization tests and confirm the `routines` field is absent.**

  Run: `bunx vitest run src/lib/chat.test.ts src/app/api/chats/'[id]'/route.test.ts`

  Expected: assertions for routine hydration fail.

- [ ] **Step 3: Extend shared types and AI SDK part definitions.**

  Add `RoutineCardData` import/type to `ChatData` and update `AnthonUIMessage` data parts with:

  ```ts
  {
    coachingRoutine: RoutineProposal;
    modelComparison: ModelComparisonData;
    modelComparisonDelta: ModelComparisonDeltaData;
  }
  ```

  Keep `convertToUIMessages()` as the only client conversion boundary; it must preserve stored `parts`, attach `routines` at chat level rather than copying routine state into untrusted message data, and leave normal messages unchanged.

- [ ] **Step 4: Gate routine query with private owner access.**

  In both `getSharedChat()` and `GET /api/chats/[id]`, compute:

  ```ts
  const canReceivePrivateCoachingData =
    chat.userId === user.id &&
    chat.visibility === "PRIVATE" &&
    user.isGuest === false;
  ```

  Only if true, fetch routines with `userId`, `sourceChatId: chat.id`, `sourceAssistantMessageId: { in: returnedAssistantMessageIds }`, and `attempts: { orderBy: { attemptedAt: "desc" }, take: 1 }`. Map every record through `toRoutineCardData`. Return an empty array otherwise. Separately compute `canReceiveRoutineProposal = chat.userId === userId && chat.visibility === "PRIVATE"`; before mapping messages, remove every `data-coachingRoutine` object from `parts` when that value is false. Coordinate with the technical-metrics serializer so public/non-owner payloads also omit raw `toolCalls` and metadata that could contain proposal arguments. Do not join routines into a public chat query and do not trust a routine ID from a message part.

- [ ] **Step 5: Add integration verification for records after source deletion.**

  In `src/app/api/chats/[id]/route.integration.test.ts`, create an owner, private chat, assistant message and routine, then delete the source message/chat using the established endpoint behavior. Assert Prisma still contains the routine with null source references and public/foreign refresh responses never include its snapshot or attempt. Add the necessary test-factory calls from Task 1.

- [ ] **Step 6: Run private payload tests.**

  Run:

  ```bash
  bunx vitest run src/lib/chat.test.ts src/app/api/chats/'[id]'/route.test.ts
  bunx vitest run src/app/api/chats/'[id]'/route.integration.test.ts
  ```

  Expected: authenticated owner refresh rehydrates cards; guest retains only a proposal; public/foreign viewers have neither routine payload nor proposal data part.

- [ ] **Step 7: Commit private hydration.**

  ```bash
  git add src/types/chat.ts src/lib/model-experiments/types.ts src/lib/chat-client.ts src/lib/chat.ts src/lib/chat.test.ts src/app/api/chats/'[id]'
  git commit -m "feat(coaching): hydrate routines in private chats"
  ```

## Task 5: Render the routine card and perform explicit lifecycle actions

**Files:**

- Create: `src/app/(chat)/components/RoutineCard.tsx`
- Create: `src/app/(chat)/components/RoutineCard.test.tsx`
- Create: `src/app/(chat)/components/RoutineCheckInForm.tsx`
- Create: `src/app/(chat)/components/RoutineCheckInForm.test.tsx`
- Create: `src/lib/coaching/routine-client.ts`
- Modify: `src/app/(chat)/components/MessageList.tsx`
- Modify: `src/app/(chat)/components/MessageList.behavior.test.tsx`
- Modify: `src/app/(chat)/chat/[id]/chat-conversation-client.tsx`
- Modify: `src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx`
- Modify: `src/app/(chat)/components/ChatInput.tsx`
- Modify: `src/app/(chat)/components/ChatInput.test.tsx`

**Interfaces:**

- `RoutineCard` consumes `{ proposal, routine, isGuest, registrationHref, onSave, onCreateAttempt, onSaveOutcome, onArchive, onTryNow, openCheckIn }`; `onCreateAttempt` accepts optional outcome and note for a check-in with no prior attempt.
- `RoutineCheckInForm` consumes one active `RoutineCardData` plus the same two lifecycle callbacks, so a source-card and an orphaned routine use exactly the same outcome workflow.
- `routine-client.ts` is the one browser-side fetch boundary for save, attempt, outcome and archive; it validates `{ routine }` before returning it to either caller.
- Every async callback resolves to the refreshed `RoutineCardData` or throws; `RoutineCard` owns pending/error UI but not the authoritative state.

- [ ] **Step 1: Write failing component tests for the lifecycle.**

  Test these user-visible facts:

  1. A proposal renders title, trigger, duration, 2–3 steps, cue, “Salva routine” and “La provo ora”.
  2. A guest's primary control is a link to `/sign-up?redirect_url=%2Fchat%2Fchat-1` and no fetch mutation occurs.
  3. An authenticated save invokes `onSave("assistant-1")`, disables duplicate clicks while pending, and shows “Routine attiva” only after resolved data arrives.
  4. “Segna un tentativo” calls `onCreateAttempt(routineId, actionId)` once; outcome labels “Mi ha aiutato”, “In parte”, “Non ha aiutato” update the newest pending attempt through `onSaveOutcome`, or create the first attempt through `onCreateAttempt(routineId, actionId, outcome, note)` when no attempt exists.
  5. Failure restores an actionable state and announces an Italian error; controls expose meaningful accessible names and status text.
  6. `RoutineCheckInForm` has a labelled optional note, commits only after an explicit outcome button/submit, and can create the first attempt with that outcome when none exists.

- [ ] **Step 2: Run the new card test and confirm it fails.**

  Run: `bunx vitest run src/app/'(chat)'/components/RoutineCard.test.tsx src/app/'(chat)'/components/RoutineCheckInForm.test.tsx`

  Expected: module not found.

- [ ] **Step 3: Implement `RoutineCard` as a calm inline work card.**

  Render a neutral bordered card with a small “Routine proposta” or “Routine attiva” label, not a high-saturation message bubble. Use the yellow brand accent only on the primary active action. `La provo ora` calls `onTryNow()` to prefill/focus the composer and never writes an attempt. In active state, offer `Segna un tentativo`, `Com'è andata?`, and an explicit archive control; collapse archive behind the existing accessible confirmation primitive. Extract the labelled fieldset/note/outcome controls into `RoutineCheckInForm`; the card owns only whether it is open, while the form saves only from its explicit submit action.

- [ ] **Step 4: Render proposals beneath their source assistant message.**

  In `MessageList`, add a safe `getRoutineProposalData(parts)` that reads `data-coachingRoutine` through the Task 1 schema. Build a `Map<string, RoutineCardData>` keyed by `sourceAssistantMessageId` from a new `routines` prop. Render `RoutineCard` after assistant markdown/attachments and before generic message actions. Pass `isGuest`, `registrationHref`, and mutation callbacks from `ChatConversationClient`; do not render a card for malformed data, user messages, comparison messages, audio-only messages, public payloads, or a routine sourced from another message.

- [ ] **Step 5: Implement client mutations with server refresh as source of truth.**

  In `routine-client.ts`, add typed functions that call the Task 3 routes and parse `{ routine }`; do not duplicate `fetch`/error parsing in the landing. In `ChatConversationClient`, use them to patch the matching element in `chatData.routines`, then call `refreshChatData()` and `setMessages()` after success. Generate an attempt `clientActionId` with `crypto.randomUUID()` once per click and retain it through a retry. Add `focusRequestId?: number` to `ChatInput`; its effect calls the existing textarea ref's `focus()` whenever the number changes. For “La provo ora”, set the controlled input to ``Inizio ora la routine: ${title}. Ti aggiorno dopo il tentativo.`` and increment `focusRequestId`, without submitting a message.

- [ ] **Step 6: Extend behavior tests around refresh and failures.**

  Add to `MessageList.behavior.test.tsx` a valid routine part and assert the card appears under the matching assistant response. Add to `chat-conversation-client.behavior.test.tsx` mocked success, 409, 422 and network-error responses for save/attempt/outcome; assert no optimistic “saved” state survives a failed request and existing stream/error behavior remains unchanged.

- [ ] **Step 7: Run routine UI tests.**

  Run:

  ```bash
  bunx vitest run src/app/'(chat)'/components/RoutineCard.test.tsx src/app/'(chat)'/components/RoutineCheckInForm.test.tsx src/app/'(chat)'/components/MessageList.behavior.test.tsx src/app/'(chat)'/chat/'[id]'/chat-conversation-client.behavior.test.tsx
  ```

  Expected: proposal, explicit save, guest gate, attempt, outcome, retry and stream refresh cases pass.

- [ ] **Step 8: Commit the inline routine experience.**

  ```bash
  git add src/app/'(chat)'/components/RoutineCard.tsx src/app/'(chat)'/components/RoutineCard.test.tsx src/app/'(chat)'/components/RoutineCheckInForm.tsx src/app/'(chat)'/components/RoutineCheckInForm.test.tsx src/lib/coaching/routine-client.ts src/app/'(chat)'/components/MessageList.tsx src/app/'(chat)'/components/MessageList.behavior.test.tsx src/app/'(chat)'/chat/'[id]'/chat-conversation-client.tsx src/app/'(chat)'/chat/'[id]'/chat-conversation-client.behavior.test.tsx src/app/'(chat)'/components/ChatInput.tsx src/app/'(chat)'/components/ChatInput.test.tsx
  git commit -m "feat(chat): add routine coaching card"
  ```

## Task 6: Route returning check-ins to the active routine when possible

**Files:**

- Modify: `src/lib/coaching/routine.ts`
- Modify: `src/app/(chat)/chat/layout.tsx`
- Modify: `src/app/(chat)/chat/layout.test.tsx`
- Modify: `src/app/(chat)/chat/layout-client.tsx`
- Modify: `src/app/(chat)/chat/page.tsx`
- Modify: `src/app/(chat)/chat/page.test.tsx`
- Modify: `src/app/(chat)/chat/[id]/chat-conversation-client.tsx`
- Modify: `src/app/(chat)/components/RoutineCheckInForm.tsx`
- Modify: `src/app/(chat)/components/RoutineCheckInForm.test.tsx`

**Interfaces:**

- `getActiveRoutineForReturn(userId)` returns the newest active routine, including one whose source message or chat was deleted, with its newest attempt and nullable source ids.
- `ChatContext` exposes `activeRoutine`, `updateActiveRoutine(routine)` and `openRoutineCheckIn(routine)`; the latter opens the source chat only when its source message still exists, otherwise opens `/chat?checkInRoutineId=<routineId>`.
- `ChatPage` recognizes that query parameter and renders the same `RoutineCheckInForm` as the inline card for the matching active routine; generic “Com'è andata?” remains only for no active routine.

- [ ] **Step 1: Write failing launcher tests.**

  In `page.test.tsx`, provide an active routine with both `sourceChatId: "chat-1"` and `sourceAssistantMessageId: "assistant-1"`; assert “Com'è andata?” navigates to `/chat/chat-1?checkInRoutineId=routine-1` instead of creating a generic chat. With an active orphaned routine (either source id is null), assert it navigates to `/chat?checkInRoutineId=routine-1`, renders the structured form with its saved title and submits the normal lifecycle callback. With no active routine, assert it retains the current generic prefilled check-in flow.

- [ ] **Step 2: Run the landing test and confirm the active-routine behavior fails.**

  Run: `bunx vitest run src/app/'(chat)'/chat/page.test.tsx`

  Expected: the new navigation assertion fails.

- [ ] **Step 3: Fetch a safe active routine without losing orphaned snapshots.**

  Add `getActiveRoutineForReturn(userId)` to `src/lib/coaching/routine.ts` with `where: { userId, status: "ACTIVE" }`, `orderBy: { updatedAt: "desc" }`, newest attempt, and the same `toRoutineCardData()` mapper. Do not add a source-id predicate: `ON DELETE SET NULL` deliberately preserves an active routine snapshot. In `getChatSidebarData()`, load it only for non-guest authenticated users, pass it through `LayoutClient`, and expose `activeRoutine`, `updateActiveRoutine()`, and `openRoutineCheckIn()` through `ChatContext`.

  `openRoutineCheckIn()` must route to `/chat/<sourceChatId>?checkInRoutineId=<id>` only when both `sourceChatId` and `sourceAssistantMessageId` are present. Otherwise route to `/chat?checkInRoutineId=<id>` so there is always a structured check-in without restoring a deleted conversation.

- [ ] **Step 4: Open the shared check-in form from either URL.**

  In `ChatConversationClient`, read `checkInRoutineId` with `useSearchParams()`, pass `openCheckInRoutineId` to `MessageList`, and have only the matching `RoutineCard` open its `RoutineCheckInForm`. Remove the query parameter with `router.replace(`/chat/${chatId}`)` after the form is focused, preserving browser history and preventing a reopened form on refresh.

  In `ChatPage`, read the same parameter. If it matches `activeRoutine` whose source is absent, render `RoutineCheckInForm` above the landing choices, use `routine-client.ts` for the existing attempt/outcome mutation, call `updateActiveRoutine()` with the response, then remove the query through `router.replace("/chat")`. Do not create or prefill a chat for this fallback. If the id is stale or there is no active routine, remove it and leave the normal generic check-in route intact.

- [ ] **Step 5: Run launcher and conversation behavior tests.**

  Run:

  ```bash
  bunx vitest run src/app/'(chat)'/chat/layout.test.tsx src/app/'(chat)'/chat/page.test.tsx src/app/'(chat)'/chat/'[id]'/chat-conversation-client.behavior.test.tsx src/app/'(chat)'/components/RoutineCheckInForm.test.tsx
  ```

  Expected: no active routine preserves the generic check-in; an active routine opens the structured form in its source chat; an orphaned active routine opens the same form on the landing; guest never receives active-routine data.

- [ ] **Step 6: Commit the return path.**

  ```bash
  git add src/lib/coaching/routine.ts src/app/'(chat)'/chat/layout.tsx src/app/'(chat)'/chat/layout.test.tsx src/app/'(chat)'/chat/layout-client.tsx src/app/'(chat)'/chat/page.tsx src/app/'(chat)'/chat/page.test.tsx src/app/'(chat)'/chat/'[id]'/chat-conversation-client.tsx src/app/'(chat)'/components/RoutineCheckInForm.tsx src/app/'(chat)'/components/RoutineCheckInForm.test.tsx
  git commit -m "feat(coaching): route returning check-ins to routines"
  ```

## Task 7: Verify the complete durable loop

**Files:**

- Modify only test files identified by failures from Tasks 1–6.

- [ ] **Step 1: Run all focused unit and integration suites.**

  Run:

  ```bash
  bunx vitest run src/lib/coaching src/lib/ai/tools/routine-proposal.test.ts src/lib/channel-flow/persistence.test.ts src/lib/chat.test.ts src/app/api/coaching src/app/api/chats/'[id]'/route.integration.test.ts src/app/'(chat)'/components/RoutineCard.test.tsx src/app/'(chat)'/components/RoutineCheckInForm.test.tsx src/app/'(chat)'/components/MessageList.behavior.test.tsx src/app/'(chat)'/chat/page.test.tsx src/app/'(chat)'/chat/'[id]'/chat-conversation-client.behavior.test.tsx
  ```

- [ ] **Step 2: Run static gates.**

  Run:

  ```bash
  bun run lint
  git diff --check
  ```

- [ ] **Step 3: Verify in the local Next.js preview.**

  Check authenticated desktop and mobile: generated proposal, explicit save, refresh, one attempt, outcome retry, archive, generic versus structured return check-in, public chat link and guest registration return. During a streaming answer, verify no routine is displayed as saved before the server response and composer remains above the mobile keyboard.
