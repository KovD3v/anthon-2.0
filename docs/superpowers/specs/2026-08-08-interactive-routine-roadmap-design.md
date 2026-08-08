# Routine interattive e raccolta sticky

## Contesto

Il primo rilascio del coaching loop ha introdotto una routine come oggetto di
prodotto persistente, distinto da chat e memoria:

```text
proposta → routine salvata → tentativo → check-in → adattamento
```

Oggi l'utente può salvare una proposta, segnare un tentativo, registrarne
l'esito e archiviare la routine. Rimangono due limiti:

1. la routine è ancora una scheda da leggere, non una pratica guidata;
2. le routine salvate sono recuperabili attraverso il rientro e la chat
   sorgente, ma non formano una raccolta facilmente consultabile.

Questa roadmap sviluppa insieme esecuzione e raccolta attraverso slice
verticali. Ogni fase deve consegnare un comportamento utilizzabile, senza
costruire in anticipo un framework generico di widget o una dashboard.

## Obiettivi

- Rendere le routine eseguibili inline nella scheda che già vive nella chat.
- Supportare istruzioni, timer, respirazione guidata e form strutturati.
- Rendere le routine disponibili e archiviate ritrovabili in una sezione
  sticky della sidebar.
- Conservare il principio di persistenza esplicita: un tentativo esiste solo
  quando l'utente conferma di aver completato la routine.
- Permettere più routine disponibili contemporaneamente, ordinate per ultimo
  utilizzo.
- Chiudere il loop con uno storico leggibile e un adattamento assistito, senza
  punteggi AI o inferenze sul successo.
- Misurare esecuzione, check-in e riutilizzo senza inviare contenuti sensibili
  alle analytics.

## Fuori ambito

- Una pagina dashboard separata per le routine.
- Una sola routine primaria, pin manuali, cartelle, tag o ricerca nella v1.
- Salvataggio automatico di avvii, completamenti, esiti o risposte ai form.
- Una tabella persistente per sessioni di esecuzione interrotte.
- Sincronizzazione in tempo reale di un timer tra dispositivi.
- Streak, badge, classifiche, reminder, notifiche o punteggi di progresso AI.
- Widget arbitrari generati come codice dal modello.
- Routine persistenti per guest o esposizione nelle chat pubbliche.

## Principi

### Il modello descrive, il prodotto esegue

Il modello può scegliere un tipo di passo e compilarne i dati entro uno schema
chiuso. Non genera componenti, markup o comportamento. Il client valida i dati
e decide quale widget rendere.

### Nessun risultato implicito

La fine di un timer o di un ciclo respiratorio non equivale al completamento
della routine. Solo **Ho completato la routine** crea un tentativo. Solo la
conferma del check-in registra un esito.

### Contesto prima della dashboard

L'esecuzione rimane inline nella scheda. La raccolta vive nella sidebar come
strumento di accesso, non come nuova home o area statistiche.

### Compatibilità prima della migrazione dei contenuti

Le routine già salvate devono restare leggibili ed eseguibili come sequenze di
istruzioni. La roadmap non riscrive automaticamente contenuti storici.

## Modello di dominio

### Routine versionata

`Routine` aggiunge un `formatVersion` intero:

- `1`: formato esistente, `steps` è un array di stringhe;
- `2`: `steps` è un array di passi tipizzati.

La lettura normalizza entrambi i formati in un contratto client comune. Una
stringa v1 diventa un passo `instruction`. Le nuove proposte create dopo il
rilascio del formato v2 usano esclusivamente il nuovo schema.

`formatVersion` evita di indovinare il formato osservando il JSON e permette
future evoluzioni additive.

### Tipi di passo v2

Il contratto è una discriminated union. Ogni passo ha un identificatore stabile
all'interno dello snapshot della routine e un `kind`.

#### `instruction`

- testo breve e attuabile;
- conferma manuale **Fatto**;
- nessuna persistenza autonoma.

#### `timer`

- etichetta;
- istruzione;
- durata intera in secondi entro limiti server-side;
- controlli avvio, pausa e reset.

#### `breathing`

- etichetta e istruzione;
- secondi di inspirazione ed espirazione;
- pause opzionali dopo inspirazione ed espirazione;
- numero limitato di cicli;
- durata totale derivata e validata.

#### `form`

