# Guida Test Semplificata

Guida pratica per persone non IT.
Obiettivo: provare l'app, trovare problemi e segnalarli in modo chiaro.

## 1) Procedura di test

Ogni persona segue questo flusso:

1. entra nell'app
2. verifica se il test va fatto con login oppure senza login
3. esegue la checklist della propria area
4. se trova un problema, lo segnala subito
5. continua dal punto in cui si era fermata

Tempo consigliato: 20-30 minuti per sessione.

Note rapide:

- se una funzione non e visibile, scrivere "funzione non visibile"
- se un punto non riguarda il proprio test, scrivere "non applicabile"
- 1 problema = 1 segnalazione

## 2) Segnalazione problema

Quando trovi un problema, invialo subito con queste informazioni:

- account usato, oppure "non loggato"
- giorno e ora
- dispositivo e browser
- pagina o sezione
- tipo di problema
- descrizione breve
- risultato atteso
- risultato effettivo
- step per riprodurre
- screenshot o registrazione, se presenti

Tipi di problema:

- bug / funzione non va
- messaggio di errore
- pagina lenta o bloccata
- dati sbagliati o mancanti
- problema grafico / layout
- problema di accesso / permessi
- altro

Template da copiare:

```md
Account usato:
Giorno e ora:
Dispositivo:
Browser:
Pagina/sezione:
Tipo di problema:
Descrizione:
Risultato atteso:
Risultato effettivo:
Screenshot/registrazione:
Step per riprodurre:
1.
2.
3.
```

Regole semplici:

- se un dato non e disponibile, scrivere "non so"
- se il problema blocca il test, segnalarlo subito
- noi trasformiamo la segnalazione in issue GitHub

## 3) Assegnazione aree

| Area | Percentuale | Scopo |
| --- | --- | --- |
| Chat, file, vocali e canali | 30% | test comunicazione e contenuti |
| Profiles, usage, tier e accessi | 25% | test account, limiti e login |
| Admin panel e organizations | 20% | test gestione lato admin |
| Troublemakers | 15% | provare a rompere l'app |
| General purpose | 10% | uso libero realistico |

Regole:

- ogni area deve avere almeno 1 owner
- troublemakers e general purpose ruotano a ogni ciclo
- le segnalazioni si aprono subito, non a fine giornata

## 4) Checklist per area

### A) Chat, file, vocali e canali

#### Chat

- [ ] creare una nuova chat
- [ ] inviare messaggi
- [ ] aprire una chat esistente
- [ ] rinominare la chat
- [ ] eliminare la chat
- [ ] usare la ricerca chat
- [ ] lasciare feedback su una risposta
- [ ] esportare la chat

#### File

- [ ] caricare un file supportato
- [ ] verificare che compaia nella chat
- [ ] inviare un messaggio dopo l'upload
- [ ] provare file non supportato
- [ ] provare file troppo grande

#### Vocali

- [ ] creare audio da testo
- [ ] ascoltare l'audio
- [ ] riprovare con testo diverso
- [ ] verificare messaggio chiaro se non disponibile

#### Canali

- [ ] aprire la pagina canali
- [ ] collegare Telegram o WhatsApp
- [ ] inviare un messaggio di test
- [ ] verificare che arrivi in app
- [ ] scollegare il canale

### B) Profiles, usage, tier e accessi

#### Profilo

- [ ] aprire la pagina profilo
- [ ] modificare un dato
- [ ] salvare e verificare persistenza

#### Usage

- [ ] usare la chat e verificare aggiornamento utilizzo
- [ ] verificare coerenza del contatore
- [ ] verificare messaggio al raggiungimento del limite

#### Tier

- [ ] verificare il tier mostrato
- [ ] verificare coerenza tra tier e limiti
- [ ] verificare aggiornamento dopo cambio tier, se previsto

#### Accessi

- [ ] accesso a una pagina pubblica senza login, se prevista
- [ ] login con account valido
- [ ] logout
- [ ] apertura pagina protetta senza login
- [ ] reset password o accesso alternativo, se disponibile

### C) Admin panel e organizations

Solo per persone con permessi admin.

#### Admin panel

- [ ] aprire dashboard admin
- [ ] verificare che le sezioni principali si aprano senza errori
- [ ] aprire pagina utenti
- [ ] aprire dettaglio utente

#### Organizations

- [ ] aprire lista organizations
- [ ] aprire una organization esistente
- [ ] verificare dati principali
- [ ] modificare un dato consentito e salvare
- [ ] verificare audit/log attivita

### D) Troublemakers

- [ ] clic rapidi ripetuti sullo stesso bottone
- [ ] invio messaggi molto lunghi
- [ ] invio caratteri speciali, emoji e testo vuoto
- [ ] apertura di piu tab della stessa pagina
- [ ] refresh durante caricamento risposta
- [ ] logout/login rapido durante uso chat
- [ ] tentativo azione non consentita
- [ ] verificare che l'app non si blocchi e mostri errori chiari

### E) General purpose

- [ ] usare l'app 10-15 minuti in modo naturale
- [ ] combinare piu funzioni nello stesso flusso
- [ ] cambiare pagina spesso e verificare continuita sessione
- [ ] verificare fluidita generale
- [ ] segnalare comportamenti strani anche se non bloccanti

## 5) Chiusura giro test

Il giro test e chiuso quando:

- tutte le aree assegnate sono state eseguite
- tutte le segnalazioni usano il template
- i problemi bloccanti sono stati evidenziati
- i punti non eseguibili sono stati marcati come "funzione non visibile" o "non applicabile"