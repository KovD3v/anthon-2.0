# Chat Surface Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere la conversazione una superficie coaching più calma, privata e accessibile, con metriche tecniche persistenti ma opzionali e feedback 👍/👎.

**Architecture:** Una preferenza nullable conserva solo l'override esplicito dell'utente; un resolver server calcola il default per ruolo e stabilisce se le metriche possono essere serializzate. La conversazione usa componenti piccoli per dettaglio metriche, azioni secondarie e chrome mobile. Drawer e ricerca passano alle primitive Radix già presenti, così focus trap, inertness e focus return sono gestiti in modo coerente.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma/PostgreSQL, React, Radix Dialog/Sheet/DropdownMenu, Vitest, Testing Library, T3 preview.

## Global Constraints

- Eseguire questo piano dopo il piano `2026-08-08-coaching-routine-loop-implementation.md` o coordinare gli interventi su `MessageList.tsx` per evitare conflitti.
- Non modificare né aggiungere ai commit `docs/user-plan-states.md` o `docs/superpowers/plans/2026-08-07-context-aware-rag-implementation.md`.
- `showTechnicalMetrics` resta nullable nel database; il default effettivo è attivo solo per `ADMIN` e `SUPER_ADMIN`, inattivo per `USER`.
- I campi diagnostici (`model`, usage/token/costi/tempi, `ragUsed`, `toolCalls` e metadata grezzo) non vengono mai serializzati per guest, chat `PUBLIC` o viewer non-owner, anche se l'owner è admin. Il database, le reservation e l'analytics restano invariati.
- Feedback resta visibile e persistente; la UI è soltanto pollice su/pollice giù, con etichette e stato accessibile.
- Non cambiare il comportamento Invio = nuova riga, né interrompere la gestione visual viewport/safe area iOS.
- Non introdurre `transition-all`, animazioni di larghezza, virtualizzazione o `ResizeObserver`; rispettare `prefers-reduced-motion` e hover solo per pointer fini.
- Non mostrare ETA, percentuali finte o stati di successo prima della risposta del server.

---

## File structure

| File | Responsabilità |
| --- | --- |
| `src/lib/technical-metrics.ts` | Calcola visibilità effettiva e default preferenza da ruolo, privacy e override nullable. |
| `src/lib/technical-metrics.test.ts` | Matrice USER/admin/superadmin, guest e chat pubblica. |
| `prisma/schema.prisma` | Aggiunge `Preferences.showTechnicalMetrics Boolean?`. |
| `prisma/migrations/*_add_technical_metrics_preference/migration.sql` | Aggiunge la colonna nullable senza backfill. |
| `src/app/api/preferences/route.ts` | Legge e salva l'override esplicito, restituendo il valore effettivo per il profilo. |
| `src/app/api/preferences/route.test.ts` | Copre default role-aware e PATCH booleano/null. |
| `src/app/(marketing)/profile/components/PreferencesSection.tsx` | Toggle persistente “Mostra dettagli tecnici delle risposte”. |
| `src/lib/guest-migration.ts`, `src/lib/guest-migration.test.ts` | Non trasferiscono mai l'override metriche da un guest a un account registrato. |
| `src/lib/channel-flow/types.ts`, `run.ts`, `run.test.ts` | Non inviano `messageMetadata` di metriche nello stream quando non autorizzate. |
| `src/lib/channels/web/chat-route-handler.ts`, `guest-chat-route-handler.ts`, webhook Telegram/WhatsApp | Calcolano o forzano `includeTechnicalMetrics` su ogni chiamata `runChannelFlow`. |
| `src/lib/chat.ts`, `src/app/api/chats/[id]/route.ts` | Eliminano metrics dal payload storico non autorizzato. |
| `src/app/api/guest/chats/[id]/route.ts` | Non serializza mai metrics nel refresh della chat guest. |
| `src/app/api/chat/messages/route.ts` | Porta anche lo storico legacy attraverso lo stesso confine di privacy. |
| `src/app/api/chat/messages/route.test.ts` | Regressione dello storico owner-scoped senza leakage di campi tecnici. |
| `src/app/(chat)/components/TechnicalMetricsDetails.tsx` | Mostra metriche autorizzate in un `<details>` discreto. |
| `src/app/(chat)/components/TechnicalMetricsDetails.test.tsx` | Accessibilità, valori e assenza senza usage. |
| `src/app/(chat)/components/MessageList.tsx` | Gerarchia calma, card metriche, feedback icon-only e overflow menu per azioni secondarie. |
| `src/app/(chat)/components/MessageList.behavior.test.tsx` | Regressioni feedback e azioni/metriche. |
| `src/app/(chat)/chat/loading.tsx` | Skeleton coerente con le nuove superfici conversazionali calme. |
| `src/app/(chat)/components/ChatHeader.tsx` | App bar più compatta e Export con nome accessibile. |
| `src/app/(chat)/components/UsageBanner.tsx` | Non renderizza più una barra vuota soltanto per il toggle sidebar. |
| `src/app/(chat)/chat/layout-client.tsx` | Chrome mobile, Sheet accessibile e trigger/focus della sidebar. |
| `src/app/(chat)/components/SearchDialog.tsx` | Dialog Radix con autofocus e focus return. |
| `src/app/(chat)/chat/layout.test.tsx`, `ChatHeader.test.tsx`, `SearchDialog.test.tsx` | Regressioni mobile, accessibilità e focus management. |

