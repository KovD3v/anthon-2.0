# Piani e stati utente

Anthon assegna a ogni utente un piano effettivo. Il piano determina quote AI,
contesto conversazionale, upload, conservazione degli allegati e accesso alla
voce.

I piani personali supportati sono:

- `GUEST`
- `TRIAL`
- `BASIC`
- `BASIC_PLUS`
- `PRO`

> **Nota:** il nome corretto è `BASIC_PLUS`. `basci_plus` non è un identificatore
> valido.

## Panoramica

| Piano | Utente | Richieste/giorno | Contesto | Upload/giorno | Conservazione | Voce |
| --- | --- | ---: | ---: | --- | ---: | --- |
| **Guest** | Non registrato | 10 | 5 messaggi | Non disponibili | 1 giorno | Non disponibile |
| **Trial** | Registrato, senza piano riconosciuto | 75 | 10 messaggi | 10 file · 50 MiB | 7 giorni | Non disponibile |
| **Basic** | Abbonato Basic | 50 | 15 messaggi | 25 file · 250 MiB | 30 giorni | 10 risposte ogni 12 ore |
| **Basic Plus** | Abbonato Basic Plus | 50 | 30 messaggi | 50 file · 500 MiB | 60 giorni | 20 risposte ogni 12 ore |
| **Pro** | Abbonato Pro | 100 | 100 messaggi | 100 file · 2 GiB | 180 giorni | 50 risposte ogni 36 ore |

Il contesto rappresenta il numero massimo di messaggi recenti inviati al
modello per generare una risposta. Non limita i messaggi conservati nella
conversazione.

Ogni file può avere una dimensione massima di 10 MiB.

## Quote AI

| Piano | Token input/giorno | Token output/giorno | Costo massimo/giorno |
| --- | ---: | ---: | ---: |
| **Guest** | 20.000 | 10.000 | $0,05 |
| **Trial** | 100.000 | 50.000 | $0,50 |
| **Basic** | 500.000 | 250.000 | $3,00 |
| **Basic Plus** | 800.000 | 400.000 | $5,00 |
| **Pro** | 2.000.000 | 1.000.000 | $15,00 |

Le soglie di costo sono limiti tecnici di consumo AI e non corrispondono al
prezzo dell'abbonamento. Una richiesta viene bloccata quando raggiunge una
qualsiasi delle quote applicabili: richieste, token o costo.

Le quote giornaliere si azzerano alle `00:00 UTC`.

## Funzionalità

| Funzionalità | Guest | Trial | Basic | Basic Plus | Pro |
| --- | :---: | :---: | :---: | :---: | :---: |
| Conversazioni associate all'account | — | ✓ | ✓ | ✓ | ✓ |
| Profilo e preferenze persistenti | — | ✓ | ✓ | ✓ | ✓ |
| Memorie persistenti | — | ✓ | ✓ | ✓ | ✓ |
| RAG e conoscenza documentale | — | ✓ | ✓ | ✓ | ✓ |
| Immagini e allegati | — | ✓ | ✓ | ✓ | ✓ |
| Risposte vocali | — | — | ✓ | ✓ | ✓ |

Il piano Guest usa un contesto ridotto e non accede a profilo, memorie o RAG.
Le nuove sessioni Guest sono inoltre limitate, per impostazione predefinita, a
tre creazioni per indirizzo client attendibile al giorno.

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
| Fallback orchestratore | `deepseek/deepseek-v4-flash` |
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
