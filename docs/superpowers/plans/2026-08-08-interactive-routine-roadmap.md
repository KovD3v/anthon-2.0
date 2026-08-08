# Interactive Routine Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere le routine coaching oggetti praticabili inline e ritrovabili in una raccolta sticky nella sidebar, mantenendo compatibilità con le routine già salvate, persistenza esplicita del completamento e privacy owner-scoped.

**Architecture:** Un contratto Zod discriminato e versionato separa il formato v1 storico dal formato v2 tipizzato. Il server valida e normalizza le routine prima della persistenza; il client usa una state machine locale per il runner inline e crea un RoutineAttempt solo dopo la conferma esplicita. La raccolta usa un endpoint owner-scoped con cursore stabile e viene sincronizzata dal ChatContext dopo risposte autorevoli, senza introdurre una dashboard.

**Tech Stack:** Next.js 16 App Router, React/TypeScript, AI SDK UI messages e tool loop, Prisma/PostgreSQL/Neon, Zod, Radix UI, Framer Motion, Vitest + Testing Library, Bun e Biome, PostHog privacy-safe.

## Global Constraints

- Preservare il worktree utente non correlato: docs/user-plan-states.md modificato e docs/superpowers/plans/2026-08-07-context-aware-rag-implementation.md non devono essere inclusi nei commit della feature.
- Prima di qualunque verifica applicativa eseguire bunx prisma generate: il client generato deve esporre sia Preferences.showTechnicalMetrics sia prisma.routine; non usare db push per mascherare una migrazione mancante.
- Mantenere le routine v1 leggibili ed eseguibili come passi instruction; non riscrivere automaticamente i JSON storici.
- Le nuove proposte usano soltanto il formato v2 e un’unione discriminata chiusa: il modello compila dati, non genera codice, JSX, markup o widget arbitrari.
- Il server resta la source of truth per ownership, formato, stato, tentativi, storico e riferimenti sorgente. Guest, chat pubbliche e non-owner non ricevono routine persistenti, raccolta, tentativi o contenuti di routine.
- Possono coesistere più routine ACTIVE; nessun campo primary/pin/tag/cartella/ricerca viene introdotto nella prima versione.
- Avviare, mettere in pausa, comprimere, cambiare chat o ricaricare non crea dati persistenti. Solo Ho completato la routine crea il tentativo; solo la conferma del check-in registra l’outcome.
- Nessuna percentuale o progresso temporale fittizio: il timer usa timestamp/tempo trascorso e ricalcola dopo background/foreground.
- Il runner resta inline nella RoutineCard; non introdurre modali, pannelli, nuove pagine o una dashboard.
- Tutti i controlli touch hanno almeno 44×44 px; stato, fase, tempo e completamento sono sempre espressi anche con testo; rispettare prefers-reduced-motion.
- Non reintrodurre virtualizzazione, ResizeObserver o logica diversa di scroll in MessageList; preservare throttle streaming 50 ms, visual viewport iOS, safe-area e focus management già stabilizzati.
- La memoria resta post-generation: nessuna estrazione/scrittura memoria deve ritardare o diventare un tool durante la generazione principale della risposta.
- Gli eventi analytics non possono contenere titolo, trigger, passi, testo della routine, note o risposte al form; usare solo identificatori interni, versione, kind, durata numerica limitata e stato tecnico.
- Usare Bun e Biome; ogni slice deve aggiungere test RED prima del codice, verificare GREEN, eseguire i gate proporzionati e chiudersi con un commit Conventional Commit.
- Per API/migrazioni usare test unitari e, quando il runner Neon è disponibile, test d’integrazione su database effimero; non dichiarare verifiche browser o produzione non eseguite.

---

## Task 0 — Allineare il client Prisma e fissare il baseline

**File ownership:** prisma/schema.prisma, prisma/migrations/ (solo la migrazione della feature), artefatti generati da Prisma se tracciati, test esistenti lasciati invariati salvo fixture necessarie.