## Task 1: Persist the technical-metrics preference with role-aware defaults

**Files:**

- Create: `src/lib/technical-metrics.ts`
- Create: `src/lib/technical-metrics.test.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/*_add_technical_metrics_preference/migration.sql`
- Modify: `src/app/api/preferences/route.ts`
- Modify: `src/app/api/preferences/route.test.ts`
- Modify: `src/app/(marketing)/profile/components/PreferencesSection.tsx`

**Interfaces:**

- `getDefaultTechnicalMetricsPreference(role: UserRole): boolean`
- `resolveTechnicalMetricsVisibility({ role, preference, isGuest, isPrivateOwner }): boolean`
- `GET /api/preferences` returns stored `showTechnicalMetrics: boolean | null` plus `effectiveShowTechnicalMetrics: boolean`; `PATCH` accepts an explicit `boolean | null` override.

- [ ] **Step 1: Write failing resolver tests.**

  In `src/lib/technical-metrics.test.ts`, table-test these inputs:

  ```ts
  { role: "USER", preference: null, isGuest: false, isPrivateOwner: true, expected: false }
  { role: "ADMIN", preference: null, isGuest: false, isPrivateOwner: true, expected: true }
  { role: "SUPER_ADMIN", preference: null, isGuest: false, isPrivateOwner: true, expected: true }
  { role: "ADMIN", preference: false, isGuest: false, isPrivateOwner: true, expected: false }
  { role: "USER", preference: true, isGuest: false, isPrivateOwner: true, expected: true }
  { role: "SUPER_ADMIN", preference: true, isGuest: true, isPrivateOwner: true, expected: false }
  { role: "SUPER_ADMIN", preference: true, isGuest: false, isPrivateOwner: false, expected: false }
  ```

- [ ] **Step 2: Run the resolver test and confirm it fails.**

  Run: `bunx vitest run src/lib/technical-metrics.test.ts`

  Expected: module resolution failure.

- [ ] **Step 3: Implement the pure visibility resolver.**

  In `src/lib/technical-metrics.ts`, import `UserRole` from generated Prisma and implement:

  ```ts
  export function getDefaultTechnicalMetricsPreference(role: UserRole) {
    return role === "ADMIN" || role === "SUPER_ADMIN";
  }

  export function resolveTechnicalMetricsVisibility(input: {
    role: UserRole;
    preference: boolean | null | undefined;
    isGuest: boolean;
    isPrivateOwner: boolean;
  }) {
    if (input.isGuest || !input.isPrivateOwner) return false;
    return input.preference ?? getDefaultTechnicalMetricsPreference(input.role);
  }
  ```

