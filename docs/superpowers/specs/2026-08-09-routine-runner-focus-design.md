# Routine runner inline: focus mode

## Contesto

La routine vive già nella chat come una `RoutineCard` persistente. Il pulsante
`Avvia routine` apre un `RoutineRunner` inline che supporta passi istruzionali,
timer e respirazione; al completamento crea un tentativo e apre il check-in.

La base funzionale è affidabile, ma la gerarchia durante l'esecuzione è ancora
quella di una scheda descrittiva: il passo attivo, il progresso e l'azione
successiva non hanno abbastanza priorità visiva. Questa rifinitura rende il
runner una guida focalizzata senza trasformarlo in una modale o in una nuova
pagina.

## Obiettivi

- Rendere evidente una sola fase attiva alla volta.
- Mostrare sempre il progresso verificabile (`Passo N di M`).
- Dare una sola azione primaria coerente con lo stato corrente.
- Rendere timer e respirazione leggibili a colpo d'occhio su desktop e mobile.
- Conservare il comportamento temporale già corretto dopo background e pausa.
- Mantenere il completamento esplicito e il check-in nella stessa card.
- Evitare qualsiasi turno AI o scrittura persistente durante l'esecuzione.

## Decisioni approvate

### Superficie

Il runner resta inline nella `RoutineCard`. L'avvio non apre modali, pannelli,
nuove chat o nuove pagine. La card passa dalla vista riepilogo alla vista
runner e conserva il contesto della routine.

### Gerarchia comune

Ogni stato del runner mostra:

1. titolo della routine e indicazione `Passo N di M`;
2. barra di avanzamento discreta, basata sul numero reale di passi;
3. istruzione o fase corrente;
4. widget specifico del passo;
5. una sola azione primaria;
6. pausa/ripristino/chiusura come azioni secondarie.

Il check-in non viene incorporato nel runner. Dopo la conferma esplicita di
completamento viene aperto subito sotto, nella stessa card.

### Passi

#### `instruction`

- Mostra il testo corrente in poche righe.
- Avanza solo con `Fatto`.

#### `timer`

- Countdown grande con numeri monospaziati.
- Barra di progresso proporzionale alla durata verificata.
- `Avvia` e `Pausa` alternano lo stato senza perdere il tempo trascorso.
- A `00:00` mostra `Tempo terminato` e richiede `Continua`; non avanza da
  solo.

#### `breathing`

- Mostra `Inspira`, `Pausa` o `Espira`, il tempo residuo della fase e il ciclo
  corrente.
- L'indicatore circolare accompagna il ritmo ma non è l'unica informazione.
- Le fasi dello stesso ciclo avanzano automaticamente; lo step successivo
  resta manuale con `Continua`.
- Il conteggio deriva dai timestamp e si ricalcola al ritorno da background.
- Con `prefers-reduced-motion` l'indicatore non pulsa o scala continuamente;
  restano testo e cambi di stato.

### Chiusura e dati

- La chiusura durante un passo attivo richiede una conferma discreta:
  `Interrompere la routine?`.
- Confermando la chiusura non viene registrato alcun tentativo e il progresso
  locale viene scartato.
- Una riapertura riparte dall'inizio.
- Il completamento richiede `Ho completato la routine` e crea il tentativo una
  sola volta con l'idempotenza già esistente.
- Se la creazione del tentativo fallisce, il runner resta nello stato finale e
  offre retry senza duplicare il tentativo.
- Nessuna chiamata AI, nuova risposta o persistenza parziale viene introdotta.

### Accessibilità e responsive

- Tutti i controlli hanno almeno 44 × 44 px.
- Il focus entra nel runner all'apertura e torna al comando di avvio alla
  chiusura.
- Le fasi, l'avvio, la pausa e il completamento sono comunicati con testo e
  `aria-live` mirato; il tempo non viene annunciato ogni secondo.
- L'ordine di tabulazione segue quello visivo.
- La wake lock resta un miglioramento progressivo e viene revocata in pausa,
  chiusura o background.
- Su mobile i controlli possono andare a capo senza ridurre l'area tattile.

## Perimetro tecnico

- `RoutineRunner.tsx`: layout focus, barra di progresso, stato attivo e
  controlli contestuali.
- `routine-runner.ts`: solo helper derivati necessari per progresso e stato;
  i calcoli timestamp esistenti restano la fonte del tempo.
- `RoutineCard.tsx`: conferma di uscita, apertura/chiusura e transizione verso
  il check-in.
- `RoutineCheckInForm.tsx`: nessun cambio di contratto; resta il passaggio
  successivo al completamento.
- Nessuna migrazione Prisma, nuova API o modifica al contratto della routine.

## Verifica e criteri di accettazione

I test devono dimostrare:

- indicazione e barra `Passo N di M` coerenti con la sequenza;
- istruzione, timer e respirazione con un solo controllo primario;
- pausa, ripristino, termine esplicito e ricalcolo dopo background;
- chiusura annullabile e chiusura confermata senza chiamare la mutation;
- focus iniziale, focus di ritorno, tastiera e controlli da 44px;
- comportamento `prefers-reduced-motion` senza dipendere dall'animazione;
- creazione del tentativo una sola volta e apertura del check-in dopo il
  completamento;
- regressione desktop/mobile della card inline e nessun turno AI aggiuntivo.

Sono fuori ambito resume persistente, sessioni di esecuzione tra dispositivi,
statistiche, streak, notifiche e widget generati dinamicamente dal modello.
