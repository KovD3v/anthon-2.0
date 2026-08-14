# Onboarding conversazionale obbligatorio per i nuovi account

## Stato

Design approvato in conversazione il 14 agosto 2026. Questa specifica definisce il primo onboarding per i nuovi account registrati; non implementa ancora il comportamento.

## Obiettivo

Creare un ambiente iniziale di lavoro per Anthon senza lasciare all’utente il compito di capire da solo da dove partire. L’onboarding deve raccogliere un profilo di base attraverso una chat guidata, usare il modello per interpretare le risposte e arrivare alla chat normale con un contesto già utilizzabile.

Il risultato dell’onboarding è un profilo iniziale, non una routine o una diagnosi.

## Decisioni di prodotto

- L’onboarding riguarda i nuovi account registrati. Gli account esistenti non vengono coinvolti retroattivamente.
- È obbligatorio: un account non può usare la chat o altre aree del prodotto finché non lo completa.
- È eseguibile una sola volta. Dopo il completamento, la route di onboarding reindirizza alla chat.
- Il completamento avviene solo dopo il riepilogo finale e l’azione esplicita **Conferma e inizia**.
- Le domande arrivano in un ordine fisso; il modello non sceglie il prossimo campo.
- Ogni campo può essere valorizzato, lasciato vuoto o saltato esplicitamente con risposte come “nessuno”, “non lo so” o “preferisco non dirlo”.
- Una risposta può contenere informazioni appartenenti anche a domande successive. Queste informazioni vengono riconosciute e salvate nella bozza, mentre l’ordine visibile resta quello definito.
- L’utente può modificare i dati durante il percorso e dal riepilogo finale senza ricominciare da capo.
- Il modello usato dall’onboarding è `deepseek/deepseek-v4-flash-0731`. Per ora il modello è configurato esplicitamente nell’onboarding; la costruzione di una sorgente canonica condivisa con altri usi del modello è fuori scope.
- Gli eventuali sintomi sono esclusi dal profilo iniziale.

## Percorso guidato

La route dedicata è `/onboarding`. Il percorso comprende cinque posizioni:

1. **Nome** — “Come vuoi che ti chiami?”
2. **Età** — “Quanti anni hai?” L’età viene raccolta come numero, non come data di nascita.
3. **Lavoro o ambito di studio** — “Di cosa ti occupi? Lavoro o ambito di studio?”
4. **Sport o scuola** — “Se pratichi uno sport, quale pratichi e a che livello? Se studi, in che classe o anno sei?” La posizione può raccogliere sia sport e livello sia grado/anno scolastico.
5. **Obiettivo** — “Su cosa vuoi lavorare o quale obiettivo vuoi raggiungere?”

Le domande possono essere formulate con il tono di Anthon, ma il significato e l’ordine restano stabili. Per età si accetta un numero intero da 1 a 120; valori non interpretabili o fuori limite generano una richiesta di chiarimento invece di avanzare.

## Comportamento del modello

Il server mantiene lo stato del percorso e il campo atteso. Per ogni risposta invia al modello la domanda corrente, il testo dell’utente, i dati già raccolti e lo schema dei campi ancora disponibili.

Il modello restituisce un output strutturato contenente:

- valori riconosciuti per uno o più campi;
- indicazione del campo corrente come accettato, saltato o da chiarire;
- eventuale domanda di chiarimento;
- il messaggio naturale da mostrare nella conversazione.

Il server valida l’output, normalizza i valori e decide se avanzare. Il modello non può saltare un campo non risolto, dichiarare completato l’onboarding o modificare il percorso. Se la chiamata fallisce, la bozza rimane invariata e viene mostrata una possibilità di riprovare; se necessario si usa la domanda predefinita.

Il testo e il tono devono rispecchiare il comportamento di Anthon e il profilo light esistente, ma il modello di onboarding usa sempre l’ID esplicito stabilito sopra.

## Dati e persistenza

L’onboarding usa una bozza separata dal profilo definitivo. Una nuova `OnboardingSession`, account-scoped e versionata, mantiene almeno lo stato (`IN_PROGRESS` o `REVIEW`), la posizione corrente, i valori estratti, i salti espliciti e il transcript necessario a ricostruire la chat dopo un reload. La sessione è unica per account e versione.

Al momento della conferma, i valori vengono promossi nel profilo di coaching:

