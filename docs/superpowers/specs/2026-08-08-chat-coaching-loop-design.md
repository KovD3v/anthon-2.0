# Chat coaching loop e UI/UX conversazione

## Contesto

La chat di Anthon deve sembrare uno spazio di lavoro per la performance, non una
console generica di AI. Oggi una risposta può essere utile, ma il passaggio da
consiglio a pratica non ha un oggetto persistente né un modo chiaro per tornare
sull'esito. Inoltre le metriche tecniche occupano attenzione nella lettura e le
azioni di una risposta sono troppo dense soprattutto su mobile.

Questa evoluzione introduce un loop operativo leggibile:

```text
proposta → routine attiva → tentativo → check-in / esito → adattamento
```

La chat resta il luogo della conversazione. La routine è invece un piccolo
impegno esplicito e persistente, salvato solo quando la persona lo conferma.

## Obiettivi

- Rendere ogni buona risposta traducibile in una pratica concreta, breve e
  recuperabile nel tempo.
- Rendere visibile la prossima azione senza trasformare la chat in una dashboard.
- Ridurre il rumore visivo: superficie di lettura calma, un accento giallo per
  l'azione e dettagli tecnici solo quando richiesti.
- Conservare affidabilità e continuità dell'attuale chat: streaming, iOS,
  audio, allegati, paginazione, error recovery e feedback persistente.
- Rendere drawer e ricerca utilizzabili da tastiera e screen reader.

## Fuori ambito

- Nessun salvataggio automatico di routine, tentativi o esiti derivato dal
  modello.
- Nessuna streak, classifica, punteggio automatico, dashboard, reminder o
  notifica nella prima release.
- Nessuna modifica al routing AI, RAG, pricing, quote o flussi di voce.
- Nessuna routine persistente per guest e nessuna migrazione retroattiva di
  routine guest.
- Nessuna esposizione di routine, tentativi, esiti o metriche in un link chat
  condiviso/pubblico.

## Principi di esperienza

### Calma operativa

Il contenuto della risposta resta il protagonista. Le bolle molto sature sono
sostituite da superfici più sobrie e leggibili; il giallo di marca segnala una
singola azione importante, stato attivo o progresso, senza gareggiare con il
testo. Le separazioni, le etichette e i metadati sono più leggeri del contenuto.

### Una scelta esplicita prima della persistenza

Una proposta non è una routine attiva. L'assistente può strutturare una scheda,
ma il salvataggio avviene esclusivamente dopo il comando esplicito **Salva
routine** dell'utente autenticato. La UI non comunica mai che qualcosa è stato
salvato prima della risposta positiva del server.

### Dalla conversazione alla pratica, senza forzature

Una scheda appare soltanto quando la risposta contiene una proposta utile e
attuabile. La persona può ignorarla e continuare a chattare. Una routine attiva
crea il contesto per il check-in, ma il generico “Com'è andata?” resta disponibile
quando non esiste una routine attiva.

### Dettagli tecnici opt-in

Token, tempi e costi non sono parte del coaching. Rimangono disponibili per chi
li vuole consultare, con preferenza persistente e default coerente con il ruolo.

## Esperienza principale

### 1. Proposta nella risposta dell'assistente

Quando l'assistente propone una pratica, sotto la risposta compare una scheda
inline, non un messaggio separato. La scheda usa una gerarchia editoriale:

- etichetta discreta “Routine proposta”;
- titolo concreto orientato all'azione;
- innesco/situazione (“Quando…”);
- durata o finestra temporale, se disponibile;
- da due a tre passi brevi;
- un segnale di completamento osservabile (“Saprai che è riuscita quando…”);
- azione primaria **Salva routine**;
- azione secondaria **La provo ora** che focalizza il composer con un invito
  effimero alla pratica, senza creare né dichiarare un tentativo.

La proposta rimane legata al messaggio che l'ha generata, così il contesto resta
comprensibile anche dopo un refresh. Se la risposta non contiene una proposta
strutturata, non compare alcuna scheda vuota o call-to-action artificiale.

### 2. Utente autenticato: conferma e routine attiva

Premendo **Salva routine**, il pulsante entra in stato di invio e crea la
routine. Dopo la conferma server, la stessa scheda cambia stato in **Routine
attiva**: mostra il titolo, il prossimo passo e tre azioni ordinate per
importanza:

1. **Segna un tentativo**
2. **Com'è andata?**
3. Archivia (azione secondaria, protetta da conferma quando appropriato)

