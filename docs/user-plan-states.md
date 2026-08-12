# Piani e stati utente

Anthon assegna a ogni utente un piano effettivo. Il piano determina quote AI,
contesto conversazionale, upload, conservazione degli allegati e accesso alla
voce.

I piani personali supportati sono Guest, Trial, Basic, Basic Plus e Pro. Nel
codice Basic Plus è identificato come `BASIC_PLUS`.

## Panoramica

| Piano | Utente | Richieste/giorno | Contesto | Upload/giorno | Conservazione | Voce in | Voce out |
| --- | --- | ---: | ---: | --- | ---: | :---: | --- |
| **Guest** | Non registrato | 10 | 5 messaggi | Non disponibili | 1 giorno | — | — |
| **Trial** | Registrato, senza piano riconosciuto | 75 | 10 messaggi | 10 file · 50 MiB | 7 giorni | ✓ | — |
| **Basic** | Abbonato Basic | 50 | 15 messaggi | 25 file · 250 MiB | 30 giorni | ✓ | 10 audio ogni 12 ore |
| **Basic Plus** | Abbonato Basic Plus | 50 | 30 messaggi | 50 file · 500 MiB | 60 giorni | ✓ | 20 audio ogni 12 ore |
| **Pro** | Abbonato Pro | 100 | 100 messaggi | 100 file · 2 GiB | 180 giorni | ✓ | 50 audio ogni 36 ore |

Il contesto rappresenta il numero massimo di messaggi recenti inviati al
modello per generare una risposta. Non limita i messaggi conservati nella
conversazione.

Ogni file può avere una dimensione massima di 10 MiB.

## Quote AI

| Piano | Input/giorno | Output/giorno | Costo senza limite stimato | Limite fissato giornaliero |
| --- | ---: | ---: | ---: | ---: |
| **Guest** | 20.000 | 10.000 | $0,0094 | $0,05 |
| **Trial** | 100.000 | 50.000 | $0,0469 | $0,50 |
| **Basic** | 500.000 | 250.000 | $0,2345 | $3,00 |
| **Basic Plus** | 800.000 | 400.000 | $0,3753 | $5,00 |
| **Pro** | 2.000.000 | 1.000.000 | $0,9382 | $15,00 |

La stima usa la media ponderata OpenRouter rilevata il 7 agosto 2026:
`$0,04103/M` token input e `$0,8561/M` token output. Assume il consumo completo
di entrambe le quote giornaliere:

```text
costo = input × $0,04103/M + output × $0,8561/M
```

Il budget giornaliero è una soglia di sicurezza configurata nel catalogo, non
il prezzo dell'abbonamento. Il sistema contabilizza il costo effettivo delle
generazioni e blocca nuovi turni quando viene raggiunto il primo limite tra
richieste, token e budget.

La stima riguarda solo l'orchestratore. Non include fallback, sub-agent,
immagini, ricerca web, trascrizione, sintesi vocale, storage e infrastruttura.
Inoltre, la media OpenRouter incorpora il caching e può cambiare nel tempo.

Le quote giornaliere si azzerano alle `00:00 UTC`.

## Funzionalità

| Funzionalità | Guest | Trial | Basic | Basic Plus | Pro |
| --- | :---: | :---: | :---: | :---: | :---: |
| Conversazioni associate all'account | — | ✓ | ✓ | ✓ | ✓ |
| Profilo e preferenze persistenti | — | ✓ | ✓ | ✓ | ✓ |
| Memorie persistenti | — | ✓ | ✓ | ✓ | ✓ |
| RAG e conoscenza documentale | — | ✓ | ✓ | ✓ | ✓ |
| Immagini e allegati | — | ✓ | ✓ | ✓ | ✓ |
| Messaggi vocali in ingresso | — | ✓ | ✓ | ✓ | ✓ |
| Risposte vocali in uscita | — | — | ✓ | ✓ | ✓ |

Il piano Guest usa un contesto ridotto e non accede a profilo, memorie o RAG.
Le nuove sessioni Guest sono inoltre limitate, per impostazione predefinita, a
tre creazioni per indirizzo client attendibile al giorno.

## Voce in ingresso e in uscita

La voce in ingresso e la voce in uscita sono due funzionalità indipendenti.

### Voce in ingresso

La voce in ingresso consente all'utente di registrare o inviare un messaggio
audio. Anthon:

1. carica e valida il file audio;
2. trascrive l'audio in testo;
3. usa la trascrizione come messaggio dell'utente;
4. genera la risposta con il normale flusso AI.

È disponibile da Trial in su. Guest non può usarla perché il piano non
consente upload.

Nel canale Web, la registrazione audio:

- consuma una delle quote upload del piano;
- rispetta il limite di 10 MiB per file;
- consuma una normale richiesta AI e le relative quote token/costo;
- non consuma la quota della voce in uscita.

