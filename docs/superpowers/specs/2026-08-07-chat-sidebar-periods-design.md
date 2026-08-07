# Raggruppamento temporale delle chat nella sidebar

## Obiettivo

Dividere la lista delle conversazioni nella sidebar in gruppi temporali leggibili, separati da un divider, senza cambiare API, database o comportamento delle singole chat.

## Comportamento

Le chat vengono classificate in base a `updatedAt` e al calendario locale dell'utente, mantenendo l'ordine corrente (dalla più recente alla più vecchia). I gruppi disponibili sono:

1. Oggi
2. Ieri
3. Ultimi 7 giorni
4. Ultimi 30 giorni
5. Precedenti

La distanza viene calcolata in giorni di calendario locali: differenza `0` significa `Oggi`, `1` significa `Ieri`, da `2` a `7` significa `Ultimi 7 giorni`, da `8` a `30` significa `Ultimi 30 giorni`, oltre `30` significa `Precedenti`. Date future o non valide ricadono in `Precedenti`.

Un gruppo vuoto non viene renderizzato. Le chat con una data non valida ricadono in `Precedenti`, così un dato anomalo non interrompe il rendering della sidebar.

## Design tecnico

`ChatList` oggi riceve chat già complete nello stato client, ma il tipo locale ignora `updatedAt`. Il tipo verrà esteso e la classificazione sarà estratta in un helper puro, riutilizzabile nei test:

- `getChatPeriod(updatedAt, now)` restituisce il periodo della singola chat;
- `groupChatsByPeriod(chats, now)` restituisce solo i gruppi non vuoti nell'ordine stabilito.

Il rendering sostituirà l'unica `<ul>` con sezioni per periodo. Ogni sezione avrà un titolo italiano e una linea orizzontale sottile; gli elementi manterranno `ChatItem`, le chiavi, l'`AnimatePresence` e tutti i callback esistenti.

## Accessibilità e stile

I titoli dei gruppi saranno intestazioni semantiche associate alla rispettiva sezione. Il divider userà i colori e la densità già presenti nella sidebar, senza introdurre componenti o variabili globali. Il testo resterà leggibile in tema chiaro e scuro e non interferirà con le azioni hover/touch.

## Test e verifica

I test unitari copriranno:

- oggi e ieri;
- il confine dei 7 giorni;
- il confine dei 30 giorni;
- le date precedenti e non valide;
- l'ordine dei gruppi e l'omissione dei gruppi vuoti.

La verifica finale eseguirà i test mirati, `bun run lint` e `git diff --check`.

## Fuori ambito

- modifiche a Prisma, API o query delle chat;
- cambio dell'ordinamento esistente;
- collasso/espansione dei gruppi;
- nuove preferenze di visualizzazione o nuove traduzioni.