- [ ] Registrare il baseline senza includere i due documenti utente: git status --short --branch e git diff --check.
- [ ] Eseguire bunx prisma generate e bunx prisma validate; verificare con un piccolo test Node/TypeScript che il client esponga prisma.user.findUnique con showTechnicalMetrics e prisma.routine.findFirst.
- [ ] Eseguire bunx vitest run src/lib/coaching/routine.test.ts src/lib/coaching/routine-client.test.ts per distinguere un errore di client generato da un errore di dominio.
- [ ] Se la cronologia locale è aggiornata ma il client era stale, documentare il risultato nel report del task e non creare una migrazione correttiva vuota.
- [ ] Verificare bun run typecheck prima di introdurre nuovi tipi; il task è GREEN quando gli errori mostrati dall’utente non sono più riproducibili sul database/configurazione locale corrente.
- [ ] Commit: chore(coaching): align generated prisma client.

## Task 1 — Contratto routine v2, normalizzazione v1 e migrazione

**File ownership:** prisma/schema.prisma, prisma/migrations/20260808150000_add_routine_format_version/migration.sql, src/lib/coaching/routine.ts, src/lib/coaching/routine.test.ts, src/lib/model-experiments/types.ts.

- [ ] Aggiungere RED in routine.test.ts per: v1 con steps string[], v2 valido, ogni discriminante sconosciuta, passi fuori limite, timer.durationSeconds fuori limite, respirazione con cicli/secondi fuori limite, form non terminale, form con meno o più di tre opzioni, outcome duplicati o mancanti e ID passo duplicati.
- [ ] Definire in routine.ts i tipi/esportazioni chiuse:
  - RoutineInstructionStep: id, kind instruction, text.
  - RoutineTimerStep: id, kind timer, label, instruction, durationSeconds intero 5–900.
  - RoutineBreathingStep: id, kind breathing, label, instruction, inhaleSeconds/exhaleSeconds 1–30, holdAfterInhaleSeconds/holdAfterExhaleSeconds 0–30, cycles intero 1–12.
  - RoutineFormStep: id, kind form, question, mode scale o choice, tre opzioni con label e mapping unico verso HELPFUL, PARTIALLY_HELPFUL, NOT_HELPFUL, noteEnabled.
  - RoutinePracticeStep = instruction | timer | breathing, RoutineCompletionForm = form, RoutineStep = practice | form.
- [ ] Validare che una proposta v2 abbia formatVersion 2, 1–6 passi pratici, al massimo un form terminale e nessun passo dopo il form; applicare limiti di testo e normalizzare label/whitespace.
- [ ] Conservare uno schema routineProposalV1Schema compatibile con il JSON attuale e uno schema routineProposalV2Schema; esportare storedRoutineProposalSchema come unione per messaggi/card già persistiti.
- [ ] Implementare normalizeRoutineProposal: ogni stringa v1 diventa instruction-index e un passo instruction; v2 conserva gli ID; separare il form terminale in completionForm senza includerlo nel conteggio Passo N di M.
- [ ] Aggiornare RoutineCardData, routineCardDataSchema, RoutineCardRecord, confronto proposal e parser di source hydration per trasportare formatVersion e accettare v1/v2 senza indebolire il controllo di identità della sorgente.
- [ ] Aggiungere formatVersion Int @default(1) a Routine e creare la migrazione additiva 20260808150000_add_routine_format_version con default 1 per i record esistenti; non cambiare le relazioni SetNull già esistenti.
- [ ] Aggiornare AnthonUIMessage e gli schemi data-part in src/app/(chat)/chat/[id]/chat-conversation-client.tsx per validare sia il proposal v1 storico sia il v2, lasciando il tool nuovo vincolato al v2.
- [ ] Verificare RED→GREEN con bunx vitest run src/lib/coaching/routine.test.ts 'src/app/(chat)/chat/[id]/page.test.tsx' 'src/app/(chat)/components/MessageList.behavior.test.tsx', poi bunx prisma validate && bunx prisma generate && bun run typecheck.
- [ ] Commit: feat(coaching): add versioned routine step contract.

## Task 2 — Proposta AI v2, persistenza dei payload e memoria post-generation

**File ownership:** src/lib/ai/tools/routine-proposal.ts, src/lib/ai/tools/routine-proposal.test.ts (nuovo), src/lib/ai/orchestrator.ts, src/lib/ai/intent.ts, src/lib/ai/intent.test.ts, src/lib/ai/orchestrator.test.ts, src/lib/channel-flow/persistence.ts, src/lib/channel-flow/persistence.test.ts, src/lib/channel-flow/run.test.ts e src/lib/ai/routine-model-contract.test.ts (nuovo).