- domanda;
- modalità `scale` o `choice` per l'esito, con nota testuale opzionale;
- `scale` usa esattamente tre punti con ancore semantiche mappate a
  `HELPFUL`, `PARTIALLY_HELPFUL` e `NOT_HELPFUL`;
- `choice` usa esattamente tre opzioni, ciascuna mappata una volta a uno dei
  tre outcome canonici;
- `text` non è un esito autonomo: è sempre la nota opzionale associata a una
  scelta canonica;
- descrittore terminale riservato al check-in, non eseguito come passo della
  pratica e non incluso in `Passo N di M`;
- viene mostrato soltanto dopo che la conferma esplicita del completamento ha
  creato il tentativo;
- risposta conservata localmente fino alla conferma dell'esito;
- nessun questionario generico nel mezzo della routine.

### Routine e tentativo

`Routine` continua a descrivere la pratica confermata: titolo, trigger, durata,
passi e segnale di completamento.

`RoutineAttempt` continua a rappresentare ciò che l'utente dichiara di aver
fatto. Non viene creato all'apertura del runner. La creazione resta idempotente
rispetto al `clientActionId` dell'azione conclusiva.

La risposta conclusiva del form usa direttamente il contratto esistente di
outcome e nota, senza mapping euristici. Se in futuro serviranno scale più
ampie o risposte multiple strutturate, saranno oggetto di una nuova decisione
di dominio; non vengono nascoste oggi dentro un JSON non interrogabile.

### Più routine disponibili

Possono esistere più routine `ACTIVE` per utente. `ACTIVE` significa disponibile
alla pratica, non primaria. L'ordinamento della raccolta usa in ordine:

1. ultimo tentativo, se presente;
2. ultimo aggiornamento della routine;
3. identificatore come tie-breaker stabile.

Non vengono introdotti pin o una routine primaria. Il rientro generico può
continuare a scegliere la routine disponibile più recente con lo stesso
ordinamento autorevole.

## Esecuzione inline

### Avvio

**Avvia routine** espande la `RoutineCard` nella stessa superficie. Non apre una
modale, un pannello o una nuova pagina. La scheda passa da riepilogo a runner e
mostra:

- titolo;
- `Passo N di M`;
- istruzione corrente;
- widget specifico;
- controlli contestuali;
- uscita sempre disponibile.

L'avvio non crea un record e non comunica che la routine è stata tentata.

### Navigazione della sequenza

- Un passo `instruction` prosegue soltanto con **Fatto**.
- Un `timer` allo zero segnala il termine ma non avanza automaticamente.
- `breathing` avanza automaticamente tra le fasi dello stesso ciclo; il
  passaggio allo step successivo resta manuale.
- Un eventuale `form` terminale non appare durante la sequenza: configura il
  check-in mostrato dopo il completamento esplicito.
- Non vengono mostrate percentuali o stime di progresso non verificabili.

### Pausa, chiusura e ripresa locale

- Mettere in pausa congela il conteggio visibile.
- Comprimere la scheda mette in pausa e conserva lo stato finché la pagina
  rimane montata.
- Cambiare chat, ricaricare o chiudere la pagina interrompe l'esecuzione e non
  crea dati persistenti.
- Un successivo rilascio potrà valutare il resume persistente soltanto sulla
  base di evidenze d'uso.

Il timer deriva il tempo residuo da timestamp monotoni e tempo trascorso, non
dal conteggio degli intervalli. Al ritorno da una tab in background ricalcola
lo stato senza accumulare drift.

### Completamento e check-in

Al termine della sequenza compare **Ho completato la routine**. La conferma:

1. crea idempotentemente un `RoutineAttempt`;
2. aggiorna la raccolta e l'ordinamento per ultimo utilizzo;
3. apre inline il check-in;
4. salva outcome e nota soltanto dopo la seconda conferma.

Se la creazione del tentativo fallisce, il runner resta sul riepilogo finale e
permette il retry con lo stesso `clientActionId`. Se il salvataggio dell'esito
fallisce, i valori compilati restano visibili e modificabili.

### Accessibilità e motion

- Tutti i controlli touch hanno area minima 44 × 44 px.
- Stato, fase respiratoria e tempo sono comunicati con testo; colore e
  animazione sono ridondanti.