- [ ] **Step 4: Add nullable schema storage and migrate.**

  Add `showTechnicalMetrics Boolean?` to `Preferences`. Generate the additive migration with `bunx prisma migrate dev --create-only --name add_technical_metrics_preference`; its SQL must be exactly an `ALTER TABLE "Preferences" ADD COLUMN "showTechnicalMetrics" BOOLEAN` without `DEFAULT`, `NOT NULL`, or a data backfill. Run `bunx prisma generate` after reviewing it.

- [ ] **Step 5: Write failing preference and migration route tests.**

  Extend route fixtures with user role. Assert GET for an absent `Preferences` row returns `showTechnicalMetrics: null` plus `effectiveShowTechnicalMetrics: false` to USER and `true` to ADMIN/SUPER_ADMIN. Assert a row with `showTechnicalMetrics: false` overrides the admin default. Assert `PATCH { showTechnicalMetrics: true }` writes `true`; `PATCH { showTechnicalMetrics: null }` writes `null`; strings and unknown keys return `400`.

  In `src/lib/guest-migration.test.ts`, fixture a guest preference whose stored override is `true`, migrate it into both a user with no preferences and one with existing preferences, and assert the target stored override stays `null` or keeps its existing user-owned value. A guest must never determine the registered account's effective default.

- [ ] **Step 6: Implement API, migration safety, and profile toggle.**

  Add `showTechnicalMetrics?: boolean | null` to `PreferencesPatchBody`; accept it in `hasValidPreferenceTypes`, conditional upsert `update`, and `create` as `showTechnicalMetrics: showTechnicalMetrics ?? null`. On GET, select the DB user's role and nullable preference, return both the raw override and `effectiveShowTechnicalMetrics` from `getDefaultTechnicalMetricsPreference` without writing a default back.

  In `migrateGuestToUser()`, deliberately omit this field from the guest-preferences create and merge lists. If a target `Preferences` row must be created from guest preferences, set `showTechnicalMetrics: null`; if it already exists, do not overwrite it. In `PreferencesSection`, bind the switch to `effectiveShowTechnicalMetrics`, add a `Gauge` row labelled “Mostra dettagli tecnici delle risposte”, and send only `{ showTechnicalMetrics: checked }` through the existing `updatePreference` function. Retain the nullable raw API value for a future “usa predefinito” reset; do not collapse it to `false` in the API.

- [ ] **Step 7: Run preference tests and commit.**

  Run:

  ```bash
  bunx vitest run src/lib/technical-metrics.test.ts src/app/api/preferences/route.test.ts src/app/api/preferences/route.integration.test.ts src/lib/guest-migration.test.ts
  ```

  Then commit:

  ```bash
  git add prisma/schema.prisma prisma/migrations src/lib/technical-metrics.ts src/lib/technical-metrics.test.ts src/lib/guest-migration.ts src/lib/guest-migration.test.ts src/app/api/preferences/route.ts src/app/api/preferences/route.test.ts src/app/'(marketing)'/profile/components/PreferencesSection.tsx
  git commit -m "feat(profile): add technical metrics preference"
  ```

## Task 2: Enforce the metric boundary in stream and historical chat payloads

**Files:**