- [ ] Aggiungere RED al test del tool per rifiutare v1/JSON libero e accettare il solo v2 con instruction, timer e, quando previsto, form terminale.
- [ ] Aggiornare descrizione e inputSchema di proposeRoutine affinché richiedano formatVersion 2, ID stabili, limiti server-side e mapping canonico del form; il tool continua a proporre e non salvare.
- [ ] Aggiornare PROMPT_ROUTINE_PROPOSAL_POLICY con i tipi di passo disponibili, il vincolo del form post-completamento e il divieto di interpretare testo libero come widget.
- [ ] Mantenere la priorità routine su web search: aggiungere il prompt reale Preparami una routine mentale pratica per la gara di domani ai test e verificare che tinyfishSearch non sia attivo mentre proposeRoutine è obbligatorio.
- [ ] Verificare guest e utenti registrati su ogni modello/tier configurato con uno smoke contract che controlli l’input v2, senza persistere routine guest.
- [ ] Verificare nel tool loop che dopo proposeRoutine restino disponibili solo gli eventuali tool post-routine consentiti; nessun tool di memoria deve eseguire la scrittura durante la generazione principale.
- [ ] Aggiungere test di persistenza che assicurino che data-coachingRoutine conservi il proposal v2 validato, che un payload malformato non diventi card e che memory/profile extraction inizi soltanto nel post-generation già previsto.
- [ ] Verificare RED→GREEN con i test AI/channel mirati, bun run lint, bun run typecheck e git diff --check.
- [ ] Commit: feat(ai): emit validated interactive routine proposals.

## Task 3 — State machine runner, timer e accessibilità di base

**File ownership:** src/lib/coaching/routine-runner.ts, src/lib/coaching/routine-runner.test.ts, src/app/(chat)/components/RoutineRunner.tsx, src/app/(chat)/components/RoutineRunner.test.tsx.

- [ ] Scrivere RED per la state machine: start/paused/reset, avanzamento manuale instruction, timer che arriva a zero senza avanzare automaticamente, completamento solo dopo l’ultimo passo e uscita senza persistenza.
- [ ] Implementare funzioni pure per getRoutinePracticeSteps, createInitialRunnerState, startRunner, pauseRunner, resetRunner, advanceRunner, getRemainingMs e getBreathingPhase; il tempo deve derivare da timestamp/elapsed, non da decrementi di intervallo.
- [ ] Implementare RoutineRunner come componente controllato localmente: props routine, onComplete, onClose, completionForm; nessuna fetch o mutazione Prisma nel componente.
- [ ] Rendere instruction con pulsante Fatto, timer con Avvia, Pausa, Ripristina, testo Tempo terminato e comando manuale Continua; esporre Passo N di M senza percentuali.
- [ ] Gestire cambio tab con visibilitychange e ricalcolo dal timestamp; implementare Wake Lock solo come enhancement opzionale, rilasciato in pausa, chiusura, background e unmount.
- [ ] Usare aria-live solo per avvio, pausa, cambio fase e termine; il testo numerico resta visibile ma non viene annunciato ogni secondo; focus iniziale sul runner e focus di ritorno sul comando di avvio.
- [ ] Applicare prefers-reduced-motion a espansione e cambi di stato; verificare 44 px minimi e tastiera completa in component test.
- [ ] Verificare RED→GREEN con bunx vitest run src/lib/coaching/routine-runner.test.ts src/app/(chat)/components/RoutineRunner.test.tsx, poi Biome e typecheck.
- [ ] Commit: feat(chat): add local routine runner state machine.

## Task 4 — Integrare runner, completamento esplicito e check-in

**File ownership:** src/app/(chat)/components/RoutineCard.tsx, src/app/(chat)/components/RoutineCard.test.tsx, src/app/(chat)/components/RoutineCheckInForm.tsx, src/app/(chat)/components/RoutineCheckInForm.test.tsx, src/app/(chat)/components/MessageList.tsx, src/app/(chat)/components/MessageList.behavior.test.tsx, src/app/(chat)/chat/[id]/chat-conversation-client.tsx, src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx e src/app/(chat)/chat/page.tsx.

