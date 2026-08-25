# Piani e stati utente

Guest è l'unico accesso gratuito. Dopo la registrazione, il coaching richiede
Basic, Basic Plus, Pro oppure un posto finanziato da un'organizzazione. Un
account senza entitlement mantiene l'accesso Web ai propri dati e ai controlli
privacy, ma chat, canali e upload rispondono con `PAID_ACCESS_REQUIRED`.

## Piani

| Piano | Accesso | Richieste/giorno | Contesto | Upload/giorno | Conservazione | Voce out |
| --- | --- | ---: | ---: | --- | ---: | --- |
| **Guest** | Anteprima Web non registrata | 4 | 5 messaggi | Non disponibili | 1 giorno | — |
| **Basic** | Personale o organizzazione | 50 | 15 messaggi | 25 file · 250 MiB | 30 giorni | 10 audio ogni 12 ore |
| **Basic Plus** | Personale o organizzazione | 50 | 30 messaggi | 50 file · 500 MiB | 60 giorni | 20 audio ogni 12 ore |
| **Pro** | Personale o organizzazione | 100 | 100 messaggi | 100 file · 2 GiB | 180 giorni | 50 audio ogni 36 ore |

Ogni file può pesare al massimo 10 MiB. Le quote giornaliere si azzerano alle
`00:00 UTC`. Il contesto limita i messaggi recenti inviati al modello, non la
cronologia conservata.

## Quote AI

| Piano | Input/giorno | Output/giorno | Limite costo/giorno |
| --- | ---: | ---: | ---: |
| **Guest** | 20.000 | 10.000 | $0,05 |
| **Basic** | 500.000 | 250.000 | $3,00 |
| **Basic Plus** | 800.000 | 400.000 | $5,00 |
| **Pro** | 2.000.000 | 1.000.000 | $15,00 |

Il limite costo è una soglia operativa, non il prezzo dell'abbonamento. Il
sistema blocca nuovi turni quando raggiunge il primo limite tra richieste,
token e costo.

## Risoluzione dell'accesso

1. Un visitatore non autenticato riceve `GUEST`.
2. `ADMIN` e `SUPER_ADMIN` ricevono `ADMIN`.
3. Una sottoscrizione `ACTIVE` con un `planId` riconosciuto riceve `BASIC`,
   `BASIC_PLUS` o `PRO`.
4. Un contratto organizzativo attivo può finanziare lo stesso accesso privato.
5. Senza una fonte valida, il resolver restituisce `PAID_ACCESS_REQUIRED`.

Gli stati `CANCELED`, `EXPIRED` e `PAST_DUE` non concedono coaching. I dati
dell'account restano di proprietà dell'account holder secondo le regole di
conservazione e cancellazione. Se non esiste un entitlement attivo, messaggi
grezzi e allegati mantengono una finestra di conservazione di 7 giorni; un
posto organizzativo attivo applica invece la conservazione del piano
finanziato.

## Routing

Tutti i piani usano `openai/gpt-5.6-luna` come orchestratore, con fallback
`deepseek/deepseek-v4-flash-0731` e `google/gemini-2.5-flash-lite`. Il
sub-agent usa `google/gemini-2.5-flash-lite`, salvo Basic Plus che usa
`google/gemini-2.5-flash`.

## Riferimenti

- [`src/lib/plans/catalog.ts`](../src/lib/plans/catalog.ts)
- [`src/lib/plans/resolver.ts`](../src/lib/plans/resolver.ts)
- [`docs/rate-limiting.md`](./rate-limiting.md)