Telegram e WhatsApp applicano lo stesso modello logico: il messaggio audio
viene trascritto e trattato come input testuale. Un errore di download o
trascrizione produce una risposta testuale di fallback e non viene interpretato
come un messaggio vuoto.

### Voce in uscita

La voce in uscita è la sintesi vocale della risposta di Anthon. Il testo della
risposta viene sempre generato e salvato per primo; l'audio viene prodotto
successivamente e associato allo stesso messaggio.

È disponibile solo per Basic, Basic Plus e Pro. Non è disponibile per Guest o
Trial.

La generazione dipende da quattro condizioni:

- il piano deve consentire la voce;
- la preferenza utente `voiceEnabled` non deve essere disattivata;
- la quota del piano non deve essere esaurita;
- il provider vocale deve essere disponibile.

I limiti indicati nella tabella sono quote complessive di audio generati nella
relativa finestra mobile:

| Piano | Finestra | Audio totali | Budget automatico | Riserva per richieste esplicite |
| --- | ---: | ---: | ---: | ---: |
| **Basic** | 12 ore | 10 | 6 | 4 |
| **Basic Plus** | 12 ore | 20 | 13 | 7 |
| **Pro** | 36 ore | 50 | 32 | 18 |

Il 65% della quota è disponibile per le risposte vocali automatiche. La parte
rimanente può essere usata quando l'utente richiede esplicitamente una risposta
vocale. Una richiesta esplicita non supera comunque la quota totale del piano.

Per evitare audio invasivi, le risposte automatiche rispettano anche queste
regole comuni:

- massimo 3 audio automatici in un'ora;
- massimo 2 risposte audio consecutive;
- almeno 1 turno tra segnali forti, con 5 minuti di attesa;
- almeno 3 turni per gli interventi naturali, con 15 minuti di attesa.

Se la voce in uscita non è disponibile, Anthon mantiene la risposta testuale.

## Determinazione del piano

Il piano effettivo viene risolto nel seguente ordine:

1. un utente non autenticato riceve `GUEST`;
2. un utente con ruolo `ADMIN` o `SUPER_ADMIN` riceve `ADMIN`;
3. una sottoscrizione `ACTIVE` o `TRIAL` con un `planId` riconosciuto riceve
   `BASIC`, `BASIC_PLUS` o `PRO`;
4. un utente registrato senza un piano riconosciuto riceve `TRIAL`;
5. per un membro di un'organizzazione, il sistema confronta il piano personale
   con i contratti organizzativi validi e applica la fonte più forte.

### Trial

`TRIAL` può indicare:

- il livello predefinito di un utente registrato senza abbonamento;
- lo stato di prova di una sottoscrizione Clerk.

Se una sottoscrizione in prova contiene un `planId` valido, vengono applicati i
limiti del piano associato. La durata della prova è fornita da Clerk tramite
`trial_period_days` e non è fissata nel catalogo locale.

### Sottoscrizioni non attive

`CANCELED`, `EXPIRED` e `PAST_DUE` sono stati della sottoscrizione, non piani.
Se non esiste un'altra fonte valida di entitlement, l'utente riceve `TRIAL`.

### Amministratori

`ADMIN` non è un piano commerciale. I ruoli `ADMIN` e `SUPER_ADMIN` ricevono:

- richieste, token, costo e upload senza limiti;
- fino a 100 messaggi di contesto;
- conservazione degli allegati per 10 anni;
- accesso alla voce senza limite numerico.

## Routing dei modelli

| Componente | Modello |
| --- | --- |
| Orchestratore testuale | `openai/gpt-5.6-luna` |
| Fallback orchestratore | `deepseek/deepseek-v4-flash-0731` |
| Elaborazione immagini | `moonshotai/kimi-k2.7-code` |
| Manutenzione | `google/gemini-2.5-flash-lite` |

Il sub-agent usa `google/gemini-2.5-flash-lite` per tutti i piani, ad eccezione
di Basic Plus, che usa `google/gemini-2.5-flash`.

## Comportamento delle quote

- Chat, webhook dei canali e upload usano lo stesso piano effettivo.
- Le quote finite sono protette da prenotazioni atomiche per evitare addebiti
  duplicati.
- Un secondo turno simultaneo può ricevere una risposta `409` ritentabile.
- Un errore di generazione libera la prenotazione della quota.
- Le quote organizzative non vengono applicate agli utenti Guest o Admin.

## Riferimenti

- [`src/lib/plans/catalog.ts`](../src/lib/plans/catalog.ts) — quote, upload,
  conservazione, voce e routing.
- [`src/lib/plans/resolver.ts`](../src/lib/plans/resolver.ts) — risoluzione del
  piano effettivo.
- [`src/lib/ai/turn-plan.ts`](../src/lib/ai/turn-plan.ts) — capacità dei turni
  Guest e autenticati.
- [`docs/rate-limiting.md`](./rate-limiting.md) — implementazione delle quote.
- [`docs/ai-system.md`](./ai-system.md) — routing dei modelli AI.