- [ ] Aggiungere RED per Avvia routine che espande inline senza chiamare API, chiusura che mette in pausa e ripristina il focus, refresh/cambio chat che non crea tentativi, e runner che mostra Ho completato la routine solo alla fine.
- [ ] Sostituire l’azione primaria della card attiva con l’avvio del runner; mantenere La provo ora per una proposta non salvata/guest senza fingere che sia stata eseguita.
- [ ] Collegare il completamento al callback esistente onCreateRoutineAttempt(routineId); usare lo stesso clientActionId per ogni retry della stessa conclusione, aggiornare card/sidebar solo con la risposta server e aprire il check-in solo dopo successo.
- [ ] Lasciare il runner sul riepilogo finale con errore e comando Riprova se POST restituisce 409/422/network error; non cancellare il progress locale prima della risposta.
- [ ] Estendere RoutineCheckInForm per leggere il RoutineCompletionForm terminale, mantenere i tre outcome canonici, mostrare la domanda/opzioni configurate e conservare selezione/nota dopo un errore di PATCH.
- [ ] Rimuovere dal percorso principale qualunque testo che presenti Segna un tentativo come equivalente all’avvio; se l’azione legacy resta disponibile, marcarla come compatibilità esplicita e testare che non attivi il runner.
- [ ] Aggiornare MessageList e ChatConversationClient con le nuove props senza cambiare la logica di scroll lineare, throttle 50 ms o hydration source.
- [ ] Verificare RED→GREEN con i test RoutineCard/Form/MessageList/conversation, bun run lint, bun run typecheck e git diff --check.
- [ ] Commit: feat(chat): connect routine runner to explicit completion.

## Task 5 — API owner-scoped della raccolta e client di sincronizzazione

**File ownership:** src/app/api/coaching/routines/route.ts, src/app/api/coaching/routines/route.test.ts, src/app/api/coaching/routines/route.integration.test.ts, src/lib/coaching/routine-return.server.ts, src/lib/coaching/routine-client.ts, src/lib/coaching/routine-client.test.ts.

- [ ] Aggiungere RED per GET /api/coaching/routines?mode=collection: user non autenticato 401, guest 403, status invalido 400, owner ACTIVE/ARCHIVED separati, foreign/public assenti, payload senza chat o messaggi.
- [ ] Conservare il contratto di rientro esistente per mode=return e rendere esplicito il parametro nel client; il GET senza parametro può rimanere alias compatibile solo se coperto da test.
- [ ] Implementare il payload collection:
  { routines: RoutineCardData[], total: number, nextCursor: string | null }
  con status ACTIVE|ARCHIVED, limit 1–20 (default 8) e cursor base64url composto da updatedAt + id.
- [ ] Ordinare in modo autorevole per attività più recente: ogni POST attempt aggiorna Routine.updatedAt, poi updatedAt DESC, id DESC; includere il solo ultimo attempt con tie-breaker attemptedAt DESC,id DESC.
- [ ] Restituire soltanto RoutineCardData sanitizzato; nessun testo messaggi, prompt, metadata, tool call o dati di utenti diversi.
- [ ] Aggiungere in routine-client.ts gli schemi strict e fetchRoutineCollection({ status, cursor, limit }); gli errori di rete/schema/status devono usare RoutineClientError già esistente.
- [ ] Aggiornare getActiveRoutineForReturn per usare lo stesso ordinamento e il client Prisma generato; testare più routine ACTIVE e fallback quando la sorgente è stata eliminata.
- [ ] Eseguire unit e disposable Neon: bunx vitest run src/app/api/coaching/routines/route.test.ts src/lib/coaching/routine-client.test.ts e bun run test:integration secondo il runner disponibile; verificare lint/typecheck.
- [ ] Commit: feat(api): expose paginated routine collection.

## Task 6 — Sezione Routine sticky nella sidebar desktop/mobile

**File ownership:** src/app/(chat)/components/RoutineSidebarShelf.tsx, src/app/(chat)/components/RoutineSidebarShelf.test.tsx, src/app/(chat)/chat/layout.tsx, src/app/(chat)/chat/layout-client.tsx, src/app/(chat)/chat/layout-client.test.tsx e src/app/(chat)/chat/layout.test.tsx.

