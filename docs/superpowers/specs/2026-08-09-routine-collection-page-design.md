# Pagina dedicata alla raccolta routine

## Obiettivo

Spostare la raccolta delle routine fuori dalla sidebar espansa. La sidebar deve offrire soltanto un ingresso persistente e riconoscibile alla sezione Routine; la gestione della raccolta vive nella pagina `/chat/routines`.

## Esperienza utente

- La sidebar autenticata mostra una voce compatta **Routine**, con conteggio delle routine attive. Non renderizza titoli, filtri o paginazione.
- Il click/tap porta a `/chat/routines` e chiude il drawer mobile quando necessario.
- La pagina ha un’intestazione con titolo, descrizione breve e ritorno alla chat.
- I filtri **Attive** e **Archiviate** sono visibili nella pagina, con conteggi quando disponibili.
- Su desktop le routine sono card complete: titolo, trigger, durata, stato, ultimo esito e azioni contestuali.
- Su mobile le routine sono righe/card compatte; il dettaglio e le azioni restano raggiungibili con un tap senza ridurre i target sotto 44px.
- **Carica altre routine** usa la paginazione già esistente per lo stato selezionato.
- Stati loading, errore con retry e raccolta vuota hanno copy italiano e non spostano il composer della chat.
- L’apertura di una routine mantiene il comportamento esistente: chat sorgente quando presente, altrimenti landing/check-in; nessuna routine viene resa pubblica o visibile a guest/utenti non autorizzati.

## Architettura e dati

- Aggiungere la route App Router statica `src/app/(chat)/chat/routines/page.tsx`.
- La pagina usa `useChatContext()` e la `routineCollection` già caricata da `LayoutClient`; non introduce una seconda sorgente di verità né una nuova API.
- Estrarre o creare un componente presentazionale dedicato alla pagina, separato da `RoutineSidebarShelf`.
- `RoutineSidebarShelf` mantiene solo link, conteggio, stato di caricamento/errore e retry essenziale.
- Le azioni che richiedono la chat (check-in, routine sorgente, adattamento) riusano `navigateToRoutine` e i client/API esistenti.
- Guest: nessun accesso alla raccolta privata; la sidebar e la route mostrano un invito alla registrazione coerente con il resto della chat.

## Accessibilità e responsive

- La voce sidebar e il titolo pagina hanno nomi accessibili in italiano e indicano lo stato attivo quando applicabile.
- Filtri con semantica di tab/button coerente e stato `aria-pressed`/`aria-selected` deterministico.
- Tutti i controlli touch hanno almeno 44×44px; focus visibile e ritorno del focus dopo la chiusura del drawer.
- Rispetta `prefers-reduced-motion`; nessuna animazione ampia o layout shift durante il caricamento.

## Verifica

- Test di rendering della sidebar: solo ingresso Routine, nessun titolo o filtro inline.
- Test pagina: elenco, filtri, conteggi, vuoto, errore/retry e paginazione per stato.
- Test responsive/accessibilità: link mobile, target touch, focus e navigazione alla chat sorgente/check-in.
- Suite esistente di chat, routine e typecheck/build devono restare verdi.