- Modify: `src/lib/channel-flow/types.ts`
- Modify: `src/lib/channel-flow/run.ts`
- Modify: `src/lib/channel-flow/run.test.ts`
- Modify: `src/lib/channels/web/chat-route-handler.ts`
- Modify: `src/lib/channels/web/guest-chat-route-handler.ts`
- Modify: `src/lib/channels/telegram/webhook-handler.ts`
- Modify: `src/lib/channels/whatsapp/webhook-handler.ts`
- Modify: `src/lib/chat.ts`
- Modify: `src/lib/chat.test.ts`
- Modify: `src/app/api/chats/[id]/route.ts`
- Modify: `src/app/api/chats/[id]/route.test.ts`
- Modify: `src/app/api/guest/chats/[id]/route.ts`
- Modify: `src/app/api/guest/chats/[id]/route.test.ts`
- Modify: `src/app/api/chat/messages/route.ts`
- Modify: `src/app/api/chat/messages/route.test.ts`
- Modify: `src/types/chat.ts`

**Interfaces:**

- `InboundContext.execution.includeTechnicalMetrics?: boolean` is default-deny and controls all UI stream/recovery/replay metadata.
- Technical fields are present on a historical `ChatMessage` only after `resolveTechnicalMetricsVisibility()` returns true for a private authenticated owner; unauthorized serializers omit keys entirely, rather than assigning `undefined` or zero values.

- [ ] **Step 1: Write failing stream tests.**

  In `src/lib/channel-flow/run.test.ts`, execute the durable stream with an omitted flag, `false`, and `true`. Consume UI chunks and assert only the true case has a `finish` chunk containing `messageMetadata.inputTokens`; both false paths still persist usage in database/rate-limit paths. Add recovery and replay cases to assert the same default-deny gate applies to `createPersistedResponse`.

- [ ] **Step 2: Run the flow test and confirm it fails on the new option.**

  Run: `bunx vitest run src/lib/channel-flow/run.test.ts`

  Expected: context type or finish metadata assertions fail.

- [ ] **Step 3: Gate stream metadata without changing accounting.**

  Add `includeTechnicalMetrics?: boolean` to `InboundContext.execution`; omitted means false. Change `finishMetadata` and `createPersistedResponse` to accept the resolved boolean, and write `messageMetadata` only when it is true. Pass false (or leave omitted) from guest web, Telegram, WhatsApp and benchmark call sites. In authenticated web chat, use its existing DB user select (which already has `isGuest`) plus the source chat visibility and pass:

  ```ts
  resolveTechnicalMetricsVisibility({
    role: user.role,
    preference: user.preferences?.showTechnicalMetrics,
    isGuest: user.isGuest,
    isPrivateOwner: chat.visibility === "PRIVATE",
  })
  ```

  Keep `persistAssistantOutput`, `MessageMetrics`, AI usage reservation and analytics writes unchanged; this is an outbound-serialization gate, not a retention or billing change.

- [ ] **Step 4: Write failing historic/private payload tests.**

  In `src/lib/chat.test.ts`, `/api/chats/[id]/route.test.ts`, `/api/guest/chats/[id]/route.test.ts` and `/api/chat/messages/route.test.ts`, assert a private admin with null preference receives technical data; a private USER with null does not; explicit `true` USER does; guest owner, public chat owner, and public non-owner viewer do not. Assert all unauthorized response objects lack `model`, `usage`, `ragUsed`, `toolCalls`, token/cost/time fields and raw metadata keys, rather than returning zero-valued fake metrics or `undefined` placeholders.

- [ ] **Step 5: Gate historical serializers with the same resolver.**

  In `getSharedChat()` select the owner's nullable preference, compute `isPrivateOwner` using both `chat.userId === userId` and `chat.visibility === "PRIVATE"`, then conditionally spread `model`, `usage`, `ragUsed`, and `toolCalls` only when the resolver returns true. Do not return raw `metadata` through chat payloads.

  In `GET /api/chats/[id]`, do not assume `getAuthUser()` contains `isGuest`: load the viewer database row with `role`, `isGuest`, and `preferences.showTechnicalMetrics`, then apply the identical rule before mapping every message. In `GET /api/guest/chats/[id]`, remove technical fields from the Prisma select and omit them from the response mapping entirely. In the legacy `GET /api/chat/messages`, select each message's chat visibility, apply the same owner/private resolver, and conditionally spread the diagnostic fields. Never forward the preference itself in response data.

