# Routine riutilizzabile da nuova chat

## Obiettivo

Rendere le routine oggetti coaching riutilizzabili e indipendenti dalla conversazione che le ha generate. La chat resta il punto in cui Anthon propone e salva una routine; la pagina `/chat/routines` diventa il punto da cui l’utente può ripeterla, modificarla, leggere lo storico, registrare un esito o archiviarla.

## Decisioni di prodotto

- **Ripeti** crea una nuova chat privata e invia automaticamente un prompt che contiene la routine completa. Il prompt chiede ad Anthon di guidare l’utente nella stessa sequenza senza modificarla.
- **Modifica** crea una nuova chat privata e invia automaticamente un prompt che contiene la routine completa. Il prompt chiede ad Anthon di esplorare cosa cambiare e proporre una nuova versione.
- La routine originale non viene modificata da nessuna delle due azioni.
- **Cronologia** è una sezione espandibile nella pagina della raccolta e mostra tentativi, esiti e note già persistiti.
- **Com’è andata?** apre il check-in nella pagina della raccolta e registra l’esito sulla routine originale; non crea una chat aggiuntiva.
- **Archivia** resta un’azione secondaria con conferma; una routine archiviata rimane consultabile nello storico.
- Non vengono aggiunte in questa iterazione eliminazione, condivisione, reminder, streak o punteggi automatici.

## Modello e provenienza

`Routine` resta owner-scoped e continua a contenere `sourceChatId` e `sourceAssistantMessageId` solo come provenienza opzionale. Questi campi non devono più determinare la navigazione o la possibilità di usare la routine: se la chat o il messaggio sorgente vengono cancellati, la routine resta utilizzabile dalla raccolta.

`derivedFromRoutineId` rappresenta la genealogia delle versioni. Quando una nuova proposta generata dal flusso **Modifica** viene salvata nella nuova chat, il salvataggio passa l’ID della routine di origine. La nuova routine è un record autonomo; la routine precedente non viene sovrascritta.

Gli attempt e gli outcome restano collegati al record `Routine`, non alla chat creata per ripeterla o modificarla.

## Flusso di navigazione

1. L’utente apre `/chat/routines` dalla voce compatta nella sidebar.
2. Ogni card mostra titolo, trigger, durata, stato e le azioni disponibili.
3. **Ripeti** o **Modifica** invocano una nuova azione del `ChatContext` che usa la creazione chat esistente con:
   - titolo della nuova conversazione;
   - messaggio iniziale strutturato con titolo, trigger, sequenza, durata e segnale di riuscita;
   - modalità interna `repeat` oppure `adapt` per conservare l’intento del flusso senza esporre ID tecnici nel testo.
4. La nuova chat riceve il messaggio iniziale attraverso il meccanismo di pending initial message già usato dalla landing e lo invia una sola volta quando è pronta.
5. Il flusso **Modifica** conserva l’ID della routine sorgente in stato di navigazione/client context fino al salvataggio della nuova proposta, così `derivedFromRoutineId` viene scritto senza legare la nuova chat alla routine.
6. Al ritorno in `/chat/routines`, la raccolta viene aggiornata dal server e mostra sia la routine originale sia eventuali versioni derivate.

## Stati e autorizzazioni

- Guest: può vedere la CTA di registrazione, ma non può creare, modificare, ripetere o registrare esiti persistenti.
- Utente autenticato: può usare le routine di propria proprietà; tutte le mutazioni restano owner-scoped lato API.
- Una routine archiviata non può ricevere nuovi tentativi. Può essere consultata nello storico e usata come base per **Modifica**, che crea una nuova routine attiva solo dopo una nuova proposta accettata.
- Errori di creazione chat mantengono la routine invariata e mostrano un’azione di retry. Errori di check-in o archiviazione restano localizzati nella card e non rimuovono dati già persistiti.

## Interfaccia

- La sidebar mantiene solo il link compatto “Routine”.
- La pagina usa card complete su desktop e righe compatte su mobile.
- **Ripeti** è l’azione primaria per routine attive; **Modifica** è secondaria.
- **Cronologia**, **Com’è andata?** e **Archivia** sono progressive disclosure o azioni secondarie per non competere con il percorso principale.
- Tutti i controlli interattivi hanno almeno 44px di area touch e copy italiana.
- La pagina mantiene stati loading, errore, vuoto, paginazione e CTA guest già definiti.

## Componenti e contratti

- `RoutineCollectionPage` riceve dal `ChatContext` la raccolta, gli stati di caricamento, il retry/pagination e la nuova azione `createRoutineChat`; lo stato di apertura del check-in resta locale alla card/pagina e usa callback owner-safe per le mutation.
- Un helper puro costruisce il prompt iniziale dalla proposta normalizzata, con varianti repeat/adapt e senza identificatori tecnici.
- `RoutineHistory` viene riusato nella card e mantiene fetch/paginazione degli attempt già esistenti.
- `RoutineCheckInForm` viene riusato nella card/collection page con callback owner-safe per creare attempt e salvare outcome.
- `LayoutClient` resta il proprietario della creazione chat, della chiusura drawer mobile e dell’aggiornamento della raccolta.
- `ChatConversationClient` conserva l’intento adapt fino al salvataggio della nuova proposta e passa `derivedFromRoutineId` alla mutation esistente.
- Le API routine non devono richiedere la chat sorgente originale per leggere, usare, archiviare o creare una versione derivata. Il salvataggio di una nuova proposta continua a validare il messaggio assistant della nuova chat; la verifica di ownership resta obbligatoria.

## Test e verifica

Test unitari e comportamento:

- la card espone Ripeti, Modifica, Cronologia, check-in e Archivia secondo stato;
- Ripeti/Modifica chiamano la creazione chat con titolo e prompt distinti, senza navigare alla chat sorgente;
- il prompt contiene tutti i campi della routine, non contiene ID tecnici e mantiene la modalità;
- la nuova proposta salvata dopo Modifica invia `derivedFromRoutineId` e lascia invariata la routine originale;
- le routine senza sorgente continuano a funzionare;
- guest e routine archiviate rispettano i gate di azione;
- retry e refresh non perdono raccolta, storico o stato del check-in.

Gate finali:

- `bunx vitest run` sui test routine/chat interessati;
- `bun run lint`;
- `bun run typecheck`;
- `bun run build`;
- verifica preview desktop/mobile della raccolta, creazione nuova chat, ripeti, modifica, check-in, archiviazione e ritorno alla raccolta.

## Fuori scope

- Cambiare il modello conversazionale generale o il composer.
- Rendere la routine un messaggio duplicato nella chat sorgente.
- Aggiungere una nuova tabella di versioni separata: la genealogia minima usa `derivedFromRoutineId` e record `Routine` autonomi.
- Supportare routine guest persistenti o migrazione guest oltre i contratti già esistenti.