Se la richiesta fallisce, la proposta resta invariata, viene mostrato un errore
italiano recuperabile e l'utente può riprovare. Doppio click, refresh e risposta
ritardata non devono creare due routine: la creazione è idempotente rispetto alla
proposta sorgente e all'utente.

### 3. Guest: proposta visibile, salvataggio dietro registrazione

Un guest può leggere la scheda proposta e capire il valore del loop, ma
**Salva routine** apre il percorso di registrazione/accesso. Non viene creato un
record guest e non viene mostrato uno stato “salvato”. Dopo autenticazione, il
ritorno porta alla conversazione originale, dove la proposta può essere salvata
esplicitamente. Questo conserva una scelta consapevole e non richiede migrazioni
di dati coaching del guest.

### 4. Tentativo e check-in

**Segna un tentativo** crea un tentativo datato per la routine attiva, con un
feedback minimo e onesto: “Tentativo segnato”. Non implica che la routine sia
riuscita.

**Com'è andata?** apre un piccolo check-in contestuale alla routine attiva,
inline alla scheda. Raccoglie un esito volontario e una nota breve opzionale,
entrambi salvati solo dopo conferma. L'esito aggiornato diventa parte del
tentativo più recente; se non esiste ancora un tentativo, la conferma del
check-in crea in modo esplicito il primo tentativo con il suo esito. Nulla viene
inferito dal testo libero della chat.

Dopo un esito, la scheda propone **Adatta la routine**. Questa azione precompila
un messaggio contestuale per l'assistente; non cambia la routine da sola. Una
nuova proposta segue di nuovo il ciclo di conferma esplicita.

### 5. Rientro in chat

Il launcher “Com'è andata?” mantiene il suo comportamento generico quando non
esiste una routine attiva. Quando esiste, usa la routine attiva come contesto per
il check-in strutturato. Non sostituisce né riscrive la conversazione precedente.

## Stati della scheda

| Stato | Significato | Azioni visibili |
| --- | --- | --- |
| Proposta | Output dell'assistente, ancora non persistito | Salva routine; La provo ora (senza persistenza) |
| Salvataggio | Richiesta esplicita in corso | Stato occupato, nessuna azione duplicabile |
| Attiva | Routine persistita e pronta alla pratica | Segna un tentativo; Com'è andata?; Archivia |
| Tentativo segnato | Esiste un tentativo senza esito | Com'è andata?; Adatta la routine |
| Esito registrato | Il tentativo ha un risultato esplicito | Adatta la routine; Archivia |
| Archiviata | Routine chiusa, storico leggibile | Nessuna CTA primaria |

Gli stati devono essere riconoscibili anche senza colore: etichetta testuale,
titolo e stato del bottone comunicano il cambiamento.

## Modello dati e proprietà

### Entità

La prima release usa due entità di dominio, separate da `Message.metadata` e da
Memory:

- **Routine**: appartiene a un utente, conserva snapshot della proposta
  confermata (titolo, innesco, durata, passi, segnale di completamento), stato,
  data di salvataggio/archiviazione e riferimenti opzionali al chat e messaggio
  sorgente.
- **RoutineAttempt**: appartiene a una routine e registra il momento del
  tentativo, l'esito esplicito e una nota opzionale del check-in.

Il check-in e l'outcome sono campi/stato di `RoutineAttempt` nella v1, non nuove
tabelle premature. Gli eventuali riferimenti `sourceChatId` e `sourceMessageId`
usano `ON DELETE SET NULL`: eliminare una chat o un messaggio non elimina la
routine salvata né lo storico dei tentativi.

### Invarianti

- Solo un utente autenticato può possedere routine e tentativi.
- Solo il proprietario può leggere, creare, aggiornare o archiviare i propri
  record.
- Una routine nasce soltanto da una proposta strutturata verificabile collegata
  a un messaggio dell'assistente appartenente allo stesso utente.
- Una routine attiva non viene automaticamente sostituita da una nuova proposta.
- La creazione di un tentativo e il salvataggio di un check-in sono operazioni
  esplicite e idempotenti rispetto alla relativa azione UI.
- Chat condivise e endpoint pubblici non serializzano questi record.

## Contratti applicativi

La proposta structured deve essere persistita insieme al messaggio assistant in
una forma ri-idratabile e validata. Il client non considera autorevole un payload
ricevuto solo dallo stream: dopo refresh legge proposta e stato routine dai dati
privati della chat.