- [ ] **Step 6: Run privacy and channel-flow regressions.**

  Run:

  ```bash
  bunx vitest run src/lib/channel-flow/run.test.ts src/lib/chat.test.ts src/app/api/chats/'[id]'/route.test.ts src/app/api/chats/'[id]'/route.integration.test.ts src/app/api/guest/chats/'[id]'/route.test.ts src/app/api/chat/messages/route.test.ts
  bunx vitest run src/app/api/chat/route.test.ts src/lib/channels/web/guest-chat-route-handler.test.ts
  ```

  Expected: metering remains durable; only the owner-authorized web payload contains response metrics.

- [ ] **Step 7: Commit the metric privacy boundary.**

  ```bash
  git add src/lib/channel-flow/types.ts src/lib/channel-flow/run.ts src/lib/channel-flow/run.test.ts src/lib/channels/web/chat-route-handler.ts src/lib/channels/web/guest-chat-route-handler.ts src/lib/channels/telegram/webhook-handler.ts src/lib/channels/whatsapp/webhook-handler.ts src/lib/chat.ts src/lib/chat.test.ts src/app/api/chats/'[id]'/route.ts src/app/api/chats/'[id]'/route.test.ts src/app/api/guest/chats/'[id]'/route.ts src/app/api/guest/chats/'[id]'/route.test.ts src/app/api/chat/messages/route.ts src/app/api/chat/messages/route.test.ts src/types/chat.ts
  git commit -m "feat(chat): gate technical metrics by preference"
  ```

## Task 3: Make the message surface calm and actions intentional

**Files:**

- Create: `src/app/(chat)/components/TechnicalMetricsDetails.tsx`
- Create: `src/app/(chat)/components/TechnicalMetricsDetails.test.tsx`
- Modify: `src/app/(chat)/components/MessageList.tsx`
- Modify: `src/app/(chat)/components/MessageList.behavior.test.tsx`
- Modify: `src/app/(chat)/chat/loading.tsx`
- Modify: `src/app/(chat)/components/ChatHeader.tsx`
- Create: `src/app/(chat)/components/ChatHeader.test.tsx`

**Interfaces:**

- `TechnicalMetricsDetails({ usage }: { usage: Usage })` renders a closed native `<details>` only when authorized usage exists.
- `MessageList` obtains metrics exclusively from `message.annotations` created by `convertToUIMessages`, never raw `metadata`.

- [ ] **Step 1: Write failing metrics-detail and feedback tests.**

  Test `TechnicalMetricsDetails` renders no content without usage, renders summary “Dettagli tecnici”, and after opening reports total token count, input/output counts and generation duration with accessible text. In `MessageList.behavior.test.tsx`, assert feedback controls have accessible names “Pollice su: risposta utile” and “Pollice giù: risposta non utile”, are icon-only, retain `aria-pressed`, retain negative-reason flow, and persist the same request bodies as before.

- [ ] **Step 2: Run the focused UI tests and confirm the new component fails.**

  Run: `bunx vitest run src/app/'(chat)'/components/TechnicalMetricsDetails.test.tsx src/app/'(chat)'/components/MessageList.behavior.test.tsx`

  Expected: component import and renamed accessible labels fail.

- [ ] **Step 3: Implement a secondary metrics disclosure.**

  `TechnicalMetricsDetails` uses a native `<details className="mt-3 border-t border-border/50 pt-2 text-xs text-muted-foreground">`, an Italian `<summary>` and no live status. It formats duration only when `generationTimeMs` is finite and positive; it omits cost, tool calls and RAG internals from the user surface. There is no numeric placeholder when fields are absent.

