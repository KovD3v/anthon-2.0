# Stati e piani utente

Questo documento descrive gli stati e i piani personali effettivamente
riconosciuti da Anthon 2.0.

Il nome tecnico corretto del piano intermedio è `BASIC_PLUS`; `basci_plus` è
un refuso. `ADMIN` esiste tecnicamente, ma non è un piano commerciale.

## Confronto principale

| Stato o piano | Destinatario | Richieste AI/giorno | Token input/giorno | Token output/giorno | Costo AI massimo/giorno | Messaggi di contesto | Upload/giorno | Conservazione allegati | Voce |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |
| **Guest** | Utente non registrato | 10 | 20.000 | 10.000 | $0,05 | 5 | Nessuno | 1 giorno | No |
| **Trial** | Utente registrato senza un piano attivo riconosciuto | 75 | 100.000 | 50.000 | $0,50 | 10 | 10 file, massimo 50 MiB totali | 7 giorni | No |
| **Basic** | Abbonamento Basic attivo | 50 | 500.000 | 250.000 | $3,00 | 15 | 25 file, massimo 250 MiB totali | 30 giorni | Sì, massimo 10 ogni 12 ore |
| **Basic Plus** | Abbonamento Basic Plus attivo | 50 | 800.000 | 400.000 | $5,00 | 30 | 50 file, massimo 500 MiB totali | 60 giorni | Sì, massimo 20 ogni 12 ore |
| **Pro** | Abbonamento Pro attivo | 100 | 2.000.000 | 1.000.000 | $15,00 | 100 | 100 file, massimo 2 GiB totali | 180 giorni | Sì, massimo 50 ogni 36 ore |

Il numero di messaggi di contesto indica quanti messaggi recenti possono essere
passati al modello per generare una risposta. Non è il numero massimo di
messaggi conservati nella conversazione.

Il singolo file è limitato a 10 MiB per tutti i piani che consentono gli
upload. I valori monetari sono soglie tecniche interne di consumo AI, non il
prezzo dell'abbonamento.

## Differenze funzionali

| Funzione | Guest | Trial | Basic | Basic Plus | Pro |
| --- | :---: | :---: | :---: | :---: | :---: |
| Account e conversazioni associate all'utente | No | Sì | Sì | Sì | Sì |
| Memorie, profilo e preferenze persistenti | No | Sì | Sì | Sì | Sì |
| RAG e conoscenza documentale | No | Sì | Sì | Sì | Sì |
| Upload di immagini o allegati | No | Sì | Sì | Sì | Sì |
| Risposte vocali | No | No | Sì | Sì | Sì |
| Contesto conversazionale | Minimo | Limitato | Medio | Ampio | Massimo |
| Protezione anti-abuso aggiuntiva | Sì | No | No | No | No |

Gli utenti Guest ricevono un prompt e un contesto ridotti e non possono usare
le funzionalità persistenti di profilo, memoria e RAG. Gli utenti autenticati
possono accedere a queste funzionalità quando il piano del turno le richiede.

## Modelli AI

Tutti i piani usano attualmente lo stesso orchestratore testuale principale e
lo stesso fallback:

- orchestratore: `openai/gpt-5.6-luna`;
- fallback: `deepseek/deepseek-v4-flash`;
- elaborazione delle immagini: `moonshotai/kimi-k2.7-code`;
- manutenzione: `google/gemini-2.5-flash-lite`.

I sub-agent cambiano in base al piano:

| Piano | Modello sub-agent |
| --- | --- |
| Guest | `google/gemini-2.5-flash-lite` |
| Trial | `google/gemini-2.5-flash-lite` |
| Basic | `google/gemini-2.5-flash-lite` |
| **Basic Plus** | **`google/gemini-2.5-flash`** |
| Pro | `google/gemini-2.5-flash-lite` |

Allo stato attuale Basic Plus usa quindi un sub-agent nominalmente superiore
a quello configurato per Pro. Questa configurazione merita una verifica se non
è intenzionale.

## Risoluzione dello stato effettivo

Il piano applicato non dipende esclusivamente dallo stato della sottoscrizione:

1. un utente non autenticato viene risolto come `GUEST`;
2. `ADMIN` e `SUPER_ADMIN` ricevono i limiti amministrativi;
3. una sottoscrizione `ACTIVE` o `TRIAL` con un `planId` riconosciuto viene
   risolta come `BASIC`, `BASIC_PLUS` o `PRO`;
4. un utente registrato senza un piano riconosciuto ricade su `TRIAL`;
5. un utente appartenente a un'organizzazione può ricevere entitlement più
   forti del proprio piano personale.

Di conseguenza, `TRIAL` può descrivere sia il livello gratuito di un utente
registrato sia lo stato amministrativo di una prova Clerk. Se la prova Clerk
contiene già un `planId` valido, vengono applicati i limiti del piano indicato.

Gli stati amministrativi `CANCELED`, `EXPIRED` e `PAST_DUE` non costituiscono
piani separati. In assenza di un'altra fonte valida di entitlement, ricadono
sui privilegi Trial.

La durata della prova non è fissata nel catalogo locale: viene ricevuta da
Clerk tramite `trial_period_days`. I test del webhook includono un esempio di
sette giorni, ma questo non costituisce una durata globale codificata.

## Quote, reset e protezioni

- I contatori giornalieri vengono azzerati alle `00:00 UTC`.
- Un utente può raggiungere il limite tramite richieste, token oppure costo AI.
- Le nuove sessioni Guest sono limitate, per impostazione predefinita, a tre
  creazioni per indirizzo client attendibile e giorno UTC, anche cancellando il
  cookie.
- Le richieste AI concorrenti dei piani finiti sono protette da una
  prenotazione: un secondo turno simultaneo riceve un errore `409` ritentabile.
- Le quote effettive possono provenire dal piano personale oppure da un
  contratto organizzativo valido; il resolver seleziona la fonte valida più
  forte.

## Stato amministratore

`ADMIN` e `SUPER_ADMIN` non sono offerte acquistabili. Ricevono richieste,
token, costo e upload illimitati, fino a 100 messaggi di contesto e dieci anni
di conservazione degli allegati.

## Fonti nel repository

- [`src/lib/plans/catalog.ts`](../src/lib/plans/catalog.ts): catalogo canonico
  di quote, upload, conservazione, voce e routing dei modelli.
- [`src/lib/plans/resolver.ts`](../src/lib/plans/resolver.ts): risoluzione del
  piano personale e degli stati di fallback.
- [`src/lib/ai/turn-plan.ts`](../src/lib/ai/turn-plan.ts): differenze tra turni
  Guest e autenticati.
- [`src/lib/rate-limit/config.ts`](../src/lib/rate-limit/config.ts): accesso
  alle quote e alla conservazione effettive.
- [`docs/rate-limiting.md`](./rate-limiting.md): funzionamento delle quote,
  degli upload e degli entitlement organizzativi.
- [`docs/ai-system.md`](./ai-system.md): routing dei modelli AI.