| Risultato onboarding | Profilo persistente |
| --- | --- |
| Nome | `Profile.name` |
| Età numerica | nuovo `Profile.age` |
| Lavoro/ambito di studio | nuovo `Profile.occupation` |
| Sport | `Profile.sport` |
| Livello sportivo o grado/anno scolastico | `Profile.experience` |
| Obiettivo | `Profile.goal` |

`Profile.birthday` resta separato e non viene popolato dall’età raccolta. Il profilo esistente e i tool AI continuano a usare i campi già presenti senza duplicare `sport`, `experience` o `goal`.

Lo stato account deve distinguere chiaramente nuovi account non completati, onboarding in corso e onboarding completato. Un campo account `onboardingCompletedAt` viene valorizzato alla conferma; la migrazione iniziale lo valorizza con `createdAt` per gli account esistenti, mentre i nuovi account partono con valore nullo. La conversione di un guest deve mantenere la continuazione sicura già esistente e applicare il gate prima dell’accesso al prodotto registrato.

## Lifecycle e failure paths

- Un nuovo account viene mandato a `/onboarding` dopo la registrazione.
- Ogni route protetta del prodotto e ogni creazione/accesso alla chat verifica lo stato di onboarding; se non completato, reindirizza o risponde con un errore di onboarding richiesto.
- Reload, chiusura del browser o disconnessione riprendono dalla posizione salvata.
- Un errore di rete o del modello non avanza la posizione e non perde l’ultima risposta accettata.
- La quinta risposta porta al riepilogo, non al completamento automatico.
- Il riepilogo consente di modificare i campi e torna al primo campo ancora da completare.
- **Conferma e inizia** è l’unica transizione a completato; dopo di essa `/onboarding` non è più accessibile come percorso operativo.
- Il gate non deve impedire logout, gestione sessione o recupero dell’account.

## UI

La superficie è una chat guidata dedicata, senza sidebar o navigazione verso le aree operative del prodotto.

- intestazione breve con Anthon e una frase di orientamento;
- indicatore compatto `1 di 5`, `2 di 5`, ecc.;
- bolle di Anthon a sinistra e dell’utente a destra;
- composer fisso in basso;
- azione secondaria contestuale per saltare il campo, così l’utente non deve inventare una formula per non rispondere;
- pannello **Profilo in costruzione**, laterale su desktop e richiudibile sotto la conversazione su mobile;
- ogni campo già raccolto ha un’azione **Modifica**;
- al termine il pannello diventa il riepilogo completo con **Conferma e inizia**.

## Motion design

La UI deve essere molto animata, con motion funzionale e fisico:

- ingresso morbido dei messaggi e aggiornamento immediato del messaggio utente;
- stato “Anthon sta leggendo…” durante l’interpretazione;
- trasformazione dei dati riconosciuti in chip animate nel profilo;
- distribuzione sequenziale dei chip quando una risposta contiene più campi;
- aggiornamento fluido dell’indicatore di progresso;
- modifica di un campo con apertura a molla e ritorno alla posizione corretta nel flusso;
- costruzione progressiva del riepilogo finale;
- transizione di completamento dal riepilogo alla chat dopo la conferma.

Le animazioni non devono bloccare l’input o ritardare il feedback. Gli elementi interattivi devono restare interrompibili e partire dal valore visivo corrente. Con `prefers-reduced-motion`, le molle e gli spostamenti diventano dissolvenze brevi e cambi di stato statici, mantenendo comunque feedback e orientamento.

## Verifica prevista

La fase di implementazione dovrà coprire almeno:

- nuovo account reindirizzato e account esistente esente;
- blocco di chat e route protette durante l’onboarding;
- ripresa corretta dopo reload o nuova sessione;
- cinque domande nell’ordine stabilito;
- risposte vuote o esplicite di salto;
- estrazione di più campi da una sola risposta;
- chiarimento su età non valida o risposta ambigua;
- errore del modello senza avanzamento dello stato;
- modifica dal riepilogo senza reset del percorso;
- completamento solo dopo **Conferma e inizia**;
- impossibilità di ripetere l’onboarding dopo il completamento;
- comportamento responsive e fallback reduced-motion.

Gli eventi di prodotto potranno misurare avvio, avanzamento per campo, salto, errore, ripresa e completamento, mantenendo separato il contenuto sensibile dalle proprietà analitiche.

## Fuori scope

- onboarding per guest prima della registrazione;
- routine, check-in o piano di coaching durante l’onboarding;
- raccolta di sintomi o dati sanitari;
- refactor della sorgente canonica dei modelli;
- modifica del comportamento di titoli e icone delle conversazioni esistenti;
- riapertura manuale dell’onboarding dopo il completamento.