- [ ] **Step 4: Simplify bubbles and secondary actions.**

  In `MessageList`, replace the hardcoded assistant lime bubble with a quiet `bg-card`/border surface and make user bubble a muted primary tint rather than a saturated field. Retain contrast for markdown, audio and pending states. Apply the same calm assistant surface to `chat/loading.tsx`, so loading does not flash a legacy lime bubble. Remove `transition-[min-height,width]`; use only a non-width transition or no size animation. Replace existing raw metric block with `<TechnicalMetricsDetails usage={message.annotations?.find(hasUsageMetadata)} />`.

  Keep the feedback group directly visible at a minimum 44 px target on touch viewports, icon-only with the two labels above. Put copy, edit, delete and regenerate in the existing Radix `DropdownMenu` under an icon-only “Altre azioni sul messaggio” trigger; use `DropdownMenuItem` with Italian labels and preserve every existing callback. Do not move thumbs or negative reason into this menu. The confirmation output remains visible after persisted feedback.

- [ ] **Step 5: Make Export accessible and remove broad transitions.**

  In `ChatHeader`, set `aria-label="Esporta conversazione"` on the button, retain visible “Esporta” at `sm` and hidden text on smaller screens, and replace `transition-all` with an explicit allowed property or no transition. Add a test that resolves the icon-only mobile control by accessible name.

- [ ] **Step 6: Run message/header regressions.**

  Run:

  ```bash
  bunx vitest run src/app/'(chat)'/components/TechnicalMetricsDetails.test.tsx src/app/'(chat)'/components/MessageList.behavior.test.tsx src/app/'(chat)'/components/ChatHeader.test.tsx
  bunx vitest run src/app/'(chat)'/chat/chat-reactivity-ui.test.ts src/app/'(chat)'/components/ChatInput.test.tsx
  ```

  Expected: feedback mutation/retry behavior and Enter-newline behavior remain unchanged; raw metrics do not appear unless supplied from server.

- [ ] **Step 7: Commit the message-surface refinement.**

  ```bash
  git add src/app/'(chat)'/components/TechnicalMetricsDetails.tsx src/app/'(chat)'/components/TechnicalMetricsDetails.test.tsx src/app/'(chat)'/components/MessageList.tsx src/app/'(chat)'/components/MessageList.behavior.test.tsx src/app/'(chat)'/chat/loading.tsx src/app/'(chat)'/components/ChatHeader.tsx src/app/'(chat)'/components/ChatHeader.test.tsx
  git commit -m "feat(chat): refine message hierarchy and feedback"
  ```

## Task 4: Consolidate mobile chat chrome without an empty usage bar

**Files:**

- Modify: `src/app/(chat)/components/UsageBanner.tsx`
- Modify: `src/app/(chat)/chat/layout-client.tsx`
- Modify: `src/app/(chat)/chat/[id]/chat-conversation-client.tsx`
- Modify: `src/app/(chat)/components/ChatHeader.tsx`
- Modify: `src/app/(chat)/chat/layout.test.tsx`
- Modify: `src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx`

**Interfaces:**

- `ChatContext` exposes `openSidebar()` and `guestConversationNotice: { remaining?: number; registrationHref: string } | null`.
- `ChatHeader` receives `onOpenSidebar` and optional `guestConversationNotice`; its mobile row is the single conversation app bar.

- [ ] **Step 1: Write failing chrome tests.**

  Add tests asserting `UsageBanner` returns `null` below threshold even when a sidebar trigger is available, and `ChatHeader` renders the mobile sidebar button plus title, accessible Export and compact guest registration/status in one header. Assert no second empty 48/56 px shell is emitted for an authenticated user below threshold.

- [ ] **Step 2: Run the layout/header tests and confirm the empty-shell expectation fails.**

  Run: `bunx vitest run src/app/'(chat)'/chat/layout.test.tsx src/app/'(chat)'/components/ChatHeader.test.tsx`

  Expected: current `UsageBanner` still renders the empty toggle shell.

