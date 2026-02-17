# Guida Test Semplificata

Guida pratica per persone non IT.
Obiettivo: provare l'app, trovare problemi e segnalarli in modo chiaro.

## 1) Procedura unica di test

Ogni persona segue sempre questo flusso:

1. entra nell'app
2. esegue la checklist della propria area
3. se trova un problema, lo segnala subito con il template
4. continua dal punto in cui si era fermata

Tempo consigliato: 20-30 minuti per sessione.

Nota importante:

- se una funzione non e visibile nel proprio account, scrivere "funzione non visibile" e passare al punto successivo

## 2) Segnalazione problema (obbligatoria)

Per ogni errore servono solo questi 5 dati:

- mail usata per l'accesso
- giorno e ora del problema
- descrizione breve
- screenshot o registrazione (se presenti)
- step per riprodurre il problema

Template da copiare:

```md
Mail di accesso:
Giorno e ora:
Descrizione:
Screenshot/registrazione:
Step per riprodurre:
1.
2.
3.
```

Regola semplice:

- chi testa invia questa segnalazione
- noi trasformiamo la segnalazione in issue GitHub

## 3) Suddivisione persone per area (percentuali)

| Area | Percentuale personale | Scopo |
| --- | --- | --- |
| Chat, file, vocali e canali | 30% | test funzioni di comunicazione e contenuti |
| Profiles, usage, tier e accessi | 25% | test account, limiti e login |
| Admin panel e organizations | 20% | test gestione lato admin |
| Troublemakers | 15% | provare a rompere l'app in modo creativo |
| General purpose | 10% | uso libero realistico su piu funzioni |

Totale: 100%.

Come applicare le percentuali in un team piccolo:

`ore area = ore totali test del team x percentuale area`

Esempio con 4 persone e 5 ore ciascuna (20 ore totali):

- Chat, file, vocali e canali: 6 ore
- Profiles, usage, tier e accessi: 5 ore
- Admin panel e organizations: 4 ore
- Troublemakers: 3 ore
- General purpose: 2 ore

Regole di organizzazione:

- ogni area deve avere almeno 1 owner
- troublemakers e general purpose ruotano a ogni ciclo
- le segnalazioni si aprono subito, non a fine giornata

## 4) TODO dettagliato per area

### A) Chat, file, vocali e canali (30%)

#### Chat

- [ ] creare una nuova chat
- [ ] inviare un messaggio semplice
- [ ] inviare un secondo messaggio nella stessa chat
- [ ] aprire una chat gia esistente dalla lista
- [ ] rinominare la chat
- [ ] eliminare la chat
- [ ] usare ricerca chat con parola presente
- [ ] usare ricerca chat con parola non presente
- [ ] lasciare feedback su una risposta
- [ ] esportare la chat

#### File

- [ ] caricare un file piccolo supportato
- [ ] verificare che il file compaia nella chat
- [ ] inviare un messaggio dopo l'upload
- [ ] provare file non supportato e verificare errore chiaro
- [ ] provare file troppo grande e verificare errore chiaro

#### Vocali

- [ ] creare audio/voce da testo
- [ ] ascoltare l'audio generato
- [ ] riprovare con testo diverso
- [ ] verificare messaggio chiaro quando la funzione non e disponibile

#### Canali

- [ ] aprire la pagina canali
- [ ] collegare Telegram o WhatsApp
- [ ] inviare un messaggio di test dal canale collegato
- [ ] verificare che il messaggio arrivi in app
- [ ] scollegare il canale e verificare disconnessione

### B) Profiles, usage, tier e accessi (25%)

#### Profilo

- [ ] aprire la pagina profilo
- [ ] modificare un dato profilo
- [ ] salvare e ricaricare la pagina per verificare persistenza

#### Usage

- [ ] usare la chat e verificare aggiornamento utilizzo
- [ ] verificare che il contatore usage sia coerente
- [ ] verificare messaggio al raggiungimento del limite

#### Tier

- [ ] verificare il tier mostrato nell'account
- [ ] verificare coerenza tra tier e limiti visibili
- [ ] se previsto, verificare aggiornamento dopo cambio tier

#### Accessi

- [ ] login con account valido
- [ ] logout e ritorno alla schermata accesso
- [ ] apertura pagina protetta senza login (deve chiedere accesso)
- [ ] se disponibile, provare reset password o accesso alternativo

### C) Admin panel e organizations (20%)

Solo per persone con permessi admin.

#### Admin panel

- [ ] aprire dashboard admin
- [ ] verificare caricamento sezioni principali
- [ ] aprire pagina utenti e verificare elenco
- [ ] aprire dettaglio utente

#### Organizations

- [ ] aprire lista organizations
- [ ] aprire una organization esistente
- [ ] verificare dati principali (nome, stato, impostazioni base)
- [ ] modificare un dato consentito e salvare
- [ ] verificare audit/log attivita

### D) Troublemakers (15%)

Test di stress e comportamenti anomali:

- [ ] clic rapidi ripetuti sullo stesso bottone
- [ ] invio messaggi molto lunghi
- [ ] invio caratteri speciali, emoji e testo vuoto
- [ ] apertura di piu tab della stessa pagina
- [ ] refresh durante caricamento risposta
- [ ] logout/login rapido durante uso chat
- [ ] tentativo azione non consentita (es. pagina admin senza permesso)
- [ ] verificare che l'app non si blocchi e mostri errori chiari

### E) General purpose (10%)

Uso libero realistico, come un utente normale:

- [ ] usare l'app 10-15 minuti in modo naturale
- [ ] combinare piu funzioni nello stesso flusso (chat + ricerca + profilo)
- [ ] cambiare pagina spesso e verificare continuita sessione
- [ ] verificare fluidita generale dell'esperienza
- [ ] segnalare comportamenti strani anche se non bloccanti

## 5) Chiusura giro test

Il giro test e chiuso quando:

- tutte le aree assegnate sono state eseguite
- tutte le segnalazioni usano il template completo
- i problemi bloccanti sono stati evidenziati