- [ ] Aggiungere RED che verifichi quattro regioni: header/actions, chat list scrollabile, shelf routine sticky e profilo sticky; la shelf non deve spostare il profilo quando si espande.
- [ ] Estendere getChatSidebarData con un payload iniziale leggero per la raccolta autenticata non-guest, oppure inizializzare da fetchRoutineCollection nel client senza esporre dati guest; mantenere activeRoutine separata per il returning check-in.
- [ ] Estendere ChatContextType con routineCollection, refreshRoutineCollection e navigateToRoutine; usare un sequence/ref di risposta per impedire che una risposta vecchia sovrascriva una mutazione recente.
- [ ] Creare RoutineSidebarShelf con stato compatto sempre visibile: etichetta Routine, count ACTIVE, routine più recente, durata/stato e comando di espansione; lo stato vuoto deve essere una riga discreta.
- [ ] Implementare lo stato espanso verso l’alto con lista ACTIVE e filtro secondario Archiviate; usare scroll interno/paginazione controllata e una min-height utile per la lista chat.
- [ ] Selezionare la sorgente con un href owner-safe: /chat/:sourceChatId?checkInRoutineId=:routineId quando sorgente e messaggio esistono, altrimenti /chat?checkInRoutineId=:routineId; non ricostruire messaggi fittizi e non avviare automaticamente il runner.
- [ ] Su mobile chiudere lo Sheet prima della navigazione e ripristinare il focus; testare insieme al focus trap/return già presente, alla ricerca e al percorso /chat/usage.
- [ ] Dopo save, attempt, outcome, archive, cancellazione chat o cancellazione messaggio, aggiornare la shelf soltanto con la risposta autorevole; mostrare retry sobrio per errore GET senza rompere la chat.
- [ ] Verificare RED→GREEN con shelf/layout/page test, bun run lint, bun run typecheck, build locale e git diff --check.
- [ ] Commit: feat(chat): add sticky routine sidebar shelf.

## Task 7 — Respirazione guidata e form terminale

**File ownership:** src/lib/coaching/routine-runner.ts, src/lib/coaching/routine-runner.test.ts, src/app/(chat)/components/RoutineRunner.tsx, src/app/(chat)/components/RoutineRunner.test.tsx, src/app/(chat)/components/RoutineCheckInForm.tsx, test component correlati.

- [ ] Aggiungere RED per la respirazione: fase inhale/exhale/hold, avanzamento automatico delle fasi interne, numero limitato di cicli, ricalcolo corretto dopo background e avanzamento manuale soltanto tra step.
- [ ] Implementare getBreathingPhase con tempo derivato da timestamp e output testuale Inspira, Espira, Pausa, ciclo corrente e secondi residui; non annunciare ogni tick.
- [ ] Rendere l’animazione dell’indicatore subordinata a reduced motion; in reduced motion mostrare solo lo stato/fase testuale e un cambio discreto.
- [ ] Aggiungere RED per il form terminale: invisibile durante i passi, visibile dopo il tentativo creato, tre mapping canonici esatti, nota opzionale locale e valori persistenti dopo errore.
- [ ] Collegare la conferma del form alla PATCH outcome esistente senza accettare scale arbitrarie, JSON opaco o un outcome derivato dal testo.
- [ ] Verificare component/state tests su desktop/mobile simulati, bun run lint, bun run typecheck e git diff --check.
- [ ] Commit: feat(chat): add breathing and structured routine check-in.

## Task 8 — Storico dei tentativi, adattamento e analytics privacy-safe

**File ownership:** prisma/schema.prisma, prisma/migrations/20260808160000_link_routine_adaptations/migration.sql, src/app/api/coaching/routines/[routineId]/attempts/route.ts, src/app/api/coaching/routines/[routineId]/attempts/route.test.ts, src/app/api/coaching/routines/[routineId]/attempts/route.integration.test.ts (nuovo), src/lib/coaching/routine-client.ts, src/app/(chat)/components/RoutineHistory.tsx, src/app/(chat)/components/RoutineHistory.test.tsx, src/app/(chat)/components/RoutineCard.tsx, src/app/(chat)/chat/[id]/chat-conversation-client.tsx, src/lib/analytics/routines.ts, src/lib/analytics/routines.test.ts, src/lib/coaching/routine-analytics-client.ts e src/lib/coaching/routine-analytics-client.test.ts.