- [ ] **Step 3: Move mobile triggers and notices into chat chrome.**

  Remove `showToggle` and `onToggleSidebar` from `UsageBanner`; it renders only a threshold-relevant quota notice. In `LayoutClient`, expose `openSidebar()` and a guest object containing the remaining count plus a registration redirect through `ChatContext`. Render `GuestBanner` above landing content only; for a guest conversation, pass that object through `ChatConversationClient` into `ChatHeader` so the header renders the mobile trigger (`md:hidden`), title, Export and one concise registration/status action in the same compact bar. Keep `UsageBanner` above a conversation only when its threshold notice is genuinely relevant.

- [ ] **Step 4: Preserve desktop and composer invariants.**

  Keep desktop sidebar opening, toast-centering dataset and safe-area top behavior intact. Do not put the composer inside the new header or change `PageWrapper`, `chat-mobile-viewport`, `ChatInput` shrink classes, `installChatViewportSizing`, or its visual viewport offset logic. Keep guest registration redirect limited to `/chat` or `/chat/<id>`.

- [ ] **Step 5: Run UI tests.**

  Run:

  ```bash
  bunx vitest run src/app/'(chat)'/chat/layout.test.tsx src/app/'(chat)'/components/ChatHeader.test.tsx src/app/'(chat)'/chat/'[id]'/chat-conversation-client.behavior.test.tsx src/app/'(chat)'/components/ChatInput.test.tsx
  ```

  Expected: no blank bar under quota, mobile trigger works, guest CTA remains scoped, and composer tests pass.

- [ ] **Step 6: Commit mobile chrome.**

  ```bash
  git add src/app/'(chat)'/components/UsageBanner.tsx src/app/'(chat)'/chat/layout-client.tsx src/app/'(chat)'/chat/'[id]'/chat-conversation-client.tsx src/app/'(chat)'/components/ChatHeader.tsx src/app/'(chat)'/chat/layout.test.tsx src/app/'(chat)'/chat/'[id]'/chat-conversation-client.behavior.test.tsx
  git commit -m "feat(chat): consolidate mobile conversation chrome"
  ```

## Task 5: Replace manual overlays with accessible Sheet and Dialog primitives

**Files:**

- Modify: `src/app/(chat)/chat/layout-client.tsx`
- Modify: `src/app/(chat)/components/SearchDialog.tsx`
- Create: `src/app/(chat)/components/SearchDialog.test.tsx`
- Modify: `src/app/(chat)/chat/layout.test.tsx`

**Interfaces:**

- Mobile sidebar uses controlled `Sheet` with `onOpenChange`; when closed, its content is unmounted and cannot be tabbed.
- Search uses controlled `Dialog`; `onOpenAutoFocus` targets its input and `onCloseAutoFocus` returns focus to the element active when it opened.

- [ ] **Step 1: Write failing keyboard tests.**

  In `SearchDialog.test.tsx`, open the dialog from a focused trigger surrogate, assert the textbox receives focus, tab cycles inside dialog, Escape closes, and focus returns to the trigger. In layout behavior coverage, assert mobile sidebar open sets focus in the Sheet, Tab cannot reach a main-content link, Escape/close returns to the opener, and closed sidebar controls are absent from keyboard navigation.

- [ ] **Step 2: Run the new tests and confirm manual overlays do not satisfy them.**

  Run: `bunx vitest run src/app/'(chat)'/components/SearchDialog.test.tsx src/app/'(chat)'/chat/layout.test.tsx`

  Expected: focus/trap assertions fail against the current manually positioned elements.