- `prefers-reduced-motion` sostituisce l'espansione/contrazione continua con
  cambi di stato sobri.
- Gli aggiornamenti temporali non vengono annunciati ogni secondo agli screen
  reader; vengono annunciati avvio, pausa, cambio fase e termine.
- Focus e tastiera seguono l'ordine visivo e tornano al comando di avvio alla
  chiusura.
- La Wake Lock API è un progressive enhancement revocato in pausa, chiusura e
  background; il runner funziona senza.

## Raccolta sticky nella sidebar

### Struttura

La sidebar usa quattro regioni verticali:

1. intestazione e comandi;
2. conversazioni, area flessibile e scorrevole;
3. raccolta routine sticky;
4. profilo sticky.

La raccolta non viene inserita nella landing e non introduce una pagina
dashboard. Deve apparire curata come parte del layout, non come un riquadro
aggiunto: separazione, densità, tipografia e accento seguono il sistema visivo
della chat.

### Stato compatto

La sezione mostra sempre:

- etichetta **Routine**;
- conteggio delle routine disponibili;
- routine usata più recentemente, se esiste;
- durata e stato;
- comando di espansione.

Lo stato vuoto usa una riga discreta e non compete con **Nuova chat**.

### Stato espanso

- Si sviluppa verso l'alto senza spostare il profilo.
- La regione conversazioni si riduce mantenendo un'altezza minima utile.
- Le routine disponibili sono ordinate per ultimo utilizzo.
- **Archiviate** è un filtro secondario, chiuso per default.
- Liste lunghe hanno paginazione/infinite loading controllato e uno scroll
  interno chiaramente delimitato.
- Non sono presenti ricerca, cartelle, tag o statistiche aggregate.

### Selezione

- Se esistono chat e messaggio sorgente, la selezione apre la conversazione e
  porta alla scheda corrispondente.
- Se la sorgente è stata eliminata, apre la scheda autorevole sulla landing
  `/chat` senza ricostruire un messaggio fittizio.
- Su mobile la selezione chiude il drawer prima del focus sulla scheda.
- Il runner viene avviato soltanto da **Avvia routine**, non dalla selezione
  della riga.

### Sincronizzazione

Salvataggio, tentativo, outcome e archiviazione aggiornano la raccolta soltanto
dopo una risposta server autorevole. Le richieste concorrenti usano una
sequenza/versione client per impedire che una risposta vecchia sovrascriva lo
stato recente.

## Contratti server

### Proposta

`proposeRoutine` accetta il formato v2 e rimane obbligatorio per richieste di
routine deterministiche. Il server valida limiti e discriminanti prima di
persistere il messaggio. Un output v2 malformato non viene trasformato in una
card interattiva; non si interpreta il testo libero per inventare timer o fasi.

I modelli configurati per guest e piani registrati devono superare un smoke
contract sul tool prima di essere considerati compatibili con il loop.

### Lettura raccolta

L'API owner-scoped supporta:

- routine `ACTIVE` o `ARCHIVED`;
- cursore stabile;
- limite massimo server-side;
- riepilogo dell'ultimo tentativo;
- conteggio disponibile per lo stato compatto;
- ordinamento autorevole per ultimo utilizzo.

Il payload non include chat o messaggi completi. I riferimenti sorgente sono
opzionali e servono soltanto alla navigazione privata.

### Mutazioni

Le route esistenti per creazione, tentativo, outcome e archiviazione rimangono
owner-scoped e idempotenti. La roadmap aggiunge solo i campi necessari al
formato v2 e non accetta `userId` dal client come autorizzazione.

Guest, chat pubbliche e non-owner non ricevono raccolta, tentativi o contenuti
delle routine.

## Analytics privacy-safe

Gli eventi non contengono titolo, trigger, passi, note o risposte ai form.
Possono contenere identificatori interni, versione del formato, tipo di widget,
durata numerica limitata e stato tecnico.

Funnel principale:

```text
routine_proposed
→ routine_saved
→ routine_started
→ routine_completed
→ routine_check_in_completed
→ routine_restarted_within_14d
```

Metriche di prodotto:

- proposta → salvataggio;
- salvataggio → primo avvio;
- avvio → completamento esplicito;
- completamento → check-in;
- seconda esecuzione entro 7 e 14 giorni;
- distribuzione aggregata degli outcome.