Le route owner-scoped devono coprire almeno:

- creazione idempotente di una routine da proposta/messaggio sorgente;
- lettura della routine e dello stato relativo a un messaggio privato;
- creazione di un tentativo;
- aggiornamento del suo esito e nota;
- archiviazione della routine.

Le route verificano autenticazione, proprietà di chat e messaggio e schema del
payload sul server. Il client non invia mai un `userId` come autorizzazione.

## Metriche tecniche

### Preferenza persistente

La sezione esistente **Preferenze** nel profilo contiene un toggle
“Mostra dettagli tecnici delle risposte”. Il valore database è nullable per
distinguere chi non ha mai scelto:

```text
effectiveShowTechnicalMetrics = preference.showTechnicalMetrics
  ?? (role === ADMIN || role === SUPER_ADMIN)
```

Quindi il default effettivo è attivo per ADMIN e SUPER_ADMIN e inattivo per USER;
ogni utente autenticato può cambiarlo e il cambiamento viene salvato subito.
Una promozione o retrocessione di ruolo aggiorna il default finché la persona non
ha espresso una preferenza esplicita.

### Privacy e rendering

Le metriche (token input/output/totali, durata e campi equivalenti) sono incluse
nei dati privati della chat solo quando il valore effettivo è attivo. Il client
le rende in un dettaglio discreto e richiudibile, non nel flusso di lettura
principale. Per guest, chat condivise/pubbliche e qualunque serializzazione non
owner, le metriche non vengono inviate affatto; nasconderle con CSS non è
sufficiente.

Se una preferenza cambia, un refresh dei dati privati riflette subito il nuovo
stato. I messaggi esistenti restano leggibili anche se non contengono metriche.

## Feedback sulla risposta

Il feedback resta persistente e sempre disponibile sotto le risposte assistant,
ma la domanda verbosa “Ti è stata utile?” diventa una coppia compatta:

- pulsante **Pollice su** con `aria-label` equivalente;
- pulsante **Pollice giù** con `aria-label` equivalente.

L'icona scelta ha stato selezionato esplicito (`aria-pressed` o controllo
equivalente), non dipende solo dal colore. Il salvataggio mostra un breve stato
di conferma; un errore mantiene la possibilità di riprovare senza fingere esito.
La scelta negativa conserva l'eventuale motivo già previsto dal flusso corrente.
Il feedback non viene nascosto in un menu né reso disponibile solo in hover.

## Gerarchia della conversazione

### Messaggi e azioni

- Assistant e utente usano superfici meno sature; la distinzione conserva
  contrasto, allineamento e semantica senza due campi cromatici concorrenti.
- Timestamp e dati secondari hanno minore enfasi del testo.
- Copy, modifica, elimina e rigenera diventano azioni progressive/discrete;
  su mobile entrano in un menu accessibile o reveal controllato con target touch
  adeguati. Feedback 👍/👎 resta direttamente disponibile.
- Le metriche, quando abilitate, sono un dettaglio secondario della risposta.
- Pending e streaming continuano a usare gli stati italiani già approvati,
  senza percentuali o tempi simulati.

### Composer

Il composer resta ancorato sopra tastiera iOS, safe area e visual viewport.
Posizioni e dimensioni di allegato, voce, invio e stop rimangono stabili. La
scelta esistente resta invariata: **Invio crea una nuova riga** e il pulsante
invia. Un hint non invasivo può esplicitare la scorciatoia alternativa
Cmd/Ctrl+Invio, se implementata in modo IME-safe; non va cambiato il comportamento
di Invio senza un'esplicita decisione di prodotto.

### Header e uso

Su mobile header, stato d'uso e controlli non devono occupare due barre vuote
consecutive. Lo stato di quota appare solo quando è informativo; i controlli
restano nella stessa app bar compatta. Il controllo Export solo-icona possiede
sempre un nome accessibile italiano.

## Accessibilità di drawer e ricerca

Sidebar mobile e dialogo di ricerca sono superfici modali complete:

- all'apertura, il focus entra rispettivamente nel primo controllo utile o
  nell'input di ricerca;
- Tab e Shift+Tab restano dentro la superficie finché è aperta;
- Escape chiude dove già previsto;
- alla chiusura il focus ritorna al trigger che l'ha aperta;
- quando il drawer è chiuso, i suoi controlli non sono tabulabili e non restano
  esposti allo screen reader (`inert`/semantica equivalente);