- [ ] **Step 3: Extract reusable sidebar content and mount it separately for desktop/mobile.**

  In `layout-client.tsx`, extract the existing header/list/bottom markup into a `SidebarContents` component with `onCloseMobile`. Render it in a normal desktop `<aside className="hidden md:flex">`; render it in `SheetContent side="left"` only for the mobile Sheet. Do not use CSS to hide a mounted Radix Sheet on desktop because Radix would still set modal inertness. Track viewport with a small `useSyncExternalStore` media-query helper for `(max-width: 767px)` and mount the Sheet only when it returns true.

  Capture the element that opened the sidebar in `sidebarReturnFocusRef` before setting `isSidebarOpen`; set `onCloseAutoFocus` on `SheetContent` to `event.preventDefault()` and focus that element. Remove the old backdrop button, translated fixed aside, manual `aria-hidden`, and mobile document scroll-lock effect; Radix Sheet owns overlay, focus trap, inertness and scroll lock. Preserve the root `data-chat-sidebar` setting only for the desktop-open state that drives toast positioning.

- [ ] **Step 4: Convert search to the existing Dialog primitive.**

  In `SearchDialog`, replace `if (!isOpen) return null` and manual `role="dialog"` markup with controlled `<Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>`. Use `<DialogContent showCloseButton={false}>`, `DialogTitle` and `DialogDescription` with visually-hidden text, then retain the custom close button. Save `document.activeElement` when the dialog opens; pass `onOpenAutoFocus` to focus `inputRef.current`; pass `onCloseAutoFocus` to restore saved focus. Preserve debounced search, result navigation and Escape behavior supplied by Radix; remove the custom Escape hook to avoid double close.

- [ ] **Step 5: Run keyboard, viewport and layout regression tests.**

  Run:

  ```bash
  bunx vitest run src/app/'(chat)'/components/SearchDialog.test.tsx src/app/'(chat)'/chat/layout.test.tsx src/app/'(chat)'/components/ChatList.test.tsx
  bunx vitest run src/app/'(chat)'/components/ChatInput.test.tsx src/app/'(chat)'/chat/chat-reactivity-ui.test.ts
  ```

  Expected: no focus escape to off-screen controls, and all viewport/composer invariants still pass.

- [ ] **Step 6: Commit accessible overlays.**

  ```bash
  git add src/app/'(chat)'/chat/layout-client.tsx src/app/'(chat)'/components/SearchDialog.tsx src/app/'(chat)'/components/SearchDialog.test.tsx src/app/'(chat)'/chat/layout.test.tsx
  git commit -m "fix(chat): make sidebar and search accessible"
  ```

## Task 6: Run the visual and regression verification pass

**Files:**

- Modify only files identified by a failing test or browser reproduction from Tasks 1–5.

- [ ] **Step 1: Run the complete focused suite.**

  Run:

  ```bash
  bunx vitest run src/lib/technical-metrics.test.ts src/app/api/preferences/route.test.ts src/lib/channel-flow/run.test.ts src/lib/chat.test.ts src/app/api/chats/'[id]'/route.test.ts src/app/'(chat)'/components/TechnicalMetricsDetails.test.tsx src/app/'(chat)'/components/MessageList.behavior.test.tsx src/app/'(chat)'/components/ChatHeader.test.tsx src/app/'(chat)'/components/SearchDialog.test.tsx src/app/'(chat)'/chat/layout.test.tsx src/app/'(chat)'/components/ChatInput.test.tsx
  ```

- [ ] **Step 2: Run project gates.**

  Run:

  ```bash
  bun run lint
  git diff --check
  ```

- [ ] **Step 3: Inspect real desktop and mobile chat in T3 preview.**

  Verify: USER default hides metrics; ADMIN/SUPER_ADMIN default shows a collapsed detail; profile override persists; shared/public and guest never receive metrics; thumbs submit and remain selected; secondary actions are reachable through the menu; mobile header is one compact bar below normal usage; drawer/search focus never escapes; composer remains above iOS keyboard during streaming.

- [ ] **Step 4: Commit any correction discovered during verification.**

  Stage only the exact source and test files changed to correct a reproduced failure, then use a conventional commit matching the corrected subsystem.
