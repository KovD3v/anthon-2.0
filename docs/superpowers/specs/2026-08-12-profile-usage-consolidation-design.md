# Consolidamento utilizzo nel profilo

## Obiettivo

Semplificare il menu account della sidebar e rendere `/profile` l'unica pagina
dedicata in cui l'utente consulta il proprio utilizzo giornaliero. Gli avvisi
contestuali di soglia nella chat restano invariati. La pagina dedicata
`/chat/usage` viene rimossa senza redirect e deve rispondere `404`.

## Ambito

- Rimuovere `Chat`, `Utilizzo` e `Prezzi` dal menu account nella sidebar.
- Aggiungere una sezione autonoma `Utilizzo` nella pagina `/profile`, subito
  prima della sezione `Impostazioni`.
- Conservare `/api/usage` come origine dei dati.
- Conservare `/pricing` come destinazione dell'azione di upgrade.
- Aggiornare i link interni che oggi puntano a `/chat/usage` affinché puntino a
  `/profile#utilizzo`.
- Eliminare il file di pagina che registra la route `/chat/usage`.

Non rientrano nell'ambito modifiche ai limiti, ai piani, al calcolo
dell'utilizzo, al banner di soglia nella chat o alle altre voci del menu.

## Esperienza utente

Il menu account continua a offrire profilo, canali, assistenza, home, tema,
organizzazione quando disponibile e uscita. Non replica più destinazioni già
raggiungibili dalla struttura principale o non pertinenti al menu account.

Nella pagina `/profile`, una card con `id="utilizzo"` compare dopo il profilo
Clerk e prima delle preferenze. La card mostra:

- piano effettivo;
- messaggi rimasti e limite giornaliero;
- barra di utilizzo e conteggio dei messaggi usati;
- tempo restante al reset di mezzanotte;
- azione di upgrade verso `/pricing` quando applicabile.

La sezione usa gli stessi token, bordi, raggi e gerarchia tipografica delle
card impostazioni già presenti. Non viene incorporata dentro la lista delle
preferenze, perché rappresenta stato del piano e non una preferenza editabile.

## Componenti e responsabilità

### `SidebarBottom`

Rimuove esclusivamente le tre voci richieste e i relativi import non più usati.
Tutte le altre azioni e il comportamento di apertura e chiusura restano
invariati.

### `UsageSection`

Nuovo componente client sotto l'area profilo. Esegue una richiesta GET a
`/api/usage` senza cache, calcola valori derivati esclusivamente per la
presentazione e gestisce in modo locale caricamento, successo ed errore.

La sezione non duplica la logica di entitlements o rate limit: visualizza il
contratto `UsageData` restituito dall'API esistente.

### `ProfileClient`

Compone `UsageSection` tra `UserProfile` e `PreferencesSection`. Nessun dato di
utilizzo viene sollevato nel client della pagina o caricato dal server, perché
il resto della pagina deve rimanere utilizzabile anche se `/api/usage` fallisce.

### Route e link

`src/app/(chat)/chat/usage/page.tsx` viene eliminato. Non viene aggiunto alcun
redirect, rewrite o fallback: una richiesta a `/chat/usage` deve seguire il
normale comportamento `404` di Next.js.

I CTA interni che offrono `Controlla utilizzo` puntano a
`/profile#utilizzo`, evitando link interni verso la route rimossa.

## Stati e gestione errori

- Durante il caricamento, la sezione mostra uno skeleton con dimensioni stabili.
- Con dati validi, mostra il riepilogo completo.
- In caso di risposta non valida o errore di rete, mostra un messaggio locale
  chiaro; il profilo Clerk e le preferenze restano disponibili.
- Il limite zero non produce divisioni non valide: la percentuale mostrata è
  zero.
- I valori oltre il limite vengono limitati visivamente al 100%, mentre i
  conteggi reali restano leggibili.

## Accessibilità e responsive

- La sezione è identificabile dal titolo `Utilizzo` e dall'anchor
  `#utilizzo`.
- La barra di avanzamento espone valore corrente e massimo in modo semantico.
- Il CTA mantiene un nome esplicito e un target touch adeguato.
- La composizione resta su una colonna nel contenitore `max-w-4xl` esistente e
  non introduce overflow a 390 px.

## Verifica

- Test del menu account: assenza di `Chat`, `Utilizzo` e `Prezzi`; presenza
  delle azioni conservate.
- Test di `UsageSection`: caricamento, successo, errore, limite zero e CTA.
- Test del profilo: ordine `UserProfile` → `Utilizzo` → `Impostazioni`.
- Test dei CTA rate-limit: destinazione `/profile#utilizzo`.
- Verifica route: `/chat/usage` restituisce `404` e non redirige.
- Verifica browser desktop e mobile della pagina profilo e del menu account.
- Verifica Next.js di compilazione, errori runtime e mappa route.