- sfondo e contenuto non modale sono inerti mentre una superficie modale è aperta;
- ruoli, etichette e stato aperto/chiuso sono coerenti in italiano.

La soluzione deve usare una primitive accessibile già disponibile o una
implementazione centralizzata e verificata; non due trap focus manuali divergenti.

## Compatibilità e vincoli da preservare

- Nessuna reintroduzione di virtualizzazione o `ResizeObserver` in `MessageList`:
  il rendering lineare evita una regressione React già risolta.
- Lo streaming resta throttled come oggi; non si altera la persistenza di chat,
  audio, allegati, edit, elimina, rigenera, export, paginazione o feedback.
- Riduzione del movimento, hover soltanto su fine pointer e transizioni non
  invasive restano rispettati.
- Toast ed errori persistenti mantengono l'allineamento alla colonna chat quando
  la sidebar desktop è aperta.
- Nessuna percentuale di progresso, ETA o successo implicito durante attese,
  salvataggi o tentativi.

## Superfici previste

- schema Prisma e migrazione per `Routine`, `RoutineAttempt` e preferenza
  nullable delle metriche;
- API owner-scoped per routine/tentativi/check-in e API preferenze esistente;
- persistenza e serializzazione privata delle proposte structured;
- `chat/[id]/chat-conversation-client.tsx` per dati, refresh e transizioni;
- `MessageList.tsx` per scheda, lifecycle, feedback 👍/👎, metriche e densità
  delle azioni;
- `ChatInput.tsx`, `ChatHeader.tsx`, `UsageBanner.tsx`, `layout-client.tsx` e
  `SearchDialog.tsx` per composer, app bar e accessibilità;
- profilo/`PreferencesSection` per toggle metriche;
- tipi chat e query private/condivise per rispettare il boundary owner-only.

## Strategia di test e verifica

### Test automatici

- modello/API: proprietà, validazione, idempotenza, archiviazione, `SET NULL`,
  tentativo e check-in;
- auth/privacy: guest bloccato al salvataggio, owner autorizzato, altro utente
  negato, payload esclusi dalle chat condivise/pubbliche;
- preferenze: default USER/admin/superadmin, override persistente, messaggi
  storici senza metriche e nessuna metrica serializzata quando disattiva;
- UI: proposta, salvataggio, stato attivo, tentativo, check-in, retry e refresh;
- feedback: 👍/👎 accessibile, scelta persistita, errore/retry e motivo negativo;
- accessibilità: focus iniziale/trap/return di drawer e ricerca, drawer chiuso
  non tabulabile, label Export;
- regressioni: `ChatInput`, `MessageList`, `chat-conversation-client`, sidebar,
  layout e pagina chat esistenti.

### Verifica manuale

Verificare desktop e mobile reale per una chat in streaming, refresh durante ogni
stato, routine proposta/salvata, tentativo, check-in, errore e retry. Verificare
anche guest → registrazione → ritorno alla chat, preferenze metriche per USER e
ADMIN/SUPER_ADMIN, tastiera mobile/iOS, lettore di schermo/tabulazione del drawer
e dialogo ricerca, link chat condiviso e feedback persistente.

La chiusura richiede test mirati, `bun run lint`, suite pertinente, `git diff
--check` e verifica browser della UI modificata.

## Criteri di accettazione

- Un utente autenticato può salvare esplicitamente una proposta e ritrovarla dopo
  refresh della chat sorgente; il relativo record sopravvive anche a una
  successiva eliminazione di chat o messaggio sorgente.
- Un guest non può creare una routine: riceve un percorso di registrazione e,
  al ritorno, deve ancora confermare il salvataggio.
- Una routine attiva consente tentativo e check-in senza dichiarare successo in
  automatico.
- Routine, tentativi, esiti e metriche non vengono mai serializzati per chat
  condivise/pubbliche o per un altro utente.
- Le metriche sono off di default per USER, on di default per ADMIN e
  SUPER_ADMIN, e l'override del profilo persiste.
- Il feedback è sempre disponibile come 👍/👎, accessibile e persistente.
- Il composer, streaming, scroll, voce, allegati, error recovery e mobile
  viewport mantengono il comportamento affidabile corrente.
- Drawer mobile e ricerca rispettano focus, Escape, focus return e contenuto
  chiuso/non modale non tabulabile.