- [ ] Aggiungere RED per GET /api/coaching/routines/:routineId/attempts: owner autenticato, guest/non-owner 403/404, cursor stabile, ordine attemptedAt DESC,id DESC, note/outcome soltanto al proprietario.
- [ ] Implementare il GET paginato con payload { attempts, nextCursor }; riusare l’idempotenza POST esistente e non alterare i tentativi già creati.
- [ ] Aggiungere alla relazione Routine un riferimento opzionale self-owned derivedFromRoutineId/lista adattamenti e la migrazione additiva 20260808160000_link_routine_adaptations; la cancellazione della routine sorgente non deve cancellare l’adattamento.
- [ ] Aggiornare il salvataggio della proposta per accettare un contesto adattamento solo se il server verifica che la routine origine appartiene all’utente; mai fidarsi di userId dal client.
- [ ] Rendere Adatta la routine un flusso strutturato: conserva localmente l’origine fino alla risposta assistant, passa il riferimento verificato al salvataggio della nuova card e non sovrascrive la routine originale.
- [ ] Creare RoutineHistory inline/collassabile nella card o nella shelf con ultimo esito, date e frequenza leggibile; non mostrare streak, badge, ranking o punteggi AI.
- [ ] Definire gli eventi routine_proposed, routine_saved, routine_started, routine_completed, routine_check_in_completed, routine_restarted_within_14d in helper validati; proprietà ammesse: ID hash/opaque, format_version, widget_kind, durata limitata, stato tecnico e finestra temporale.
- [ ] Aggiungere test che serializzino gli eventi e dimostrino l’assenza di titolo, trigger, steps, note e risposte form; testare anche la seconda esecuzione a 7/14 giorni come evento aggregato senza contenuto.
- [ ] Verificare API/component/analytics, migrazione, lint, typecheck e git diff --check.
- [ ] Commit: feat(coaching): add routine history adaptation and analytics.

## Task 9 — Hardening verticale, runtime e criteri di uscita

**File ownership:** test e documentazione strettamente correlati alla feature; non modificare i documenti utente fuori scope.

- [ ] Eseguire il set unit completo sui contratti, runner, card, sidebar, API e chat con bunx vitest run src/lib/coaching src/app/api/coaching 'src/app/(chat)/components' 'src/app/(chat)/chat'; correggere solo regressioni introdotte dalla roadmap.
- [ ] Eseguire bun run lint, bun run typecheck, bun run build, git diff --check e bunx prisma validate; registrare eventuali warning PostHog separatamente dai failure di compilazione.
- [ ] Eseguire bun run test:integration su Neon effimero per migrazioni v1/v2, ownership, guest/public/non-owner, più routine ACTIVE, cursori concorrenti, idempotenza e source deletion.
- [ ] Avviare il dev server e verificare con il preview browser disponibile: desktop e mobile, proposta → salvataggio → shelf dopo refresh → apertura sorgente → Avvia → pausa/reset → background timer → completamento → check-in → history → riuso → archive; catturare gli ID di chat/routine solo localmente.
- [ ] Verificare tastiera, focus return del drawer, screen-reader labels, reduced motion, touch target, errore/retry POST/PATCH e nessuna persistenza su close/refresh a metà runner.
- [ ] Eseguire smoke contract sui modelli/tier guest e registrati, incluso il prompt routine che in precedenza veniva erroneamente inviato a TinyFish; verificare che memoria resti post-generation.
- [ ] Aggiornare la documentazione tecnica della feature in docs/superpowers/specs/2026-08-08-interactive-routine-roadmap-design.md solo se un contratto implementato differisce dalla spec approvata; non aggiungere documenti paralleli o note non verificabili.
- [ ] Fare un audit finale dei diff per confermare che ogni commit contiene soltanto i file del task e che i due documenti utente restano non staged.
- [ ] Se gli hardening test introducono correzioni, creare il commit chore(coaching): harden interactive routine beta; in assenza di correzioni non creare un commit vuoto.

## Criterio di completamento

La roadmap è completata quando un utente registrato può ricevere una proposta v2 valida, salvarla, ritrovarla nella shelf sticky dopo refresh, aprire la sorgente, eseguire instruction/timer/breathing inline senza risultato implicito, confermare esplicitamente il completamento, registrare outcome e nota, consultare lo storico, creare una nuova proposta adattata senza sovrascrivere l’originale, riusare la routine entro 7–14 giorni e archiviarla senza perdere lo storico. Una routine v1 continua a funzionare come sequenza di istruzioni e nessun dato routine viene esposto a guest, pubblico, non-owner o analytics.