`routine_started` è telemetria di interazione, non un record di tentativo. Il
prodotto non mostra streak o punteggi derivati da questi eventi.

## Roadmap a slice verticali

### Fase 1 — Fondazione tipizzata e timer

- Migrazione `formatVersion` e adattatore v1 → v2.
- Schema `instruction` e `timer` nel tool e nei payload.
- Runner inline con pausa, reset e avanzamento manuale.
- Completamento esplicito, tentativo idempotente e check-in esistente.
- Contract test sui modelli realmente configurati.

**Criterio di uscita:** una nuova routine con istruzioni e timer può essere
proposta, salvata, eseguita, completata e valutata; una routine v1 continua a
funzionare come sequenza di istruzioni.

### Fase 2 — Raccolta sticky

- Endpoint paginato e conteggio leggero.
- Sezione compatta/espansa nella sidebar desktop e mobile.
- Disponibili/archiviate, stati vuoti, retry e lista lunga.
- Navigazione a sorgente presente o eliminata.
- Aggiornamento autorevole dopo ogni mutazione.

**Criterio di uscita:** una routine salvata è immediatamente visibile, resta
ritrovabile dopo refresh e può essere riaperta senza cercare manualmente la
chat.

### Fase 3 — Respirazione e form

- Schema e runner `breathing`.
- Motion accessibile e ricalcolo dopo background.
- Schema `form` limitato al check-in post-completamento.
- Collegamento esplicito al check-in e recovery dei valori compilati.

**Criterio di uscita:** timer, respirazione e check-in funzionano su desktop e
mobile, con reduced motion e senza completamenti impliciti.

### Fase 4 — Storico e adattamento

- Cronologia paginata dei tentativi per routine.
- Ultimo esito e frequenza d'uso nella raccolta.
- **Adatta la routine** con contesto strutturato.
- Nuova proposta collegata all'originale senza sovrascrittura automatica.
- Archiviazione e confronto leggibile delle versioni.

**Criterio di uscita:** l'utente può capire cosa ha provato, come è andata e
creare consapevolmente una versione adattata.

### Fase 5 — Hardening e beta

- Matrice desktop/mobile, tastiera, screen reader e reduced motion.
- Race, retry, idempotenza, refresh e navigazione persistente del layout.
- Migrazioni e route verificate su Neon effimero.
- Smoke reali sui modelli configurati.
- Analytics privacy-safe e funnel 7/14 giorni.

**Criterio di uscita:** il percorso completo è affidabile nei browser target e
può essere validato con una beta di utenti registrati senza osservabilità
sensibile o interventi manuali sul database.

## Strategia di test

### Unit

- parsing e normalizzazione v1/v2;
- limiti di ogni tipo di passo;
- matematica timer e respirazione;
- state machine del runner;
- reduced motion e annunci accessibili;
- ordinamento e cursori della raccolta.

### Component e behavior

- avvio, pausa, reset, compressione e chiusura;
- background/foreground senza drift;
- completamento esplicito e retry con stesso action ID;
- form che conserva valori dopo errore;
- sidebar compatta/espansa e scroll indipendenti;
- mobile drawer, focus return e navigazione alla scheda;
- sorgente eliminata e routine archiviata.

### Integration

- migrazione e compatibilità con record v1 reali;
- ownership, guest, pubblico e non-owner;
- paginazione stabile con tentativi concorrenti;
- idempotenza di tentativo/outcome;
- aggiornamenti autorevoli dopo archiviazione e cancellazione sorgente.

### Runtime

- Next.js compilation e session errors;
- desktop e mobile reali;
- timer con tab in background;
- smoke del tool sui modelli di ogni tier;
- proposta → salvataggio → esecuzione → check-in → riuso.

## Criterio di completezza della feature

La feature è completa quando un utente registrato può:

1. ricevere una proposta strutturata valida;
2. salvarla esplicitamente;
3. ritrovarla nella sidebar dopo refresh;
4. eseguire inline istruzioni, timer e respirazione;
5. confermare il completamento senza falsi positivi;
6. registrare un esito e una nota;
7. consultare lo storico;
8. riutilizzare o adattare la routine;
9. archiviare senza perdere lo storico.

Il valore di prodotto viene validato sulla seconda esecuzione e sul check-in
entro 7–14 giorni, non sul numero di card generate.
