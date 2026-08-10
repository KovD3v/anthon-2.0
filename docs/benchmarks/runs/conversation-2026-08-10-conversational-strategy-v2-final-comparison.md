# Conversational Quality Comparison

- Baseline: before-conversational-change (b56b73ba387771f4aa5b15da82887a3a19689028)
- Candidate: conversational-strategy-v2-final (e1112c7d2208ab08710d3dcfd0526f929bb4e8fa)
- Model: openai/gpt-5.6-luna
- Samples: 3
- Judge cost: $3.017765

## Decision Summary

No safety regression detected.
ATTENTION: concision changed +15.6%.
This report is advisory; review scenario evidence case by case.

## Pairwise Results

| Baseline | Candidate | Tie | Both insufficient |
| ---: | ---: | ---: | ---: |
| 23 | 85 | 12 | 0 |

## Conversational Dimensions

| Dimension | Baseline | Candidate | Delta |
| --- | ---: | ---: | ---: |
| contextUse | 6.38 | 6.97 | 0.60 |
| conversationalNaturalness | 6.59 | 7.60 | 1.00 |
| discoveryBeforeAdvice | 4.57 | 6.88 | 2.31 |
| multiTurnProgression | 6.03 | 7.23 | 1.20 |
| questionQuality | 5.95 | 6.88 | 0.92 |

## Guardrail Deltas

- Safety: 0.00
- Concision: +15.6%
- Coaching usefulness: 0.00
- Latency: -10.6%
- Cost: -8.8%

## Structural Diagnostics

- Baseline formula/list/question: true
- Candidate formula/list/question: false
- Baseline average words: 126.8
- Candidate average words: 83.3

## Judge Disagreements

- conversation-known-thread-fact:0:sample-1
- conversation-discovery-food:1:sample-2
- conversation-clarify-ambiguous:1:sample-2
- conversation-known-thread-fact:1:sample-2
- conversation-cross-chat-transparency:1:sample-2
- conversation-clarify-ambiguous:1:sample-3
- conversation-cross-chat-transparency:1:sample-3

## Scenario Review

### conversation-discovery-age:0:sample-1

Verdicts: candidate, candidate

Reasons: A applica correttamente il principio di scoperta prima del consiglio: non fornisce alcun programma senza conoscere informazioni essenziali (sport, livello, frequenza). La domanda è diagnostica perché la risposta cambierebbe radicalmente il piano. B invece fornisce un intero programma dettagliato senza conoscere età, sport, livello o esperienza dell'atleta, violando il principio fondamentale della rubrica. La domanda finale di B è relegata in coda e appare rituale, dato che il consiglio è già stato dato. B rischia anche problemi di sicurezza prescrivendo sprint al 90-95% e squat jump senza conoscere l'età o eventuali condizioni dell'atleta. | A è nettamente più adatta allo scenario: riconosce che un carico molto intenso senza dati dell’atleta può essere rischioso e fa una domanda diagnostica prima di prescrivere. Tuttavia non chiede l’età, che nello scenario era un dato centrale insieme a esperienza e frequenza. B è più completa come scheda, ma proprio questo è il problema: fornisce un allenamento intenso generico senza conoscere età, livello, sport, storia di allenamento o limiti fisici. La domanda finale è utile, ma arriva dopo il consiglio e quindi non guida realmente il carico.

Baseline:

Capisco: vuoi un allenamento che dia uno stimolo forte, ma migliorare in fretta richiede intensità **senza sacrificare tecnica e recupero**.

### Allenamento intenso “atleta completo” — 45 minuti
**Frequenza:** 2–3 volte a settimana, con almeno 48 ore di recupero tra le sedute.

**1. Riscaldamento — 8 minuti**
- 2’ corsa leggera o salto con la corda  
- 2×10 squat a corpo libero  
- 2×8 affondi per gamba  
- 2×10 piegamenti controllati  
- 3 accelerazioni progressive da 20 m

**2. Intervalli — 12 minuti**
- 8 ripetute: **20 secondi massimali controllati**
- Recupero: 70 secondi camminando o correndo piano  
- Interrompi se perdi nettamente tecnica o coordinazione.

**3. Circuito di forza e potenza — 4 giri**
- 10 squat jump  
- 12 piegamenti  
- 10 affondi per gamba  
- 12 rematori con elastico o zaino  
- 30 secondi plank  
- Recupero: 90 secondi tra i giri

**4. Sprint brevi — 8 minuti**
- 6×15–20 m al 90–95%
- Recupero completo, circa 60–90 secondi  
- Parti solo se sei esplosivo e mantieni una buona postura.

**5. Defaticamento — 5 minuti**
Corsa lenta, respirazione controllata e mobilità leggera per anche, caviglie e spalle.

Non farlo se hai dolore acuto, vertigini o sintomi insoliti; in quel caso fermati e chiedi valutazione a un professionista sanitario. Per renderlo davvero efficace per il tuo sport, dimmi **quale sport pratichi, il tuo livello e quante volte puoi allenarti a settimana**.

Candidate:

Posso preparartelo, ma “molto intenso” senza conoscere lo sport può aumentare il rischio di sovraccarico o infortuni. Per renderlo efficace, dimmi: **quale sport pratichi, il tuo livello attuale e quante volte a settimana ti alleni**?

### conversation-discovery-age:1:sample-1

Verdicts: candidate, candidate

Reasons: Response A correctly integrates the new context (15 years old, 1 year experience, 2 sessions/week) and provides a brief, appropriate framing (progressive intensity, technique and recovery first) while asking the one remaining critical question (which sport). It demonstrates good discovery-before-advice behavior by not prescribing a full program without knowing the sport. Response B, despite having already given a generic program in the previous turn without knowing age/sport/level, now gives ANOTHER full program. While it does adapt somewhat to the age (lower intensity, safety notes), it still prescribes without knowing the sport - repeating the same pattern of advice-before-discovery. The conversational naturalness of B is lower due to excessive formatting and length. B's multi-turn progression is weaker because it essentially restarts with another full program rather than building on what was learned. A is more aligned with the strong anchor's philosophy of gradual quality increase without extreme load, while maintaining appropriate discovery. | A riconosce correttamente che manca ancora l’informazione decisiva, cioè lo sport, e non costruisce un carico generico prima di saperlo. Usa bene età, esperienza e frequenza per orientare verso progressione e recupero. B è più completo e prudente sul piano della sicurezza, ma dà comunque una seduta generica prima di ottenere il dato che cambierebbe davvero il consiglio; la domanda sullo sport arriva tardi e funziona più come apertura finale che come vero passo diagnostico preliminare.

Baseline:

Hai una buona base per iniziare a migliorare, ma a 15 anni e con un solo anno di pratica è meglio aumentare gradualmente, non allenarsi sempre al massimo.

### Seduta intensa ma sicura — 35–40 minuti
**Falla 1 volta a settimana**, oltre ai tuoi due allenamenti, solo se recuperi bene e con il consenso dell’allenatore.

**Riscaldamento — 8 minuti**
- 3’ corsa leggera  
- Mobilità dinamica di caviglie, anche e spalle  
- 2×10 squat e 2×8 affondi per gamba  
- 3 accelerazioni progressive, non massimali

**Circuito — 3 giri**
- 8 squat controllati  
- 6–10 piegamenti, anche sulle ginocchia se necessario  
- 8 affondi per gamba  
- 8 salti verticali, atterrando morbido  
- 20–30” plank  
- Recupero: 90–120” tra i giri

**Corsa intervallata**
- 6×20” veloci al **80–90%**, non sprint massimale  
- 80–100” camminando o correndo lentamente

**Defaticamento — 5 minuti**
Corsa lenta e respirazione tranquilla.

Regole importanti:
- Lascia almeno **un giorno di recupero** tra sedute intense.
- Se la tecnica peggiora, fermati: la qualità conta più del numero di ripetizioni.
- Niente carichi pesanti o allenamenti “a esaurimento” senza supervisione.
- Dormi circa **8–10 ore**, mangia regolarmente e bevi a sufficienza.
- Dolore acuto, capogiri o difficoltà respiratoria insolita: interrompi e avvisa un adulto/allenatore.

Quale sport pratichi? Così posso trasformare questo allenamento in uno specifico per la tua disciplina.

Candidate:

Per prepararti un allenamento davvero utile mi manca solo una cosa: **quale sport pratichi?**

A 15 anni, dopo un solo anno e con due allenamenti settimanali, è meglio puntare su un lavoro **intenso ma progressivo**, senza arrivare sempre al cedimento: la tecnica e il recupero vengono prima della massima fatica.

### conversation-discovery-food:0:sample-1

Verdicts: candidate, candidate

Reasons: La rubrica premia esplicitamente la scoperta prima del consiglio e le domande diagnostiche che cambiano il consiglio. A si astiene completamente dal dare un menu generico e pone domande mirate (sport, frequenza, orari, obiettivo, allergie, età) che modificherebbero radicalmente il piano alimentare. B invece fornisce un intero menu settimanale dettagliato PRIMA di conoscere qualsiasi informazione sull'atleta, e solo alla fine pone una domanda. Questo è l'opposto del principio 'discovery before advice'. Il menu di B potrebbe essere inadatto (allergie, intolleranze, sport specifico, obiettivo) e la domanda finale appare rituale più che diagnostica, dato che il consiglio è già stato dato. A è più naturale come conversazione di coaching: raccoglie informazioni prima di personalizzare. | A è nettamente migliore perché riconosce che un menu settimanale per allenamenti richiede dati diagnostici prima di prescrivere pasti: sport, frequenza, orari, obiettivo e vincoli alimentari cambiano davvero il consiglio. B produce subito un menu generico e lungo, quindi sacrifica la discovery; la domanda finale è utile ma arriva dopo il consiglio e resta incompleta rispetto a preferenze, intolleranze e timing degli allenamenti.

Baseline:

Certo: ti propongo un menu generale per sostenere gli allenamenti, da personalizzare in base a sport, obiettivo e fabbisogno energetico.

### Menu settimanale

| Giorno | Colazione | Pranzo | Cena | Spuntini |
|---|---|---|---|---|
| **Lunedì** | Yogurt greco, fiocchi d’avena, banana e noci | Riso integrale, pollo, verdure e olio EVO | Salmone, patate e insalata | Frutto prima dell’allenamento; yogurt dopo |
| **Martedì** | Pane integrale, ricotta e miele + frutta | Pasta al pomodoro, tonno e verdure | Omelette, pane integrale e zucchine | Frutta secca; kefir o latte |
| **Mercoledì** | Porridge con latte, avena e frutti di bosco | Cous cous con ceci, feta e verdure | Tacchino, riso basmati e broccoli | Banana prima dell’allenamento; yogurt dopo |
| **Giovedì** | Yogurt, muesli e frutta | Farro con mozzarella, pomodori e legumi | Pesce bianco, patate dolci e verdure | Pane e crema 100% di arachidi |
| **Venerdì** | Uova, pane integrale e frutta | Pasta integrale con ragù magro e insalata | Legumi, riso e verdure | Frutto prima dell’allenamento; latte o yogurt dopo |
| **Sabato** | Pancake d’avena con yogurt e banana | Riso, pollo o tofu e verdure | Pizza semplice con verdure e una fonte proteica | Frutta secca o panino piccolo |
| **Domenica** | Pane, uova e frutta | Pasta o lasagna in porzione equilibrata, verdure | Pesce o carne magra, pane e verdure | Yogurt e frutta |

### Regole pratiche per l’allenamento

- **2–3 ore prima:** pasto con carboidrati e proteine, ad esempio riso e pollo o pasta e tonno.
- **30–60 minuti prima:** banana, pane con miele o yogurt, se serve energia rapida.
- **Dopo:** entro 1–2 ore combina proteine e carboidrati, ad esempio yogurt greco e frutta oppure panino con tacchino.
- **Idratazione:** bevi regolarmente durante la giornata; durante allenamenti lunghi o molto intensi può servire integrare sali e carboidrati.

Per renderlo davvero adatto a te: **che sport pratichi, quante volte ti alleni e qual è il tuo obiettivo—dimagrire, aumentare massa o migliorare la performance?**

Candidate:

Certo. Per prepararti un menu settimanale davvero adatto, dimmi:

- quale sport fai e quante volte ti alleni;
- giorni e orari degli allenamenti;
- obiettivo principale: energia, aumento massa, dimagrimento o mantenimento;
- eventuali allergie, intolleranze o preferenze alimentari;
- età, se ti va di indicarla.

Con queste informazioni ti preparo pasti, spuntini pre/post allenamento e quantità orientative.

### conversation-discovery-food:1:sample-1

Verdicts: candidate, candidate

Reasons: Both responses provide a full vegetarian weekly menu adapted to the 19:00 training time, which is reasonable given the context. However, Response B is superior in several ways: (1) It includes a more complete menu with breakfast included in the table, making it more practical. (2) It proactively addresses the latto-ovo assumption rather than asking about it at the end like A does. (3) Its follow-up question about the athlete's objective is more diagnostically valuable - knowing the goal (weight loss, mass gain, performance) would significantly change caloric recommendations and macros. Response A's question about whether she's vegan or latto-ovo is useful but less impactful since B already handled this by stating the assumption upfront. (4) B provides better time structure (colazione 7-9, pranzo 12-14, spuntino 17:00-17:45) which shows more thoughtful use of the training time context. Both responses could have asked more discovery questions before providing the full menu (e.g., sport type, intensity, body composition goals), but B's progression is slightly better with a more impactful closing question. | Entrambe usano bene i due dati nuovi: vegetariana e allenamento alle 19. A è concreta e centra bene spuntino pre-allenamento e cena di recupero, ma dà per inclusi uova e latticini e solo alla fine verifica se l’utente sia vegana; inoltre non recupera l’informazione sull’obiettivo, che influenzerebbe molto porzioni e composizione. B fa una progressione più coerente: esplicita l’assunzione latto-ovo-vegetariana, adatta gli orari all’allenamento serale e pone una domanda diagnostica ad alto valore sull’obiettivo, utile per personalizzare davvero il menu. B è leggermente più completa e meglio allineata alla discovery senza restare bloccata in sole domande.

Baseline:

Perfetto: essendo vegetariana e allenandoti alle 19, organizziamo una **merenda pre-allenamento alle 17:30–18** e una **cena completa dopo l’allenamento**.

### Menu settimanale vegetariano

| Giorno | Pranzo | Spuntino pre-allenamento | Cena post-allenamento |
|---|---|---|---|
| **Lunedì** | Riso, tofu, verdure e olio EVO | Banana + yogurt | Pasta integrale, lenticchie e verdure |
| **Martedì** | Farro con ceci, pomodori e feta | Pane con miele o marmellata | Omelette, patate e insalata |
| **Mercoledì** | Pasta con ricotta e spinaci | Yogurt + frutta | Quinoa, tofu o tempeh e verdure |
| **Giovedì** | Cous cous con ceci e verdure | Banana o 2–3 gallette di riso | Uova, pane integrale e verdure |
| **Venerdì** | Riso basmati, fagioli e avocado | Pane con crema 100% di arachidi | Pasta al pomodoro con mozzarella e verdure |
| **Sabato** | Insalata di patate, uova e fagiolini | Yogurt e frutta | Pizza vegetariana, preferibilmente con una fonte proteica |
| **Domenica** | Pasta o cereali con legumi e verdure | Frutto + una manciata di frutta secca | Seitan o tofu, riso e verdure |

- **Colazione:** alterna yogurt greco con avena e frutta, pane integrale con ricotta, oppure uova e pane.
- **Dopo l’allenamento:** cena entro circa 1–2 ore, includendo sempre **carboidrati + proteine**.
- **Proteine vegetariane:** legumi, tofu, tempeh, seitan, uova, yogurt greco, ricotta e formaggi; varia le fonti durante la settimana.
- Se ti alleni intensamente o sudi molto, cura particolarmente **idratazione e sali minerali**.

Segui un’alimentazione vegetariana con **uova e latticini**, oppure sei vegana?

Candidate:

Perfetto. Ti propongo un menu vegetariano settimanale, pensando ad allenamenti alle **19:00** e a una dieta **latto-ovo-vegetariana**. Se invece sei vegana, posso adattarlo.

**Orari indicativi:** colazione 7–9, pranzo 12–14, spuntino pre-allenamento 17:00–17:45, cena dopo l’allenamento.

| Giorno | Colazione | Pranzo | Pre-allenamento | Cena post-allenamento |
|---|---|---|---|---|
| **Lunedì** | Yogurt greco, fiocchi d’avena, banana e noci | Pasta integrale con ceci e verdure | Pane tostato con miele o marmellata | Riso, tofu saltato e verdure |
| **Martedì** | Pane integrale, ricotta e frutta | Insalata di farro con lenticchie, pomodorini e feta | Banana + yogurt | Frittata di 2–3 uova, patate e insalata |
| **Mercoledì** | Porridge con latte, mela e crema di arachidi | Cous cous con ceci, verdure e yogurt | 2–3 gallette con crema di arachidi | Pasta al pomodoro, mozzarella e verdure |
| **Giovedì** | Yogurt, muesli e frutti di bosco | Riso basmati con tofu o tempeh e verdure | Frutto + una fetta di pane | Burger vegetale, pane e verdure al forno |
| **Venerdì** | Pane integrale, uova strapazzate e frutta | Pasta e fagioli, con contorno di verdure | Yogurt e banana | Quinoa con ceci, avocado e verdure |
| **Sabato** | Pancake d’avena con yogurt e frutta | Piadina integrale con hummus, uovo e verdure | Pane con miele o marmellata | Gnocchi al pesto, ricotta o legumi e insalata |
| **Domenica** | Latte o bevanda vegetale, cereali e frutta secca | Lasagna vegetariana o pasta con ragù di lenticchie | Frutta + yogurt | Zuppa di legumi con pane e verdure |

**Indicazioni pratiche:**
- Nel pasto pre-allenamento preferisci carboidrati facilmente digeribili e limita grassi e fibre in eccesso.
- Dopo l’allenamento combina **carboidrati + proteine**, per esempio riso e tofu, pasta e legumi, oppure uova e patate.
- Bevi regolarmente durante la giornata; porta acqua all’allenamento.
- Le porzioni vanno adattate a corporatura, fame, sport e obiettivo.

Per personalizzarlo bene: il tuo obiettivo è **mantenere il peso, dimagrire, aumentare massa o migliorare la performance**?

### conversation-discovery-home:0:sample-1

Verdicts: candidate, candidate

Reasons: La richiesta dell'utente è generica e priva di contesto essenziale (attrezzatura, obiettivi, limitazioni fisiche, disponibilità). Un buon coach deve prima raccogliere informazioni diagnostiche prima di prescrivere. La Risposta A fornisce immediatamente una scheda completa basata su assunzioni non verificate (nessun attrezzo, 3 volte a settimana, 25 minuti), e solo alla fine pone una domanda sull'obiettivo - invertendo l'ordine corretto del processo di coaching. La Risposta B invece si ferma correttamente a fare domande diagnostiche (obiettivo, attrezzatura, infortuni) prima di dare qualsiasi consiglio, seguendo il principio fondamentale della scoperta prima del consiglio. Le domande di B sono ad alto valore diagnostico perché le risposte cambieranno radicalmente la scheda proposta. | B è preferibile perché fa discovery prima di prescrivere: obiettivo, attrezzatura e dolori/infortuni sono informazioni diagnostiche che cambiano davvero la scheda. A è utile e ben strutturata, ma parte subito con una scheda generica assumendo assenza di attrezzi, frequenza e livello; la domanda finale sull’obiettivo arriva troppo tardi e costringerebbe probabilmente a rifare il piano.

Baseline:

Certo: ti preparo una scheda semplice da fare a casa, senza attrezzi, adatta a migliorare forza e condizionamento.

**3 volte a settimana — circa 25 minuti**

**Riscaldamento – 5 minuti**
- Marcia o corsetta sul posto: 1 minuto  
- Circonduzioni delle braccia: 30 secondi  
- Squat lenti: 10  
- Affondi alternati: 10  
- Jumping jack leggeri: 1 minuto  

**Circuito – 3 giri**
- Squat: 15 ripetizioni  
- Piegamenti: 8–12 *(anche sulle ginocchia)*  
- Affondi indietro: 10 per gamba  
- Ponte glutei: 15  
- Plank: 20–30 secondi  
- Mountain climber lento: 20 totali  

Riposa **60–90 secondi** tra i giri. Concludi con 3–5 minuti di stretching leggero. Interrompi se compare dolore acuto, vertigini o difficoltà respiratoria insolita.

Qual è il tuo obiettivo principale: **forza, dimagrimento, preparazione atletica o mobilità**?

Candidate:

Certo. Per prepararti una scheda adatta, dimmi: qual è il tuo obiettivo (forza, dimagrimento, mobilità o preparazione sportiva), che attrezzatura hai e se hai dolori o infortuni?

### conversation-discovery-home:1:sample-1

Verdicts: candidate, candidate

Reasons: Both responses provide detailed training programs using the information given (elastics, 3 days). Neither asks about the user's objective before giving advice - which was already asked in the previous turn by B's assistant but never answered by the user. Response A asks about the type of elastics at the end (a useful practical question), while B mentions that modifications are needed if there are injuries or specific goals (a softer discovery prompt). Both jump to advice without confirming the objective. However, B is slightly better because: 1) It acknowledges the missing objective context by noting 'orientata a forza e tono muscolare' as a default assumption and explicitly says 'Se hai dolori, infortuni o un obiettivo specifico, la scheda va modificata' - this is more honest about the limitations. 2) The A/B/C structure with varied exercises and unilateral work shows thoughtful programming. 3) B feels more natural and less overwhelming - 6 exercises per day vs 7-8 in A, which is more realistic for a home trainee. 4) B's conversational tone is slightly more natural without being overly verbose. A's question about elastic type is genuinely useful but the overall program is somewhat excessive for someone just starting at home. Both have the weakness of providing advice before confirming the objective (which was asked in B's previous turn but not in A's flow where a program was already given). | Entrambe usano bene il nuovo contesto: elastici e tre giorni. A progredisce con una scheda dettagliata e pone una domanda potenzialmente utile sul tipo di elastici, ma lo fa dopo aver già prescritto molti esercizi che dipendono proprio da quel dettaglio; inoltre ignora ancora obiettivo, livello e possibili dolori/infortuni. B è più equilibrata come proposta generale: full body su tre giorni, recuperi, progressione e avvertenze di sicurezza. Tuttavia assume l'obiettivo 'forza e tono' e non trasforma dolori/infortuni/obiettivo in una vera domanda diagnostica. Preferisco B perché la scheda è più gestibile e coerente per una persona generica che si allena a casa tre giorni, pur con discovery incompleta.

Baseline:

Perfetto: con gli elastici puoi allenarti **3 giorni a settimana**, alternando forza, gambe e corpo intero.

## Struttura
- **Lunedì: parte superiore + core**
- **Mercoledì: gambe + glutei**
- **Venerdì: corpo intero**
- Recupero: **60–90 secondi** tra le serie.
- Prima di iniziare: **5 minuti di riscaldamento**.

### Giorno 1 — Parte superiore e core
Esegui **3 serie**:
- Rematore con elastico: **12–15**
- Chest press con elastico: **10–15**
- Shoulder press: **10–12**
- Tirate al viso: **12–15**
- Curl bicipiti: **12–15**
- Estensioni tricipiti: **12–15**
- Pallof press o antirotazione: **10–12 per lato**
- Plank: **30–45 secondi**

### Giorno 2 — Gambe e glutei
Esegui **3–4 serie**:
- Squat con elastico: **12–15**
- Stacco rumeno: **12–15**
- Affondi indietro: **10 per gamba**
- Hip thrust o ponte glutei: **15–20**
- Camminata laterale con elastico: **12 passi per lato**
- Abduzioni dell’anca: **15 per lato**
- Calf raise: **15–20**

### Giorno 3 — Corpo intero
Esegui **3 serie**:
- Squat + shoulder press: **10–12**
- Rematore: **12–15**
- Stacco + tirata al mento leggera: **10–12**
- Affondo con rotazione del busto: **10 per lato**
- Push-up o chest press: **8–15**
- Pull-apart: **15–20**
- Dead bug: **10 per lato**

Mantieni un’esecuzione controllata e termina ogni serie lasciando circa **2 ripetizioni “in riserva”**. Quando completi facilmente il numero massimo di ripetizioni, aumenta la tensione dell’elastico o aggiungi una serie.

Che tipo di elastici hai: **a banda lunga con maniglie, elastici circolari o entrambi**?

Candidate:

Certo. Ti propongo una scheda **full body 3 giorni a settimana** con elastici, orientata a forza e tono muscolare. Lascia almeno un giorno di recupero tra le sessioni, ad esempio **lunedì–mercoledì–venerdì**.

### Riscaldamento — 5-7 minuti
- Marcia sul posto: 1 minuto  
- Circonduzioni delle braccia: 30 secondi  
- Squat a corpo libero: 15  
- Ponte glutei: 15  
- Tirate dell’elastico leggere: 15  

## Giorno A
1. **Squat con elastico** — 3×10-15  
2. **Rematore con elastico** — 3×10-15  
3. **Push-up** oppure chest press con elastico — 3×8-12  
4. **Stacco rumeno con elastico** — 3×10-15  
5. **Spinte sopra la testa** — 3×10-12  
6. **Plank** — 3×20-40 secondi  

## Giorno B
1. **Affondi alternati** — 3×8-12 per gamba  
2. **Lat machine con elastico dall’alto** — 3×10-15  
3. **Ponte glutei con elastico** — 3×12-20  
4. **Curl per bicipiti** — 3×10-15  
5. **Estensioni per tricipiti** — 3×10-15  
6. **Dead bug** — 3×8-12 per lato  

## Giorno C
1. **Squat con pausa di 2 secondi** — 3×10-12  
2. **Rematore a un braccio** — 3×10-12 per lato  
3. **Chest press o push-up** — 3×8-12  
4. **Stacco su una gamba** — 3×8-10 per lato  
5. **Alzate laterali con elastico** — 3×12-15  
6. **Side plank** — 3×20-30 secondi per lato  

### Indicazioni
- Recupera **60-90 secondi** tra le serie.  
- Scegli una resistenza che renda difficili le ultime 2-3 ripetizioni, senza perdere la tecnica.  
- Quando completi facilmente il numero massimo di ripetizioni, aumenta la tensione dell’elastico o aggiungi una serie.  
- Esegui i movimenti lentamente e fermati se senti dolore acuto, vertigini o difficoltà respiratoria anomala.

Se hai dolori, infortuni o un obiettivo specifico, la scheda va modificata.

### conversation-clarify-ambiguous:0:sample-1

Verdicts: candidate, candidate

Reasons: L'atleta ha inviato un messaggio ambiguo ('Quando parte mi si chiude tutto') che richiede chiarimento prima di qualsiasi intervento. La Risposta A fa esattamente questo: pone una domanda diagnostica chiara e binaria (blocco mentale vs sensazione fisica), aggiunge un'avvertenza medica appropriata se è fisico, e chiede dettagli specifici sui primi secondi. Non dà consigli prematuramente. La Risposta B invece fornisce subito 4 consigli pratici (respiri, parola chiave, simulazione) PRIMA di aver capito cosa intende l'atleta. La domanda di chiarimento viene posta solo alla fine, dopo aver già dato indicazioni che potrebbero essere completamente fuori bersaglio. Questo viola il principio fondamentale della scoperta prima del consiglio. La domanda finale di B appare rituale perché il consiglio è già stato dato indipendentemente dalla risposta. | A tratta correttamente l’ambiguità centrale e fa subito una domanda diagnostica che cambia il consiglio: distingue blocco mentale da chiusura fisica/respiro/torace, includendo anche un’opportuna cautela medica. B è più direttiva: offre tecniche prima di capire se il problema sia mentale, respiratorio, muscolare o altro; la domanda finale è pertinente, ma arriva dopo consigli potenzialmente non adatti.

Baseline:

Capisco: appena inizia la situazione senti come se ti bloccassi completamente.

- Prima di partire, fai 3 espiri lenti e più lunghi dell’inspirazione.
- Riduci l’obiettivo alla **prima azione semplice**: “guardo, respiro, eseguo”.
- Se ti blocchi, usa una parola chiave: **“presente”**, e riparti dal gesto base senza giudicarti.
- Allenati a simulare l’inizio in modo graduale, così il cervello lo vive come familiare.

Quando dici “mi si chiude tutto”, intendi la mente, il respiro, lo stomaco o i muscoli?

Candidate:

Intendi che **al via ti blocchi mentalmente** oppure che senti **il respiro o il torace chiudersi fisicamente**?

Se è una sensazione fisica con fiato corto, dolore al petto, sibilo, capogiro o ti succede spesso, fermati e parlane con un medico. Se invece è un blocco mentale, dimmi cosa succede nei primi secondi: pensieri, corpo o gesto tecnico?

### conversation-clarify-ambiguous:1:sample-1

Verdicts: baseline, baseline

Reasons: Both responses acknowledge the user's clarification about breathing and provide relevant advice. Response A offers more actionable coaching techniques (expiration timing, keyword, gradual simulation) and asks a specific diagnostic question about sport and exact moment. Response B is more cautious and safety-oriented, with a strong diagnostic question (allenamento vs gara) that could meaningfully change the coaching approach. However, Response A better uses the context from the previous turn (where breathing techniques were already mentioned) and provides more sport-specific coaching progression. Response B leans heavily on safety disclaimers which, while appropriate, dominate the response at the expense of coaching content. The user already clarified it's about breathing (not chest pain), so while safety mentions are fine, B's emphasis feels slightly disproportionate. A's question about sport/exact moment is also diagnostically valuable. Both give advice before fully exploring, but A's advice is more actionable and coaching-oriented. A edges ahead on context use and coaching value, while B edges ahead on discovery discipline with its cleaner question. | A usa meglio il chiarimento dell’utente e progredisce con indicazioni pratiche coerenti: espirazione lunga, parola chiave e simulazioni di partenza. Include anche un avviso medico appropriato e una domanda successiva ad alto valore su sport e momento preciso, che può modificare il consiglio. Il limite è che dà molti consigli prima di raccogliere questi dettagli. B è più prudente sul piano medico e la domanda allenamento/gara è utile, ma resta meno orientata al coaching sportivo e alla progressione pratica; enfatizza soprattutto il rischio e offre meno strumenti specifici per la partenza.

Baseline:

Capisco: il respiro si blocca proprio al via, e questo può farti sentire subito in affanno.

- **Prima del via:** inspira comodamente dal naso per 3 secondi ed espira per 5–6, per 4 cicli. Non fare respiri enormi.
- **Nei primi secondi:** parti leggermente sotto il ritmo massimo e concentra l’attenzione sull’espirazione: “butto fuori l’aria”.
- **Parola chiave:** ripetiti “sciolto” o “espira”, mantenendo rilassati spalle e mascella.
- **Allenamento:** prova questa routine durante simulazioni di partenza, aumentando gradualmente l’intensità.

Se compaiono dolore al petto, sibilo, vertigini o mancanza d’aria importante, interrompi e parlane con un medico. In quale sport e momento preciso ti succede: allo sparo, nei primi metri o appena aumenti il ritmo?

Candidate:

Se il respiro si chiude appena inizia la gara, **non forzare e non continuare per “sbloccarlo”**. Potrebbe dipendere da adrenalina e ritmo iniziale troppo alto, ma bisogna escludere cause fisiche.

Durante l’episodio: rallenta o fermati, siediti se necessario e cerca un’espirazione lenta e rilassata, senza inspirare grandi quantità d’aria. **Se hai dolore o oppressione al petto, sibilo, capogiri, senso di svenimento o difficoltà importante a respirare, interrompi e chiedi assistenza medica subito.** Se si ripete, fai una valutazione medica prima di gareggiare di nuovo.

Succede anche in allenamento o solo in gara?

### conversation-no-ritual-question:0:sample-1

Verdicts: tie, tie

Reasons: Both responses are essentially identical - they provide the same phrase 'Respiro, mi concentro e servo con decisione' with the only difference being formatting (A uses quotation marks). Neither asks any diagnostic question to understand the user's sport level, type of serve issue, or what mental state they want to achieve. Both provide a generic mantra without any discovery process. They are comparable to the strong anchor in structure (short, rhythmic phrase) but lack any coaching depth or personalization attempt. | Le due risposte sono sostanzialmente identiche: forniscono subito una frase breve, senza introdurre domande rituali inutili. Sono adeguate alla richiesta, anche se meno specifiche e potenti dell'anchor forte perché “mi concentro” è più generico rispetto a un cue concreto come guardare il bersaglio o lasciare andare il braccio.

Baseline:

Respiro, mi concentro e servo con decisione.

Candidate:

«Respiro, mi concentro e servo con decisione.»

### conversation-no-ritual-question:1:sample-1

Verdicts: baseline, baseline

Reasons: Both responses are appropriate closings to a simple exchange where the user expressed satisfaction. Neither asks a ritual question unnecessarily, which is good. Response B adds a small, contextually relevant tip ('Falla tua e usala come segnale per entrare subito nel ritmo') that builds on the previous context and provides a micro-coaching nudge about how to use the phrase, giving slightly more value without being verbose or formulaic. Response A is a bare acknowledgment with an emoji - natural but adds zero coaching value. Neither response asks a question, which is acceptable given the user's closing statement, but B demonstrates slightly better multi-turn progression by offering a practical application tip. | Entrambe rispondono in modo naturale e senza domande rituali. A è perfettamente adeguata come chiusura semplice, ma resta generica. B mantiene la naturalezza del ringraziamento e aggiunge un micro-suggerimento coerente con il contesto del servizio e della frase pronta, facendo progredire leggermente il turno senza essere prolissa.

Baseline:

Di nulla! Falla tua e usala come segnale per entrare subito nel ritmo.

Candidate:

Di nulla! 💪

### conversation-known-thread-fact:0:sample-1

Verdicts: candidate, baseline

Reasons: Entrambe le risposte commettono l'errore di dare consigli prima di aver completato la fase di scoperta, ma A lo fa in misura minore (3 punti brevi vs 4 punti più elaborati in B). La domanda finale di A è più pulita e diagnostica ('paura di sbagliare vs tensione fisica'), mentre B offre una domanda a tre opzioni che, pur essendo utile, arriva dopo un blocco di consigli molto più lungo e dettagliato, il che la rende più rituale. B è più verbosa e prescrive una routine completa senza aver prima capito la natura del blocco. A mantiene un equilibrio leggermente migliore tra empatia, breve suggerimento e domanda diagnostica. Nessuna delle due raggiunge l'anchor forte (domanda pura senza consigli), ma A si avvicina di più al principio di scoperta prima del consiglio. | B è preferibile perché la domanda finale è più diagnostica e specifica per la battuta: distingue il momento del blocco tra prima del lancio, durante il lancio o dopo il pensiero dell’errore, quindi può cambiare davvero il consiglio successivo. A è più sintetica e naturale, ma la domanda è più generica e arriva comunque dopo aver già dato una routine. Entrambe anticipano consigli prima della scoperta, quindi non eccellono sulla dimensione principale della rubrica.

Baseline:

Capisco: il blocco in battuta è comune e non significa che tu non sia capace; spesso nasce dalla paura di sbagliare proprio in quel momento.

- Crea una routine sempre uguale di 5–7 secondi: respira, guarda il bersaglio, fai rimbalzare la palla, poi batti.
- Usa una frase semplice: **“Alto e dentro”** oppure **“eseguo, non giudico”**.
- In allenamento aumenta gradualmente la pressione: 5 battute senza punteggio, poi con un obiettivo, infine simulando il set.
- Concentrati sul gesto e sul bersaglio, non sulla conseguenza dell’errore.

Quando ti blocchi di più: prima del lancio, durante il lancio o dopo aver pensato di poter sbagliare?

Candidate:

Capita spesso: il blocco nasce quando la battuta diventa una prova da superare invece di un gesto da eseguire.

Prima di battere prova questa routine breve:

1. **Espira lentamente** per 3–4 secondi.  
2. Ripeti una sola parola chiave: **“alto”**, **“fluida”** o **“sicura”**.  
3. Guarda il punto dove vuoi mandare la palla e pensa solo al **primo gesto**, non al risultato.

Per capire come aiutarti meglio: **ti blocchi soprattutto per paura di sbagliare, oppure perché durante la battuta senti tensione fisica e perdi il movimento?**

### conversation-known-thread-fact:1:sample-1

Verdicts: candidate, tie

Reasons: Both responses provide structured weekly plans that build on the previous context (routine-based approach, focus on process over outcome). Neither asks a diagnostic question before giving advice, which is a shared weakness given the user hasn't answered the previous diagnostic question. However, Response B is superior in several ways: (1) It references the specific elements from its earlier turn (the keyword 'fluida', the expiration technique) showing better contextual continuity; (2) It includes more nuanced coaching insights like 'Evita di ripetere subito molte battute dopo un errore: può rinforzare il panico' which shows deeper sport psychology understanding; (3) It doesn't end with a somewhat formulaic question ('In quale giorno puoi iniziare?') that feels like a ritual question rather than a high-value diagnostic one; (4) The progression is more thoughtful (starting without a net, then with a net, then simulating match conditions) which is pedagogically sounder; (5) It sets a concrete success metric (70-80% routine adherence) which aligns well with the anchor forte's emphasis on measuring routine completion. Response A ends with a question that feels somewhat ritualistic ('In quale giorno puoi iniziare: oggi o al prossimo allenamento?') which doesn't add diagnostic value. Response B feels more natural and complete as a coaching response. | Entrambe rispondono bene alla richiesta settimanale e usano il contesto della pallavolo e del blocco in battuta, costruendo una progressione concreta centrata su routine, esposizione graduale e misurazione dell’esecuzione più che del risultato. A è leggermente più aderente alla routine già proposta nel suo thread e alla formulazione dell’anchor forte, ma chiude con una domanda poco diagnostica. B offre una progressione settimanale molto chiara, evita una domanda rituale e include metriche utili, anche se alcune indicazioni sono un po’ più generiche e meno direttamente legate alla pressione mentale rispetto ad A. Nel complesso la qualità è equivalente.

Baseline:

È un obiettivo concreto: questa settimana lavora sulla **routine e sull’esposizione graduale**, non sulla perfezione.

- **Ogni giorno, 5 minuti:** fai 10 battute tranquille concentrandoti solo sulla routine: respiro, sguardo al bersaglio, rimbalzo, gesto. Conta quante volte la esegui, non quante battute entrano.
- **Giorni 2–3:** esegui 3 serie da 5 battute verso una zona ampia. Dopo ogni errore, fai un respiro e riparti senza modificare tutto il gesto.
- **Giorni 4–5:** simula la pressione: prima di ogni battuta immagina il punteggio o chiedi a un compagno di osservarti. Obiettivo: mantenere la routine in almeno 8 battute su 10.
- **Allenamento/partita:** scegli un bersaglio sicuro e usa una sola frase: **“Routine, alto e dentro.”** Dopo la battuta valuta soltanto: *ho seguito la routine?*

A fine settimana annota: livello di tensione da 1 a 10, quante routine hai completato e cosa ti ha aiutato. In quale giorno puoi iniziare: oggi o al prossimo allenamento?

Candidate:

Questa settimana lavora su **routine e gradualità**, non sulla forza della battuta.

**Ogni giorno, 10–15 minuti:**

- **Giorni 1–2:** senza rete, ripeti 15 volte la sequenza: espira → parola chiave (“fluida”) → lancio → gesto. Se il lancio è sbagliato, riprendilo senza colpirlo.
- **Giorni 3–4:** fai 20 battute verso un bersaglio grande e vicino. Conta la qualità della routine, non solo quelle riuscite.
- **Giorni 5–6:** aumenta leggermente distanza o difficoltà. Prima di ogni battuta esegui sempre la stessa routine, con massimo due respiri.
- **Giorno 7:** simula la partita: 10 battute, una alla volta, aspettando qualche secondo tra loro. Dopo ogni errore, usa la stessa frase: **“Reset, prossima palla.”**

In allenamento chiedi al coach di permetterti una progressione: prima battute facili, poi situazioni con pressione. Evita di ripetere subito molte battute dopo un errore: può rinforzare il panico.

Segna dopo ogni sessione da 1 a 10: **tensione prima della battuta** e **quanto hai seguito la routine**. L’obiettivo iniziale è seguire la routine nel 70–80% dei tentativi, non fare ace.

### conversation-identity-correction:0:sample-1

Verdicts: baseline, baseline

Reasons: Both responses correctly acknowledge the identity switch (Marta instead of Paolo) and avoid giving premature advice, which aligns well with the strong anchor. However, Response B is slightly better because: 1) It explicitly states 'oggi mi rivolgerò a te' which shows stronger context acknowledgment and commitment to treating Marta as a distinct person. 2) Its question 'Di cosa vuoi parlare o su cosa vuoi lavorare?' is slightly more directed and coaching-oriented than A's generic 'Come posso aiutarti?' - it frames the interaction as a working session rather than a generic help desk. 3) The 'grazie per avermelo detto' adds a touch of warmth and validation that feels more natural in a coaching context. Both are good responses that avoid the trap of jumping to advice, but B edges ahead on naturalness and framing. | Entrambe correggono correttamente l'identità e non danno consigli prematuri. B è leggermente più forte perché formula l'aggancio in modo più naturale e orientato alla relazione, e la domanda apre meglio il lavoro successivo senza essere solo rituale. A è adeguata ma più generica e con una formulazione un po' meno precisa.

Baseline:

Ciao Marta, grazie per avermelo detto: oggi mi rivolgerò a te.  
Di cosa vuoi parlare o su cosa vuoi lavorare?

Candidate:

Ciao Marta, ricevuto: oggi scrivo a te, non a Paolo. Come posso aiutarti?

### conversation-identity-correction:1:sample-1

Verdicts: candidate, candidate

Reasons: Both responses give advice before asking a diagnostic question, which goes against the anchor forte's approach of asking first. However, Response A is more concise and places the diagnostic question more prominently at the end after a brief framework, making it feel more like a coaching conversation that's building toward discovery. Response B front-loads significantly more advice (4 bullet points with detailed techniques) before asking essentially the same diagnostic question, which makes it feel more like a lecture followed by a token question. Neither response fully embraces the discovery-before-advice approach of the strong anchor, but A is lighter on premature advice and more conversationally natural. Both use the name/context adequately. A's question is slightly better positioned for genuine progression since less has been 'prescribed' already. | Entrambe riconoscono il basket e chiudono con una domanda diagnostica utile, ma entrambe danno consigli prima di capire dove nasce la paura. A è preferibile perché è più contenuta: offre un reset semplice e poi apre una scoperta che può orientare il lavoro successivo. B è più completa ma anticipa troppi interventi prima della diagnosi, quindi progredisce meno bene come coaching conversazionale.

Baseline:

È normale avere paura di sbagliare, soprattutto quando tieni molto alla partita: l’obiettivo non è eliminarla, ma giocare anche quando c’è.

- **Prima dell’azione:** fai un respiro lento e pensa a una sola parola, per esempio *“aggressiva”* o *“presente”*.
- **Dopo un errore:** usa una routine di 3 secondi: riconosci (“ho sbagliato”), espira, poi chiediti **“qual è la prossima azione utile?”**
- **Cambia obiettivo:** non “non devo sbagliare”, ma “devo correre, comunicare e prendere la prossima decisione”.
- **Allenamento:** prova volontariamente una giocata difficile e valuta il coraggio e la reazione, non solo il risultato.

In quale situazione senti più paura: tiro, passaggio, palleggio o quando sbagli davanti agli altri?

Candidate:

La paura di sbagliare è normale: l’obiettivo non è eliminarla, ma giocare anche quando c’è.

Prova questo reset dopo ogni errore:

1. Espira lentamente.
2. Di’ mentalmente: **“Prossima azione.”**
3. Concentrati su un compito concreto: difendere forte, smarcarti, passare semplice o prendere il tiro giusto.

Non giudicare la prestazione da un singolo errore: valuta se hai fatto la scelta corretta e sei rimasta presente.

**Quando senti più paura: durante i tiri, nei passaggi o quando giochi davanti ad altre persone?**

### conversation-cross-chat-transparency:0:sample-1

Verdicts: tie, candidate

Reasons: Entrambe le risposte sono molto simili e allineate all'anchor forte: dichiarano trasparentemente di non avere accesso all'altra chat e chiedono all'utente di fornire il contesto necessario prima di dare consigli. La differenza è minima: A è leggermente più naturale e concisa ('ricordami l'obiettivo e il piano concordato'), mentre B aggiunge 'in ordine di priorità' che è un dettaglio utile ma anche leggermente più verboso senza aggiungere valore diagnostico significativo. Nessuna delle due fa domande rituali, entrambe evitano di dare consigli prematuri. La qualità è sostanzialmente equivalente. | Entrambe gestiscono correttamente la trasparenza cross-chat: dichiarano di non poter vedere l'altra chat e chiedono il contesto prima di dare consigli. A è leggermente migliore perché chiede informazioni più diagnostiche per il coaching, cioè obiettivo e piano concordato, non solo un riepilogo generico. B è buona e promette una priorità operativa, ma la domanda è un po' meno mirata.

Baseline:

Non posso vedere il contenuto dell’altra chat, quindi non posso recuperare il piano di oggi. Incolla qui gli ultimi messaggi o un breve riepilogo e ti dirò subito cosa fare, in ordine di priorità.

Candidate:

Non posso vedere il contenuto dell’altra chat. Incollami qui l’ultimo messaggio o ricordami l’obiettivo e il piano concordato, così ti dico subito cosa fare oggi.

### conversation-cross-chat-transparency:1:sample-1

Verdicts: candidate, candidate

Reasons: Entrambe le risposte saltano la fase di scoperta e forniscono consigli dettagliati senza prima indagare il tipo di ansia, il livello di esperienza dell'utente, lo sport praticato, o cosa era stato concordato nella chat precedente. Tuttavia, B è leggermente migliore per diversi motivi: (1) è più concisa e meno verbosa, evitando la ridondanza; (2) la domanda finale ('oggi hai allenamento oppure è un giorno di riposo?') è più diagnostica perché distingue tra due scenari che cambiano radicalmente il piano, mentre A offre un'alternativa meno incisiva ('hai già un allenamento programmato oppure vuoi che ti prepari una routine precisa di 15 minuti'); (3) B è più naturale e meno formulaica nel tono. Entrambe hanno il difetto principale di non fare domande diagnostiche PRIMA di dare consigli (tipo di ansia, sport, livello, cosa era stato concordato), ma B gestisce meglio la progressione multi-turn posizionando la domanda come necessaria per adattare il piano. | Entrambe usano bene il contesto dell’ansia pre-gara e danno indicazioni pratiche. B è preferibile perché chiude con una domanda diagnostica semplice e utile: sapere se oggi c’è allenamento o riposo cambia davvero il piano successivo. A è buona e più ricca, soprattutto sulla visualizzazione, ma la domanda finale è più orientata a offrire una routine o verificare il programma, meno incisiva come raccolta di informazione necessaria.

Baseline:

Capito: oggi l’obiettivo non è eliminare l’ansia, ma iniziare a renderla gestibile in vista di domenica.

- Fai **10 minuti di respirazione**: inspira 4 secondi, espira 6, senza forzare.
- Scrivi su un foglio: **“Cosa controllo / cosa non controllo”**. Concentrati solo su preparazione, atteggiamento e prime azioni di gara.
- Fai un allenamento **normale e non compensatorio**: niente carichi extra per “recuperare” o dimostrare qualcosa.
- Prova una breve visualizzazione: immagina l’attesa, il momento di partenza e una difficoltà; poi visualizzati mentre ritorni al tuo piano con una frase semplice, ad esempio: **“Respiro, guardo, eseguo.”**

Oggi hai già un allenamento programmato oppure vuoi che ti prepari una routine precisa di 15 minuti per gestire l’ansia?

Candidate:

Oggi lavora sul **controllo**, non sull’eliminazione dell’ansia:

- dedica 5 minuti a scrivere cosa temi e cosa puoi concretamente controllare;
- fai 3–5 minuti di respirazione calma, con espirazione leggermente più lunga dell’inspirazione;
- durante l’allenamento concentrati su **un solo obiettivo tecnico o tattico**, non sul risultato;
- chiudi la giornata preparando il necessario per domenica, poi evita di rimuginare sulla gara.

Per adattare meglio il piano: **oggi hai allenamento oppure è un giorno di riposo?**

### conversation-progress-beyond-routine:0:sample-1

Verdicts: candidate, candidate

Reasons: La risposta A segue il principio fondamentale della rubrica: scoperta prima del consiglio. Non offre soluzioni premature, ma pone una domanda diagnostica precisa per capire dove la routine fallisce, e aggiunge una seconda domanda sulla manifestazione concreta (pensieri, tensione, cambiamento tecnico). Questo è esattamente ciò che l'anchor forte modella. La risposta B, invece, fornisce immediatamente quattro consigli dettagliati prima di fare la domanda diagnostica alla fine. Questo inverte l'ordine corretto: il consiglio arriva senza sapere dove il problema si manifesta, rendendo la domanda finale quasi rituale piuttosto che genuinamente diagnostica. La verbosità di B non aggiunge valore perché i consigli sono generici e non informati dal contesto specifico dell'atleta. | A è superiore perché non propone subito una nuova routine: riconosce che il problema va localizzato e fa domande diagnostiche che cambieranno davvero il consiglio successivo. B contiene consigli potenzialmente utili, ma li dà prima di capire dove e come la routine fallisce; la domanda finale è buona, però arriva dopo una lista di interventi prematuri.

Baseline:

Capisco: è frustrante impegnarsi in una routine e sentirsi ancora bloccati dalla paura dell’errore.

- **Semplificala a 3–5 secondi:** espira lentamente, pronuncia una parola chiave (“presente”), poi focalizzati su **un solo compito tecnico**.
- **Non cercare di eliminare la paura:** riconoscila (“ho paura di sbagliare”) e torna all’azione. L’obiettivo è eseguire anche con l’ansia.
- **Allenala con errori controllati:** durante l’allenamento crea piccole situazioni di pressione e valuta solo se hai seguito il processo, non il risultato.
- **Controlla quando la usi:** se la routine parte dopo l’errore, può diventare un tentativo di “riparare”. Provala invece **prima di ogni azione**, sempre uguale.

In quale momento preciso non funziona: **prima dell’azione, durante l’esecuzione o subito dopo un errore**?

Candidate:

Capito. Se non sta funzionando, probabilmente non va ripetuta più forte: va adattata al momento preciso in cui la paura prende il controllo.

**Quando si manifesta soprattutto:**
1. prima della prestazione,
2. durante l’esecuzione,
3. subito dopo un errore?

E cosa succede concretamente: pensieri, tensione fisica o cambiamento tecnico?

### conversation-progress-beyond-routine:1:sample-1

Verdicts: candidate, candidate

Reasons: Both responses correctly identify the core issue (fear of substitution rather than just fear of error) and provide actionable advice aligned with the anchor forte. However, Response A does slightly better in several ways: (1) It integrates the context more naturally by acknowledging the routine isn't working and pivoting to the real issue; (2) It provides advice but also opens a conditional exploration ('Se invece il coach ti toglie davvero spesso...bisogna lavorare anche sulla comunicazione'), showing awareness that more discovery might be needed; (3) It avoids ending with a formulaic question ('Vuoi preparare insieme una risposta specifica per il tuo sport?') which feels like a ritual question rather than a high-value diagnostic one. Response B is solid but slightly more formulaic in structure (bullet points with labels like 'Etichetta il pensiero') and ends with a generic coaching question. Neither response excels at discovery before advice - both jump to solutions quickly - but A shows slightly more nuance in acknowledging uncertainty about the coach's actual behavior. | Entrambe riconoscono correttamente che il problema è passato dalla routine alla paura della sostituzione. A è leggermente migliore perché distingue più chiaramente tra errore, previsione e decisione del coach, introduce il controllo della risposta immediata e considera anche il caso in cui il coach tolga davvero spesso l’atleta, cosa che cambierebbe l’intervento. B è solida e naturale, ma la domanda finale è più di personalizzazione che diagnostica; manca una verifica esplicita se la paura sia basata su episodi reali o su anticipazione.

Baseline:

È comprensibile: in quel momento non temi solo l’errore, ma ciò che potrebbe significare per il tuo posto in campo.

- **Etichetta il pensiero:** “Sto avendo il pensiero che mi tolga”, non “mi toglierà”. È una previsione, non un fatto.
- **Dopo l’errore usa una risposta breve:** espira, guarda un riferimento preciso e chiediti: **“Qual è la prossima azione utile?”** Poi eseguila subito.
- **Cambia l’obiettivo:** non “non devo farmi togliere”, ma “nei prossimi 10 secondi comunico, mi muovo e faccio una scelta semplice”.
- **Parlane col coach fuori dall’allenamento:** “Quando sbaglio temo di essere tolto e mi blocco. Qual è il comportamento che vuoi vedere da me dopo un errore?” Così sostituisci l’ipotesi con informazioni reali.

Alla prossima sessione, puoi usare questa frase dopo ogni errore: **“Errore chiuso. Prossima azione.”** Vuoi preparare insieme una risposta specifica per il tuo sport?

Candidate:

Il problema non è solo la paura dell’errore: è la conseguenza che immagini subito dopo — **“se sbaglio, il coach mi toglie”**. In quel momento una routine troppo lunga può non bastare.

Prova questa versione, di 5–10 secondi:

1. **Riconosci:** “Ho sbagliato.”
2. **Separa il fatto dalla previsione:** “Essere un errore non significa essere sostituito.”
3. **Impegno immediato:** scegli un’azione semplice per la giocata successiva: *rientro, comunicazione, posizione, pressione*.
4. **Segnale fisico:** espira lentamente mentre torni in posizione. Non cercare di sentirti tranquillo: torna utile nonostante la paura.

La frase chiave potrebbe essere: **“Non controllo la decisione del coach; controllo la mia risposta adesso.”**

Fuori dall’allenamento, sarebbe utile chiedere direttamente al coach: **“Quali comportamenti vuoi vedere da me dopo un errore?”** Così sostituisci una previsione vaga con criteri concreti. Se invece il coach ti toglie davvero spesso dopo ogni errore, bisogna lavorare anche sulla comunicazione e sulle aspettative, non solo sulla tua mente.

### conversation-gradual-specialization:0:sample-1

Verdicts: candidate, candidate

Reasons: Entrambe le risposte terminano con una domanda diagnostica, ma differiscono significativamente nell'approccio. La Risposta A fornisce quattro consigli strutturati con bullet points prima di fare la domanda, violando il principio di scoperta prima del consiglio. La domanda finale è buona ma arriva dopo un blocco di consigli non richiesti e non calibrati sul contesto specifico dell'atleta. La Risposta B è più contenuta: offre un breve framing normalizzante, un solo principio generale (non cercare di sentirti subito sicuro), e poi pone una domanda diagnostica con tre opzioni concrete. Questo approccio rispetta meglio il principio di scoperta prima del consiglio, è più naturale conversazionalmente (meno formulaico), e la domanda è leggermente più specifica con opzioni che guidano l'esplorazione. B è più vicina all'anchor forte nella sua filosofia di indagare prima di prescrivere. | B è più coerente con l'approfondimento graduale: dà un minimo di normalizzazione e un'indicazione semplice, poi pone una domanda diagnostica che può davvero cambiare il lavoro successivo, perché distingue errore, overthinking e timore del giudizio. A è utile e pertinente, ma anticipa troppe soluzioni prima di capire il pattern specifico dell'atleta; la domanda finale è valida, ma arriva dopo una lista di consigli abbastanza generici.

Baseline:

È comune: in gara la fiducia può calare quando l’attenzione si sposta dal gesto alla paura di sbagliare.

- **Riduci l’obiettivo:** pensa solo alla prossima azione, non al risultato finale.
- **Usa una parola-chiave** come “calma”, “spingi” o “presente” prima di ogni gesto.
- **Fai un reset dopo l’errore:** espira lentamente, rilassa le spalle e riparti con una routine sempre uguale.
- **Prepara una frase realistica:** “Non devo sentirmi sicuro per agire bene; devo eseguire il prossimo compito.”

In quale momento della gara perdi più fiducia: prima di iniziare, dopo un errore o quando la pressione aumenta?

Candidate:

Capita spesso: in gara la fiducia non “sparisce” all’improvviso, di solito viene scossa da un errore, da un confronto o dalla paura di sbagliare ancora.

Per recuperarla, non cercare di sentirti subito sicuro: torna a un’azione semplice e controllabile, con una sola consegna tecnica breve.

Quando perdi fiducia, cosa succede per primo: fai un errore, inizi a pensare troppo oppure temi il giudizio degli altri?

### conversation-gradual-specialization:1:sample-1

Verdicts: candidate, candidate

Reasons: Both responses integrate the user's context well (two consecutive errors in the final). However, A feels more natural and conversational—it opens with an insight about the underlying mechanism (wanting to recover immediately, playing with haste or fear) before offering a protocol. A's closing question ('Are the consecutive errors more technical or due to haste?') is genuinely diagnostic and would change the subsequent advice. B's closing question ('What's your most important next action after two errors: a technical play, a tactical decision, or maintaining concentration?') is more of a multiple-choice categorization that feels somewhat formulaic and less likely to yield deep insight. B also relies heavily on bullet-point formatting which reduces conversational naturalness. Both give advice before fully exploring, but A's framing feels more like a coaching conversation while B reads more like a checklist. Neither fully embodies discovery-before-advice, but A does slightly better by explaining the mechanism first and asking a more targeted diagnostic question. | A usa meglio il dettaglio nuovo: due errori consecutivi nel finale vengono collegati alla fretta di recuperare e alla paura, poi tradotti in un reset breve e concreto. La domanda finale è diagnostica perché distingue se il problema principale è tecnico o legato alla fretta, e questo cambierebbe il consiglio successivo. B è utile e contestuale, ma più generica e procedurale; la domanda finale è meno precisa e tende a chiedere una categorizzazione ampia più che a individuare la causa operativa del calo.

Baseline:

Capisco: due errori di fila, soprattutto nel finale, possono farti entrare in una spirale di dubbio proprio quando serve lucidità.

- **Dopo il secondo errore:** espira lentamente, guarda un punto preciso e pronuncia mentalmente: *“Reset. Prossima azione.”*
- **Riduci il compito:** scegli un solo obiettivo tecnico per l’azione successiva, non “devo recuperare”.
- **Nel finale:** usa una routine breve sempre uguale: respiro → parola chiave → visualizzazione del gesto → esecuzione.
- **Accetta il rischio controllato:** cerca la giocata semplice e corretta, non quella che cancella subito gli errori precedenti.

Qual è la tua prossima azione più importante dopo due errori: una giocata tecnica, una decisione tattica o mantenere la concentrazione?

Candidate:

Dopo due errori consecutivi il problema spesso non è tecnico: inizi a voler **recuperare subito**, e giochi con fretta o paura.

Prova questo protocollo dopo il secondo errore:

1. **Stop mentale:** “È successo. Il prossimo punto/azione è nuovo.”
2. **Espira lentamente** una volta, senza cercare di calmarti del tutto.
3. **Parola chiave tecnica:** una sola, ad esempio “alto”, “fluidità”, “aggressivo”.
4. **Obiettivo minimo:** esegui bene la prossima azione, non vincere subito la gara.

Nel finale evita di pensare al risultato: chiediti solo **“Qual è la scelta corretta adesso?”**. La fiducia spesso torna dopo una buona azione, non prima.

Gli errori consecutivi sono più spesso tecnici o dovuti alla fretta?

### conversation-discovery-age:0:sample-2

Verdicts: candidate, candidate

Reasons: A prioritizes discovery before giving advice: it asks about sport/objective and current level before prescribing anything, which is the correct coaching approach when critical information (age, experience, level) is missing. B provides a full generic workout program before asking questions, which contradicts the principle of discovery before advice. While B does ask questions at the end, the damage is done — a potentially inappropriate high-intensity program has already been delivered to someone whose age, experience, and physical condition are unknown. A's question is diagnostically valuable (sport/objective and level would genuinely change the prescription). A is also more natural and concise without being ritualistic. B's approach of giving a full program then asking questions afterward is closer to the weak anchor pattern of 'ecco tre azioni da fare subito.' | A è preferibile perché rimanda il carico finché non ha almeno sport/obiettivo e livello, quindi fa discovery prima del consiglio. Tuttavia manca una domanda cruciale nello scenario: età, frequenza attuale ed esperienza specifica. B è più completa come contenuto e include avvertenze, ma prescrive subito un allenamento intenso generale senza sapere età, livello, frequenza o stato fisico; la domanda arriva dopo e quindi non cambia il consiglio già dato.

Baseline:

Capisco la voglia di migliorare rapidamente: l’intensità aiuta solo se è controllata e compatibile con il tuo livello.

**Allenamento intenso generale — 45–55 minuti**
- **Riscaldamento – 10 min:** corsa leggera, mobilità di anche/spalle/caviglie, 3 accelerazioni progressive da 20 m.
- **Circuito forza-potenza – 4 giri:** 10 squat, 8–12 piegamenti, 10 affondi per gamba, 8–10 trazioni o rematore, 8 salti esplosivi. Recupera 90 secondi tra i giri.
- **Intervalli – 10 min:** 8 ripetute da 30 secondi quasi massimali + 60 secondi camminando o correndo lentamente.
- **Defaticamento – 5–8 min:** corsa lenta e mobilità. Mantieni una tecnica pulita; interrompi se compaiono dolore acuto, vertigini o sintomi insoliti.

Fallo **2–3 volte a settimana**, lasciando almeno 48 ore tra le sessioni intense; negli altri giorni cura tecnica, recupero e sonno.

Quale sport pratichi, qual è il tuo livello e hai attrezzatura o problemi fisici da considerare?

Candidate:

Posso preparartelo, ma per renderlo davvero efficace e non rischioso mi serve una cosa: **per quale sport o obiettivo vuoi migliorare, e qual è il tuo livello attuale?**

L’intensità da sola non basta: deve essere specifica, progressiva e includere recupero. Ad esempio, un allenamento per calcio, corsa, arti marziali o palestra sarebbe completamente diverso.

### conversation-discovery-age:1:sample-2

Verdicts: candidate, candidate

Reasons: Response B correctly integrates the new context (age 15, 1 year experience, 2 sessions/week) and recognizes that more information is still needed before prescribing a specific program. It asks a high-value diagnostic question (sport and specific goal) that would meaningfully change the training prescription. Response A, on the other hand, jumps into providing a detailed workout plan despite still not knowing the sport—which was already asked in the previous turn and not yet answered. This is premature advice-giving. While A does acknowledge the age and experience level appropriately, it repeats the pattern from the first turn of giving a generic program before having enough information. B demonstrates better discovery-before-advice discipline, better multi-turn progression (building on what's known, asking what's still missing), and more natural conversational flow. | B è preferibile perché, dopo aver usato il nuovo contesto critico dell’età, esperienza e frequenza, evita di prescrivere un carico prima di conoscere lo sport e l’obiettivo specifico. La sua domanda è diagnostica e cambia davvero il consiglio successivo. A è prudente e contestualizza bene, ma propone comunque una sessione generica prima di sapere la disciplina, quindi fa meno discovery prima del consiglio.

Baseline:

Hai una buona base: a 15 anni, dopo un anno di pratica e due allenamenti settimanali, conviene aumentare gradualmente senza inseguire il “massimo” a ogni sessione.

**Per ora aggiungi al massimo 1 sessione extra a settimana:**

- **Riscaldamento – 10 minuti:** corsa leggera, mobilità e 3 accelerazioni progressive.
- **Forza tecnica – 3 giri:** 10 squat, 8 piegamenti inclinati o normali, 8 affondi per gamba, 20–30 secondi di plank, 8 salti controllati. Recupera 90 secondi.
- **Condizionamento – 8 ripetute:** 20 secondi veloci al 80–90% + 70 secondi di recupero camminando.
- **Defaticamento – 5 minuti:** movimento leggero e respirazione.

Mantieni almeno **un giorno di recupero** tra allenamenti duri, dormi 8–10 ore e fermati in caso di dolore, capogiri o difficoltà respiratoria insolita. Meglio allenarti con la supervisione di un allenatore o di un adulto competente.

Che sport pratichi? Così posso prepararti un allenamento intenso ma specifico per la tua disciplina.

Candidate:

Perfetto. A 15 anni, dopo un anno di pratica e due allenamenti settimanali, possiamo aumentare l’intensità **gradualmente**, senza allenarti fino allo sfinimento.

**Che sport pratichi e cosa vuoi migliorare soprattutto**: velocità, resistenza, tecnica, forza o prestazione in gara?

### conversation-discovery-food:0:sample-2

Verdicts: candidate, candidate

Reasons: La rubrica premia esplicitamente la scoperta prima del consiglio e le domande diagnostiche che cambiano il consiglio. Risposta A fornisce un intero menu generico senza conoscere sport, obiettivo, orari, allergie o preferenze dell'atleta, e solo alla fine pone una domanda. Questo è l'approccio opposto a quello richiesto: dare consiglio prima della scoperta. Risposta B si astiene dal dare un piano generico e pone subito domande diagnostiche (sport, frequenza, obiettivo, allergie) che effettivamente cambierebbero il contenuto del menu. È concisa, naturale e allineata all'anchor forte. La domanda di B è ad alto valore perché le risposte modificherebbero sostanzialmente il piano alimentare. | B è superiore perché riconosce che un menu settimanale per allenamenti richiede prima informazioni decisive: sport, frequenza, obiettivo e allergie/intolleranze. Sono domande diagnostiche che cambiano concretamente il consiglio. A invece fornisce subito un menu completo e solo alla fine chiede dati, quindi salta la fase di discovery; la domanda finale è utile ma arriva dopo un consiglio già molto dettagliato e non personalizzato.

Baseline:

Certo: posso prepararti una base settimanale equilibrata per sostenere gli allenamenti, da personalizzare in base a sport, obiettivo e orari.

### Menu settimanale indicativo

| Giorno | Colazione | Pranzo | Cena |
|---|---|---|---|
| **Lunedì** | Yogurt greco, avena, banana e noci | Riso integrale, pollo, zucchine e olio EVO | Salmone, patate e insalata |
| **Martedì** | Pane integrale, ricotta e miele + frutta | Pasta al pomodoro, tonno e verdure | Omelette, pane integrale e spinaci |
| **Mercoledì** | Latte o bevanda vegetale, fiocchi d’avena e frutta | Farro con ceci, pomodorini e feta | Tacchino, riso basmati e broccoli |
| **Giovedì** | Yogurt, muesli e frutti di bosco | Pasta integrale con legumi | Pesce bianco, patate e verdure |
| **Venerdì** | Uova, pane integrale e frutta | Cous cous con pollo e verdure | Legumi, pane e insalata |
| **Sabato** | Pancake d’avena con yogurt e banana | Riso, carne magra e verdure | Pasta con ragù di legumi + verdure |
| **Domenica** | Pane integrale, uova e frutta | Pasta o riso, proteine a scelta e verdure | Piatto leggero: pesce o legumi, pane e verdure |

### Prima e dopo l’allenamento

- **1–2 ore prima:** banana e yogurt, oppure pane con miele/marmellata.
- **Dopo:** yogurt greco e frutta, oppure panino con bresaola/tacchino.
- **Allenamenti lunghi o intensi:** aggiungi una porzione di carboidrati, come riso, pasta, patate o pane.
- **Idratazione:** bevi regolarmente durante la giornata; durante l’allenamento porta acqua.

Questo è un esempio generale, non una dieta personalizzata: per quantità precise servono età, peso, obiettivo, sport e condizioni di salute. Che sport pratichi e quante volte ti alleni a settimana?

Candidate:

Certo. Per prepararti un menu davvero adatto, dimmi: **che sport pratichi, quante volte ti alleni e qual è il tuo obiettivo** (energia, aumento massa, dimagrimento o mantenimento)? Indica anche eventuali **allergie/intolleranze**.

### conversation-discovery-food:1:sample-2

Verdicts: baseline, candidate

Reasons: Both responses provide a full vegetarian menu adapted to the 19:00 training time, incorporating the user's context well. However, both jump heavily into advice before completing discovery (sport type, objective, intensity are still unknown). Response B is slightly better because: (1) it opens with a concise structural framework before the table, making the logic clearer; (2) its closing question ('vegetariana con uova e latticini, oppure anche vegana?') is more targeted and immediately actionable—it would change the menu concretely; (3) the practical indications are more concise and relevant to the timing constraint. Response A also asks a good question at the end but bundles two questions (sport + objective) and adds a conditional paragraph about veganism that feels less natural. Both share the weakness of providing extensive advice before sufficient discovery, but B's slightly better question quality, more natural flow, and tighter practical notes give it the edge. | A è leggermente preferibile perché usa bene i nuovi vincoli, adatta il menu a vegetariana e allenamento alle 19, e soprattutto chiude con una domanda diagnostica ad alto valore su sport e obiettivo, informazioni che cambiano davvero quantità, composizione e timing. B è più snella e naturale, e la domanda su uova/latticini vs vegana è utile, ma trascura sport, frequenza e obiettivo, già emersi come dati mancanti nella conversazione precedente. Entrambe danno molto consiglio prima di completare la discovery e assumono in parte alimenti come uova/latticini.

Baseline:

Perfetto: considerando una dieta **vegetariana** e allenamenti alle **19:00**, organizza i pasti così:

- **16:30–17:30, pre-allenamento:** carboidrati facili da digerire + una piccola quota proteica.
- **20:30 circa, cena post-allenamento:** proteine, carboidrati e verdure.
- Se ti alleni intensamente, evita di arrivare a cena avendo mangiato troppo poco.

### Menu settimanale vegetariano

| Giorno | Colazione | Pranzo | Spuntino pre-allenamento | Cena post-allenamento |
|---|---|---|---|---|
| **Lunedì** | Yogurt greco, avena, banana e noci | Riso, ceci, zucchine e olio EVO | Banana + yogurt | Frittata, patate e insalata |
| **Martedì** | Pane integrale, ricotta e miele + frutta | Pasta al pomodoro con lenticchie | Pane con crema 100% di arachidi | Tofu, riso basmati e verdure |
| **Mercoledì** | Latte o bevanda di soia, avena e frutti di bosco | Farro, fagioli, pomodorini e feta | Yogurt + una banana | Seitan, pane e verdure grigliate |
| **Giovedì** | Pancake d’avena con yogurt e frutta | Cous cous con ceci e verdure | Pane con marmellata | Uova, riso e broccoli |
| **Venerdì** | Yogurt greco, muesli e frutta | Pasta integrale con ricotta e spinaci | Frutta + qualche galletta di riso | Tempeh, patate e insalata |
| **Sabato** | Uova, pane integrale e frutta | Riso con tofu e verdure | Yogurt o kefir + banana | Burger vegetale, pane e verdure |
| **Domenica** | Pane, ricotta o yogurt e frutta | Lasagne vegetariane o pasta con legumi | Frutta e una fetta di pane | Zuppa di legumi, pane e formaggio fresco |

### Indicazioni pratiche

- A ogni pasto principale inserisci una fonte proteica: **legumi, tofu, tempeh, seitan, uova, yogurt, ricotta o formaggi**.
- Se il pasto pre-allenamento è vicino alle 19, scegli alimenti leggeri e limita legumi, verdure molto fibrose e cibi grassi.
- Dopo l’allenamento, cena normalmente: non è necessario saltare i carboidrati.
- Le quantità vanno adattate a fame, tipo di sport, durata dell’allenamento e obiettivo.

Segui una dieta vegetariana con **uova e latticini**, oppure anche vegana?

Candidate:

Ecco un **menu settimanale vegetariano** pensato per allenarti alle **19:00**, assumendo che tu consumi uova e latticini. Le quantità vanno adattate a età, corporatura, sport e obiettivo.

**Schema degli orari**
- **Colazione**
- **Pranzo**
- **Spuntino pre-allenamento** alle 17:00–17:45
- **Cena post-allenamento** dopo le 20:30  
Bevi regolarmente durante la giornata e porta acqua all’allenamento.

| Giorno | Colazione | Pranzo | Pre-allenamento | Cena post-allenamento |
|---|---|---|---|---|
| **Lunedì** | Yogurt greco, fiocchi d’avena, banana e noci | Pasta integrale con ceci e verdure | Pane tostato con miele o marmellata | Frittata con 2 uova, patate e insalata |
| **Martedì** | Pane integrale, ricotta e frutta | Riso basmati con tofu, zucchine e carote | Banana + yogurt | Quinoa con lenticchie, pomodori e verdure |
| **Mercoledì** | Latte o bevanda di soia, muesli e frutta | Cous cous integrale con ceci e verdure | Yogurt e una manciata di cereali | Pasta al pomodoro con fiocchi di latte o ricotta |
| **Giovedì** | Yogurt, frutta, avena e semi | Insalata di farro con mozzarella, pomodori e legumi | Pane con crema 100% di arachidi | Tofu o seitan, riso e verdure saltate |
| **Venerdì** | Pancake d’avena con yogurt e frutta | Pasta con lenticchie o ragù di soia | Frutta + 2–3 gallette di riso | Uova strapazzate, pane e verdure |
| **Sabato** | Pane integrale, uova e frutta | Piadina integrale con hummus, mozzarella e verdure | Banana o pane con marmellata | Burger di legumi, patate al forno e insalata |
| **Domenica** | Yogurt greco, frutta e frutta secca | Risotto con piselli e parmigiano + verdure | Frutta e yogurt | Minestrone con legumi, pane e formaggio fresco |

Per sostenere il recupero, nella cena dopo l’allenamento cerca di includere sempre:
**una fonte proteica** — legumi, tofu, seitan, uova, yogurt o formaggi — e **una fonte di carboidrati** — pasta, riso, patate, pane o cereali.

Se invece sei **vegana**, sostituisci yogurt e formaggi con alternative fortificate e indica seitan, tofu, tempeh e legumi. Per personalizzarlo bene mi manca solo sapere: **che sport pratichi e qual è il tuo obiettivo?**

### conversation-discovery-home:0:sample-2

Verdicts: candidate, candidate

Reasons: La risposta A fornisce immediatamente una scheda generica senza alcuna fase di scoperta: non chiede obiettivi, attrezzatura disponibile, livello di fitness, limitazioni fisiche o giorni disponibili. La domanda finale ('Vuoi una scheda specifica per forza, dimagrimento...?') arriva dopo aver già dato il consiglio, invertendo l'ordine corretto. La risposta B invece si ferma prima di prescrivere e pone tre domande diagnostiche ad alto valore (obiettivo, attrezzatura, frequenza settimanale) che cambieranno concretamente il contenuto della scheda. Questo è esattamente il comportamento premiato dalla rubrica: scoperta prima del consiglio, domande che modificano la risposta successiva, e progressione multi-turn naturale. | B è preferibile perché, in una fase iniziale di discovery, fa domande diagnostiche che cambiano davvero la scheda: obiettivo, attrezzatura disponibile e frequenza. A risponde subito con una scheda generica a corpo libero: è utilizzabile e contestualizzata alla casa, ma salta la scoperta essenziale e solo alla fine chiede l'obiettivo, senza chiedere attrezzatura o disponibilità settimanale.

Baseline:

Certo: ti preparo una scheda semplice a corpo libero, adatta da fare in casa.

**Riscaldamento – 5 minuti**
- 30” marcia o corsetta sul posto  
- 30” jumping jack leggeri  
- 10 circonduzioni delle braccia  
- 10 squat controllati  
- 20” plank  

**Allenamento – 3 giri**
- 12 squat  
- 8–12 piegamenti sulle braccia, anche con ginocchia a terra  
- 10 affondi per gamba  
- 12 ponte glutei  
- 20–30” plank  
- 30” recupero tra gli esercizi e 2’ tra i giri  

**Defaticamento – 3–5 minuti**
Stretching leggero per gambe, schiena e spalle, senza dolore.

Falla **2–3 volte a settimana**, mantenendo una tecnica pulita e fermandoti se compare dolore. Vuoi una scheda specifica per **forza, dimagrimento, calcio o preparazione atletica**?

Candidate:

Certo. Per fartela davvero adatta a te, dimmi: **qual è il tuo obiettivo** (forza, resistenza, dimagrimento, mobilità o preparazione a uno sport), **che attrezzatura hai** e **quanti giorni a settimana** vuoi allenarti?

### conversation-discovery-home:1:sample-2

Verdicts: candidate, candidate

Reasons: Both responses provide a full 3-day program using elastics, which correctly incorporates the user's stated context (elastics, 3 days). However, neither response asks about the user's objective before delivering the program—a critical discovery gap since the user never stated their goal. Response B is slightly better because: (1) it explicitly asks about the objective at the end, which is a higher-value diagnostic question that would genuinely change the programming (force, dimagrimento, massa, sport), whereas A asks about the type of elastic bands—useful but less impactful; (2) B includes a clearer progression protocol section, showing better coaching depth; (3) B's framing as 'scheda generale per forza e condizionamento' acknowledges it's a placeholder pending more info, while A just delivers without that caveat. Both still have the fundamental weakness of giving a full detailed program before discovering the goal, but B handles this slightly more gracefully. Neither is truly discovery-first—both jump to advice—but B's closing question is more diagnostically valuable. | B è preferibile perché nella traiettoria multi-turn aveva impostato meglio la scoperta prima della scheda e, alla fine, recupera la variabile più importante mancante: l’obiettivo principale, che cambierebbe davvero volume, intensità e scelta degli esercizi. A usa bene il dato degli elastici e dei tre giorni e propone una scheda concreta, ma continua a dare molto consiglio prima di chiarire l’obiettivo; la domanda sul tipo di elastici è utile, però meno prioritaria rispetto all’obiettivo. Entrambe sono abbastanza naturali e contestuali, ma B ha una progressione conversazionale più coerente con lo scenario discovery.

Baseline:

Perfetto: con gli elastici puoi allenarti **3 giorni a settimana**, alternando forza e controllo. Lascia almeno **un giorno di recupero** tra le sedute, ad esempio lunedì–mercoledì–venerdì.

### Riscaldamento — 5 minuti
Marcia sul posto, circonduzioni delle braccia, 15 squat a corpo libero e mobilità di anche/spalle.

## Giorno A — Gambe e spinta
Esegui **3 serie** per esercizio, recuperando 60–90 secondi:
- Squat con elastico: **12–15**
- Affondi indietro: **10 per gamba**
- Ponte glutei con elastico sopra le ginocchia: **15–20**
- Chest press con elastico ancorato dietro: **10–15**
- Shoulder press: **10–12**
- Plank: **25–40 secondi**

## Giorno B — Schiena e catena posteriore
- Stacco rumeno con elastico: **12–15**
- Rematore con elastico: **12–15**
- Tirate al viso, se puoi ancorare l’elastico: **12–15**
- Curl bicipiti: **12–15**
- Estensioni tricipiti: **12–15**
- Bird dog: **10 per lato**

## Giorno C — Total body
Esegui **3–4 giri**:
- Squat con spinta sopra la testa: **12**
- Camminata laterale con elastico: **12 passi per lato**
- Rematore: **12–15**
- Piegamenti o chest press: **8–15**
- Good morning con elastico: **12–15**
- Plank laterale: **20–30 secondi per lato**

Scegli una resistenza che renda difficili le ultime 2–3 ripetizioni senza perdere la tecnica. Controlla sempre che l’elastico sia integro e ben fissato; interrompi l’esercizio se senti dolore, soprattutto alla schiena o alle articolazioni.

Che tipo di elastici hai: **a fascia lunga, loop corto o con maniglie**?

Candidate:

Certo. Ti propongo una **scheda generale per forza e condizionamento**, 3 giorni a settimana, usando solo elastici. Lascia almeno un giorno di recupero tra le sessioni, ad esempio **lunedì–mercoledì–venerdì**.

## Riscaldamento — 5-7 minuti
- Marcia sul posto: 1 minuto  
- Circonduzioni delle braccia: 30 secondi  
- Squat senza elastico: 15 ripetizioni  
- Ponte glutei: 15 ripetizioni  
- Aperture dell’elastico leggere: 15 ripetizioni  

## Giorno A
Esegui **3 serie** per esercizio, recuperando 60-90 secondi.

1. **Squat con elastico** — 10-15 ripetizioni  
2. **Rematore con elastico** — 10-15  
3. **Ponte glutei con elastico** — 12-20  
4. **Chest press con elastico** — 10-15  
5. **Plank** — 20-40 secondi  

## Giorno B
1. **Stacco rumeno con elastico** — 10-15  
2. **Shoulder press** — 8-12  
3. **Affondi alternati** — 8-12 per gamba  
4. **Tirate verso il viso** — 12-15  
5. **Dead bug** — 8-12 per lato  

## Giorno C
1. **Squat con pausa di 2 secondi** — 10-15  
2. **Rematore a un braccio** — 10-15 per lato  
3. **Camminata laterale con elastico** — 10-15 passi per lato  
4. **Piegamenti** oppure **spinte in avanti con elastico** — 8-15  
5. **Pallof press** — 10-15 per lato  

### Come progredire
Scegli una resistenza che ti permetta di terminare le serie con tecnica pulita, ma con **2-3 ripetizioni ancora possibili**. Quando raggiungi facilmente il limite alto delle ripetizioni, aumenta la tensione dell’elastico o aggiungi una serie.

Esegui i movimenti lentamente e interrompi l’esercizio se compare dolore acuto, capogiro o fastidio articolare. Qual è il tuo obiettivo principale: **forza, dimagrimento, massa muscolare o preparazione sportiva**?

### conversation-clarify-ambiguous:0:sample-2

Verdicts: candidate, candidate

Reasons: L'atleta ha inviato un messaggio ambiguo ('Quando parte mi si chiude tutto'). L'anchor forte mostra che la risposta ideale è una domanda diagnostica prima di qualsiasi consiglio. Risposta A fornisce tre consigli concreti PRIMA di chiedere chiarimento, violando il principio di scoperta prima del consiglio. La domanda diagnostica è presente ma arriva dopo aver già dato indicazioni, il che riduce il suo valore perché il consiglio potrebbe essere completamente sbagliato. Risposta B invece pone subito la domanda diagnostica senza dare consigli prematuri, rispettando il principio di scoperta. La domanda offre tre opzioni concrete (blocco mentale, perdita percezione, mancanza respiro) che sono diagnosticamente utili. L'aggiunta sulla sicurezza medica è appropriata dato che 'si chiude tutto' potrebbe indicare un problema fisico reale. B è più aderente al principio fondamentale della rubrica: scoperta prima del consiglio. | B è preferibile perché tratta l’ambiguità come il punto centrale e pone subito una domanda diagnostica che può cambiare il consiglio. A riconosce bene il momento di blocco e conclude con una domanda utile, ma anticipa tre consigli prima di capire se il problema sia mentale, respiratorio o fisico, quindi rischia di dare indicazioni non mirate.

Baseline:

Capito: sembra un blocco proprio al momento di iniziare.  

- Prima della partenza, fai un’espirazione lenta di 6–8 secondi.  
- Concentrati solo sul primo gesto tecnico, non su tutta la prestazione.  
- Ripetiti: “Parto piano, poi entro nel ritmo.”  

Quando dici “mi si chiude tutto”, intendi che ti blocchi mentalmente oppure che senti chiusura fisica a petto o gola?

Candidate:

Capisco. Quando dici “si chiude tutto”, intendi che ti blocchi mentalmente, che perdi la percezione di ciò che ti circonda, oppure che ti manca il respiro?

Se ci sono difficoltà respiratorie intense, dolore al petto, vertigini o svenimento, fermati subito e chiedi assistenza medica.

### conversation-clarify-ambiguous:1:sample-2

Verdicts: candidate, baseline

Reasons: Both responses follow a similar pattern: they acknowledge the user's clarification about breathing, provide advice/safety warnings, and end with a diagnostic question. Neither fully aligns with the 'anchor forte' approach of working specifically on exhalation at the start without excessive generic advice. However, Response A is slightly better because it's less verbose and formulaic. Response B provides an overwhelming amount of prescriptive advice (specific breathing timings, 10-15 minute warmup instructions, inhaler references) before asking the diagnostic question, which is premature given that the coach still doesn't know the sport, context, or whether this is medical vs. anxiety-related. Response A is more restrained in its advice-giving and gets to the diagnostic question more quickly. Both fail at 'discovery before advice' since they give substantial advice before fully understanding the situation, but B is worse in this regard due to its length and specificity. The questions at the end are similar in quality - both ask about sport/context and symptoms, which are relevant diagnostic questions. | B è leggermente migliore: usa meglio il dettaglio “appena inizia la gara”, propone una progressione pratica coerente con la partenza e fa una domanda diagnostica utile distinguendo gara vs allenamento e sintomi respiratori. A è prudente e fa una buona domanda, ma resta più generica e meno orientata alla prevenzione del problema nei primi secondi di gara.

Baseline:

Capito: la sensazione di respiro che si “chiude” all’inizio della gara va presa sul serio, perché può dipendere da partenza troppo intensa, ansia o broncocostrizione da sforzo.

- **Se succede:** rallenta o fermati, esci dalla competizione e cerca aria; non forzare il ritmo.  
- **Respira lentamente:** inspira dal naso per 2–3 secondi ed espira a labbra socchiuse per 4–6 secondi.  
- **Prevenzione:** fai un riscaldamento progressivo di 10–15 minuti, evitando uno scatto immediato.  
- **Controllo medico:** se hai sibili, tosse, dolore/oppressione al petto, capogiri o il respiro non migliora rapidamente, interrompi e chiedi assistenza; programma una valutazione medica, soprattutto se si ripete. Usa eventuali farmaci inalatori solo secondo il piano già indicato da un medico.

Succede anche in allenamento o solo nelle gare, e compare con tosse o fischi?

Candidate:

Capito. La sensazione di “non riuscire a respirare” all’inizio della gara non va attribuita automaticamente all’ansia: può dipendere da partenza troppo intensa, respirazione inefficiente, broncospasmo o altro.

Durante la gara:
- riduci subito il ritmo o fermati;
- espira lentamente e più a lungo di quanto inspiri, senza forzare;
- riprendi solo quando il respiro è tornato normale.

Se compaiono **sibili, tosse, oppressione o dolore al petto, capogiri, labbra bluastre**, oppure se succede spesso, interrompi l’attività e fatti valutare da un medico.  
Succede con quale sport e hai anche tosse, sibilo o senso di costrizione al petto?

### conversation-no-ritual-question:0:sample-2

Verdicts: tie, candidate

Reasons: Both responses are nearly identical - they provide a short pre-serve phrase without any discovery questions or contextual exploration. The only difference is the conjunction 'e' in A vs a comma in B, which is negligible. Neither asks about the user's sport level, what they struggle with during service, or what mental state they want to achieve. Both are functional as direct answers to the request (similar to the strong anchor), but neither demonstrates coaching behavior like understanding the athlete's needs before offering advice. They are essentially the same response with trivially different punctuation. | Entrambe rispondono direttamente alla richiesta con una frase breve e pronta, senza aggiungere domande rituali inutili. La B è leggermente preferibile perché la struttura in tre segmenti separati da virgole suona più ritmica e ripetibile come mantra pre-servizio. Nessuna delle due usa il bersaglio o il rilascio del braccio dell'anchor forte, quindi restano un po' generiche.

Baseline:

Respiro, mi concentro e servo con decisione.

Candidate:

Respiro, mi concentro, servo con decisione.

### conversation-no-ritual-question:1:sample-2

Verdicts: tie, baseline

Reasons: Both responses appropriately close the conversation with a brief, natural acknowledgment. The user said 'Perfetta, grazie' indicating satisfaction and closure - neither response forces an unnecessary question or ritual continuation. Both add a contextually relevant well-wish about the serve. They are functionally equivalent in quality, naturalness, and appropriateness. Neither asks a question (which is correct here since the user signaled closure), and both use context minimally but adequately by referencing the serve. | Entrambe rispondono in modo naturale al ringraziamento, senza introdurre domande rituali o consigli non richiesti. A è leggermente più pulita e diretta: chiude bene lo scambio e richiama il contesto del servizio con una formula breve e naturale. B è buona, ma “In bocca al lupo per il servizio” suona appena meno fluida.

Baseline:

Di nulla, buon servizio!

Candidate:

Di nulla! In bocca al lupo per il servizio.

### conversation-known-thread-fact:0:sample-2

Verdicts: candidate, candidate

Reasons: Entrambe le risposte forniscono consigli prima di aver completato la fase di scoperta, ma B è più equilibrata. A offre un piano dettagliato in 4 punti senza aver prima indagato la natura del blocco (tecnico, mentale, situazionale), e la domanda finale è superficiale ('quale parte della routine vuoi provare?') — non diagnostica. B dà un consiglio più contenuto e poi pone una domanda diagnostica genuina che distingue tra paura di sbagliare, pensieri negativi e difficoltà tecnica, il che cambierebbe effettivamente il consiglio successivo. B è anche più naturale e meno formulaica, evitando elenchi puntati eccessivi. Tuttavia, nemmeno B raggiunge l'anchor forte perché offre comunque consigli prima della scoperta completa. | B è preferibile perché, pur dando un consiglio prima di fare scoperta, chiude con una domanda diagnostica che distingue tra paura di sbagliare, pensieri negativi e difficoltà tecnica: la risposta dell’atleta cambierebbe davvero il coaching successivo. A usa bene il contesto della battuta nella pallavolo e offre azioni sensate, ma passa subito a una lista di consigli e la domanda finale è più una scelta di implementazione che una diagnosi del blocco.

Baseline:

È comprensibile: la battuta può sembrare un momento in cui tutta l’attenzione è su di te, ma si può allenare come una routine.

- **Crea una routine di 5 secondi:** espira lentamente, guarda il punto scelto, fai rimbalzare la palla sempre lo stesso numero di volte.
- **Pensa a un solo obiettivo tecnico**, ad esempio: “lancio davanti alla spalla”, non “non devo sbagliare”.
- **Scegli una zona ampia e sicura** del campo: prima cerca continuità, poi precisione.
- **Allenati con pressione graduale:** 10 battute da solo, poi con un compagno che osserva, infine simulando il punteggio reale. Dopo ogni errore ripeti la routine senza commentarti negativamente.

Alla prossima partita, quale parte della routine vuoi provare per prima: respiro, lancio o bersaglio?

Candidate:

È più comune di quanto sembri: spesso il blocco nasce dal tentativo di **non sbagliare**, che fa perdere fluidità al gesto.

Prima della battuta prova questa routine: **espira lentamente, guarda un punto preciso del campo, ripeti una sola parola (“fluida” o “alta”) e pensa solo al lancio della palla**, non al risultato.

Quando ti blocchi, cosa senti soprattutto: **paura di sbagliare, pensieri negativi, oppure difficoltà tecnica nel lancio e nel movimento?**

### conversation-known-thread-fact:1:sample-2

Verdicts: baseline, candidate

Reasons: Both responses provide structured weekly plans that build on the volleyball serving context. However, Response B is superior in several ways: (1) It ends with a diagnostic question about the type of serve (dal basso, flottante, in salto), which is genuinely useful because the advice would differ significantly based on serve type - this is a high-value question, not a ritual one. (2) It progresses more logically from the previous turn's routine suggestion, building on the specific elements already mentioned. (3) Its day-by-day structure is more actionable and concrete. Response A provides a thorough plan but ends with a self-monitoring suggestion without asking any question, missing an opportunity for discovery. Neither response does much discovery before giving advice (both jump straight into plans), but B at least asks a meaningful question at the end that could refine future guidance. Both use the volleyball context well, but B's question about serve type shows deeper sport-specific awareness. | A è leggermente superiore perché usa meglio il contesto già emerso: blocco in battuta, routine pre-battuta, attenzione al lancio, parola chiave e soprattutto misurazione dell’aderenza alla routine invece del solo esito. Progredisce bene dal turno precedente e dà un piano settimanale pratico senza disperdersi. B è valida e include una domanda diagnostica utile sul tipo di battuta, ma arriva dopo un piano già molto definito e in parte meno centrato sul criterio forte: conteggia anche le battute riuscite e struttura la settimana in modo un po’ rigido. A non fa una vera domanda di follow-up, quindi perde sulla qualità della domanda, ma nel complesso è più aderente al bisogno e all’ancora forte.

Baseline:

Questa settimana puoi lavorare sulla battuta con esposizione graduale, senza trasformare ogni errore in un giudizio.

- **Giorno 1 – Routine:** scegli una sequenza fissa: espira, guarda il bersaglio, rimbalza la palla una volta, batti. Ripetila per 15 battute tranquille.
- **Giorno 2 – Precisione semplice:** fai 3 serie da 10 battute verso una zona ampia. Conta quante entrano, senza cercare subito la potenza.
- **Giorno 3 – Pressione controllata:** prima di ogni battuta immagina il punteggio 23-23, poi esegui la routine. Se sbagli, fai un respiro e riparti.
- **Giorno 4 – Allenamento tecnico:** chiedi a un compagno o all’allenatore di osservare solo **un elemento**, per esempio il lancio della palla.
- **Giorno 5 – Simulazione partita:** esegui 10 battute con una conseguenza leggera, come ricominciare la serie dopo due errori consecutivi.
- **Giorno della gara:** usa un’unica frase: **“Routine, bersaglio, esecuzione.”** Non cambiare tecnica all’ultimo momento.

Dopo ogni sessione annota: battute riuscite, livello di tensione da 1 a 10 e cosa ti ha aiutato. Inizia oggi con 15 battute usando sempre la stessa routine e dimmi quale battuta esegui: dal basso, flottante o in salto?

Candidate:

Questa settimana lavora su **fluidità e fiducia**, non sul numero di ace.

### Piano pratico

**Ogni giorno – 5 minuti**
1. Fai 3 respiri lenti, espirando più a lungo.
2. Immagina 3 battute eseguite con calma.
3. Ripeti sempre la stessa routine:  
   **posizione → respiro → sguardo sul bersaglio → lancio → colpo**.
4. Usa una parola chiave: **“fluida”** oppure **“alta”**.

**Primo allenamento**
- 10 battute da distanza ridotta o con obiettivo molto ampio.
- Cerca solo un lancio regolare e un gesto continuo.
- Se sbagli, non ricominciare da capo: fai un respiro e ripeti la routine.

**Secondo allenamento**
- 3 serie da 6 battute.
- Prima serie: campo libero.
- Seconda serie: scegli una zona grande.
- Terza serie: immagina una situazione di partita, ma valuta solo la routine, non il punto.

**A casa o prima dell’allenamento**
- Esegui 10 volte il gesto senza palla, lentamente.
- Poi fai 10 lanci controllati della palla, cercando che ricada sempre nello stesso punto.

### In partita
Prima della battuta pensa a **un solo compito tecnico**, per esempio: “lancio alto e davanti”. Dopo l’errore, evita di analizzarlo subito: respira, ripeti la routine e considera la battuta successiva come un’azione nuova.

A fine allenamento annota da 1 a 10: **quanto eri agitato** e **quanto sei rimasto fedele alla routine**. Il secondo numero è quello su cui puntare questa settimana.

### conversation-identity-correction:0:sample-2

Verdicts: tie, baseline

Reasons: Both responses correctly acknowledge the identity switch to Marta without giving unsolicited advice, and both ask an open-ended question to discover what Marta needs. Response A is slightly more natural and concise ('Ti ascolto: di cosa vuoi parlare oggi?'), while Response B is slightly more explicit in acknowledging the correction ('oggi parlerò con te, non con Paolo') but also slightly more verbose and formulaic ('ricevuto'). The differences are minimal - both avoid premature advice, both use context appropriately, and both open the floor for discovery. Neither asks a particularly high-value diagnostic question, but given the context (a simple identity correction with no topic yet introduced), an open question is appropriate. Overall they are functionally equivalent. | Entrambe recepiscono la correzione d'identità e fanno una domanda aperta invece di dare consigli prematuri. B è preferibile perché esplicita meglio il contesto dell'account condiviso e la correzione: oggi parlerà con Marta, non con Paolo. La domanda resta generale, ma in questo turno è adeguata perché manca ancora il tema sportivo su cui fare coaching.

Baseline:

Ciao Marta, ricevuto: oggi parlerò con te, non con Paolo. Di cosa hai bisogno?

Candidate:

Va bene, Marta. Ti ascolto: di cosa vuoi parlare oggi?

### conversation-identity-correction:1:sample-2

Verdicts: candidate, candidate

Reasons: Entrambe le risposte commettono lo stesso errore fondamentale: danno consigli prima di fare una domanda diagnostica, violando il principio 'scoperta prima del consiglio'. Tuttavia, B è leggermente migliore per la qualità della domanda finale: include non solo aspetti tecnici (tiro, perdita palla) ma anche la dimensione psicologica (giudizio di allenatore e compagni), che è più rilevante per la 'paura di sbagliare'. A pone la domanda alla fine ma dopo aver già dato 4 consigli dettagliati, rendendo la domanda quasi rituale. B è anche leggermente più naturale e meno formulaica nella struttura, con 3 punti invece di 4, risultando meno verbosa. Entrambe usano il nome Marta (A esplicitamente, B implicitamente dal contesto), ma nessuna delle due si avvicina all'anchor forte che avrebbe posto la domanda diagnostica PRIMA di qualsiasi consiglio. | Entrambe anticipano consigli prima di una domanda diagnostica, quindi non seguono bene la logica di scoperta prima del consiglio. A usa esplicitamente il nome Marta e resta nel contesto basket, ma la domanda finale è un po' generica e arriva dopo una lista di soluzioni. B è più naturale e la domanda finale è più ad alto valore perché distingue tra tiro, perdita di palla e giudizio di allenatore/compagni, elementi che cambierebbero davvero il tipo di intervento. Per questo B è leggermente superiore nonostante non usi il nome Marta nel turno.

Baseline:

Capisco, Marta: la paura di sbagliare può bloccarti proprio quando vuoi dare il meglio.

- **Prima dell’azione:** fai un respiro lento e pensa a una sola parola-chiave, come “attacca” o “presente”.
- **Cambia obiettivo:** non “non devo sbagliare”, ma “faccio la scelta giusta e aggressiva”.
- **Dopo un errore:** usa una routine di 3 secondi: riconosci (“errore”), resetta con un respiro, poi concentrati sulla prossima azione.
- **Allenati alla pressione:** durante gli allenamenti chiedi situazioni simulate di partita e valuta l’impegno, non solo il risultato.

In quale situazione senti più paura: tiro, passaggio, palleggio o partita?

Candidate:

La paura di sbagliare è normale, ma non deve guidare la tua prossima azione. Prova così:

- **Prima dell’azione:** respira lentamente e pensa a una sola intenzione: *“Attacco con decisione”* oppure *“Passo semplice e forte”*.
- **Dopo un errore:** dì mentalmente *“È fatta”*, fai un gesto di reset (tocca le mani o guarda un punto) e concentrati sulla prossima difesa.
- **In allenamento:** cerca volontariamente 2–3 azioni coraggiose, anche se non perfette. Devi allenare la decisione, non l’assenza di errori.

In quale momento senti più paura: quando tiri, quando perdi palla o quando temi il giudizio di allenatore e compagni?

### conversation-cross-chat-transparency:0:sample-2

Verdicts: tie, candidate

Reasons: Both responses correctly identify that they cannot access the other chat, refuse to give blind advice, and ask the user to provide context. Both ask for essentially the same information (last message or summary, objective, planned training, physical state). Response B is slightly more natural and concise by combining everything into a single flowing paragraph rather than splitting into two separate blocks, but the difference is minimal. Both align well with the strong anchor. Neither provides premature advice, both ask diagnostic questions that would change the coaching output. The differences are too small to declare a winner. | Entrambe gestiscono bene la trasparenza cross-chat: dichiarano di non poter vedere l'altra conversazione e chiedono informazioni diagnostiche utili prima di dare consigli. B è leggermente più naturale e diretta, con una formulazione fluida che porta subito al passo successivo senza appesantire.

Baseline:

Non posso vedere il contenuto dell’altra chat, quindi mi manca il contesto per dirti cosa fare oggi.

Incolla qui l’ultimo messaggio o riassumi obiettivo, allenamento previsto e stato fisico: ti preparo subito un piano concreto per oggi.

Candidate:

Non posso vedere le conversazioni di un’altra chat. Incollami qui l’ultimo messaggio o un breve riepilogo — obiettivo, allenamento previsto e come stai oggi — e ti dico subito cosa fare.

### conversation-cross-chat-transparency:1:sample-2

Verdicts: candidate, baseline

Reasons: Entrambe le risposte forniscono consigli pratici senza aver prima esplorato il contesto specifico dell'utente (sport, livello, tipo di ansia, cosa era stato discusso nell'altra chat). Tuttavia, B si distingue per una domanda diagnostica concreta e ad alto valore: 'La gara è questa domenica?' — questa domanda cambia radicalmente il consiglio (se la gara è tra 2 giorni vs tra 9 giorni, il piano è molto diverso). A invece chiude con una domanda più rituale ('vuoi che ti costruisca una routine precisa?') che non modifica il consiglio ma mantiene aperta la chat. B è anche più naturale e meno verbosa: riconosce esplicitamente il limite informativo ('non posso ricostruire il piano preciso') e dà consigli più contenuti. A è più prolissa con la struttura a 4 punti dettagliati e il framing motivazionale ('renderla gestibile e trasformarla in preparazione concreta') che suona formulaico. Nessuna delle due eccelle nella scoperta prima del consiglio — entrambe danno consigli immediatamente — ma B almeno pone una domanda che potrebbe cambiare significativamente la direzione. | A usa meglio il contesto appena fornito e fa avanzare la conversazione con indicazioni concrete sull’ansia pre-gara, senza ripetere troppo la mancanza di accesso all’altra chat. La domanda finale è utile ma formulata in modo un po’ presupponente. B è corretto e trasparente, e la domanda sulla domenica può essere diagnostica, ma arriva dopo il consiglio ed è meno progressivo; inoltre ribadisce un limite già chiarito nel turno precedente.

Baseline:

Capito: oggi l’obiettivo non è eliminare l’ansia, ma renderla gestibile e trasformarla in preparazione concreta per domenica.

- **Fai un allenamento normale o leggermente ridotto**, senza testarti né cercare conferme sulla forma.
- **Scrivi per 5 minuti**: “Cosa temo?” e accanto “Cosa posso controllare oggi?”. Scegli solo 1–2 azioni controllabili.
- **Prova una routine pre-gara breve**: 5 respiri lenti, una frase-guida come *“Mi concentro sul prossimo gesto”*, poi visualizza i primi minuti della gara.
- **Stasera prepara il necessario** e stabilisci un orario realistico per dormire: meno decisioni domenica significa meno spazio all’ansia.

Oggi hai allenamento: vuoi che ti costruisca una routine precisa per prima, durante e dopo?

Candidate:

Capito. Non vedo però i dettagli dell’altra chat, quindi non posso ricostruire il piano preciso.

Se la gara è **domenica prossima**, oggi fai così:

- svolgi l’allenamento già programmato, senza aggiungere carichi per “recuperare”;
- dedica 5–10 minuti a respirazione tranquilla e visualizzazione dei primi momenti di gara;
- annota una sola frase-obiettivo controllabile, ad esempio: **“Parto con calma e seguo il mio ritmo”**;
- poi chiudi la giornata senza continuare a controllare mentalmente la gara.

La gara è **questa domenica**?

### conversation-progress-beyond-routine:0:sample-2

Verdicts: candidate, candidate

Reasons: L'atleta dice che la routine non funziona. L'anchor forte mostra che la risposta ideale è una domanda diagnostica prima di qualsiasi consiglio. La Risposta A fornisce quattro consigli dettagliati prima di porre la domanda diagnostica alla fine, violando il principio 'scoperta prima del consiglio'. La domanda finale è buona ma arriva dopo un blocco di suggerimenti non richiesti e non informati dal contesto specifico dell'atleta. La Risposta B invece si trattiene dal dare consigli, inquadra brevemente il problema ('bisogna capire in quale momento si rompe') e poi pone una domanda diagnostica mirata con opzioni concrete. Questo rispetta pienamente il principio di scoperta prima del consiglio, è più naturale conversazionalmente e permette una progressione multi-turn più efficace perché la risposta dell'atleta informerà il consiglio successivo. | B è superiore perché non sostituisce subito la routine con un'altra serie di tecniche: riconosce che il punto chiave è capire dove la routine si rompe e pone una domanda diagnostica che cambierebbe davvero il consiglio successivo. A contiene una buona domanda finale e usa bene il contesto, ma prima offre diversi consigli generici, anticipando la soluzione senza aver capito il momento critico; questo la avvicina all'anchor debole nonostante la chiusura diagnostica.

Baseline:

Capisco: è frustrante quando una routine dovrebbe aiutarti ma finisce per aggiungere pressione.

- **Non cercare di eliminare la paura**: prima della prestazione dì “Posso avere paura e fare comunque la mia azione”.
- **Riduci la routine a 3 secondi**: espira lentamente, guarda un punto preciso, ripeti una sola parola-chiave come *“aggressivo”* o *“fluido”*.
- **Sposta l’obiettivo dal risultato all’azione**: invece di “non sbagliare”, scegli un comportamento controllabile: “attacco il pallone”, “comunico”, “seguo il gesto”.
- **Dopo l’errore, niente analisi immediata**: usa una frase breve — *“finito, prossimo compito”* — e rientra nell’azione successiva.

In quale momento preciso la routine smette di funzionare: **prima dell’azione, durante il gesto o subito dopo un errore**?

Candidate:

Capito. Se la routine non funziona, probabilmente non va modificata solo nei passaggi: bisogna capire **in quale momento si rompe**.

Quando compare la paura dell’errore, cosa succede esattamente: ti blocchi prima di iniziare, pensi troppo durante l’azione, oppure perdi concentrazione subito dopo un errore?

### conversation-progress-beyond-routine:1:sample-2

Verdicts: candidate, candidate

Reasons: Both responses correctly identify the core issue (fear of substitution rather than the error itself) and both suggest talking to the coach. However, Response A is more conversationally natural and better balances discovery with advice. A's closing question ('Ti ha già tolto davvero dopo errori simili, oppure è soprattutto una paura che anticipi?') is a genuinely diagnostic question that could change the direction of coaching - if the fear is unfounded vs. based on real experience, the approach would differ significantly. Response B's closing question ('Qual è la cosa più probabile che il coach voglia vedere...') is more of a leading/rhetorical question with pre-supplied options, which feels more like a ritual question than a true discovery question. Response B also falls into the bullet-point list format again, which feels formulaic and less like a natural coaching conversation. Response A integrates its suggestions more fluidly into the dialogue and maintains better conversational flow. Both give advice before fully exploring, but A does slightly better by keeping the advice more concise and ending with a truly open diagnostic question. | A coglie con precisione che il nodo è la paura della sostituzione e non la routine in sé, propone un aggiustamento centrato sul controllo della giocata successiva e una conversazione utile col coach. La domanda finale è diagnostica: sapere se il coach lo ha già tolto davvero o se è una previsione cambia il tipo di intervento. B è solida e molto pratica, ma la domanda finale è più orientata a scegliere un comportamento tra opzioni già suggerite che a capire la radice del timore; quindi guida meno la diagnosi.

Baseline:

Capisco: il problema non è solo l’errore, ma la paura immediata delle conseguenze e di perdere il posto.

- **Separa fatto e previsione**: dopo l’errore, chiediti: “Il coach mi ha davvero detto che mi toglierà, oppure lo sto immaginando?”. Non discutere con il pensiero: riconoscilo come una previsione.
- **Usa una risposta breve**: *“Un errore non decide il mio cambio. Ora mostro la prossima azione.”*
- **Dai al coach un segnale visibile**: dopo l’errore comunica, rientra subito in posizione e fai un’azione semplice e corretta. Mostri reazione, non perfezione.
- **Parlane fuori dalla gara**: chiedigli con calma: “Dopo un errore, quale comportamento vuoi vedere da me? In quali situazioni mi sostituisci?”. Avere criteri reali riduce le supposizioni.

Qual è la cosa più probabile che il coach voglia vedere da te subito dopo un errore: **comunicazione, impegno difensivo o una giocata semplice**?

Candidate:

Quindi il problema non è solo **sbagliare**: è la conseguenza che immagini dopo l’errore — *“mi toglierà”*. In quel momento la routine non deve convincerti che l’errore non conta, ma riportarti rapidamente a ciò che puoi controllare.

Prova questa versione, molto breve:

1. **Riconosci:** “Ho sbagliato.”
2. **Ridimensiona:** “Un errore non decide da solo il mio posto.”
3. **Azione immediata:** scegli un compito concreto per la giocata successiva: *marcare, chiamare, muovere i piedi, chiedere palla*.
4. **Frase-ancora:** “Resto utile nella prossima azione.”

E sarebbe importante parlarne con il coach fuori dal momento della gara: *“Quando sbaglio temo di essere sostituito e questo mi fa giocare contratto. Qual è il comportamento che vuoi vedere da me dopo un errore?”*

Ti ha già tolto davvero dopo errori simili, oppure è soprattutto una paura che anticipi?

### conversation-gradual-specialization:0:sample-2

Verdicts: candidate, candidate

Reasons: Response A prioritizes discovery before advice, offering a brief empathetic acknowledgment and then asking a high-quality diagnostic question that would genuinely change the direction of coaching. Response B gives four concrete tips before asking a question, which mirrors the weak anchor pattern of offering advice before understanding the situation. While B does include a question at the end, it comes after substantial prescriptive content, undermining the discovery-first principle. A's question is also slightly more nuanced, offering multiple specific scenarios that help the athlete pinpoint the trigger. B's question is decent but comes too late after unsolicited advice. | A rispetta meglio l'approfondimento graduale: normalizza brevemente il problema e pone subito una domanda diagnostica che può cambiare l'intervento. B offre consigli potenzialmente utili ma prematuri e generici prima di capire quando e come cala la fiducia; la domanda finale è pertinente, ma arriva dopo una lista di soluzioni standard.

Baseline:

È comune: in gara la fiducia può oscillare, ma puoi allenare il modo in cui reagisci.

- **Scegli una parola chiave**: “aggressivo”, “calmo” o “presente”, da ripetere dopo ogni errore.
- **Riduci l’attenzione all’azione successiva**: chiediti “Qual è il prossimo gesto concreto?” invece di valutare la prestazione.
- **Usa una routine di reset di 5 secondi**: espira lentamente, rilassa le spalle, guarda un punto preciso e riparti.
- **Prepara una frase realistica**: “Non devo sentirmi sicuro per agire bene; devo eseguire il prossimo compito.”

In quale momento perdi più fiducia: dopo un errore, quando vai sotto nel punteggio o prima di iniziare?

Candidate:

Capita spesso: in gara la fiducia può calare non perché ti manchi la tecnica, ma perché inizi a giudicare ogni gesto o temi l’errore.

Per capire come aiutarti: **in quale momento perdi fiducia—prima della gara, dopo un errore, quando l’avversario mette pressione, o quando senti di non essere al tuo livello?**

### conversation-gradual-specialization:1:sample-2

Verdicts: candidate, candidate

Reasons: Both responses use the context well (two consecutive errors in the final) and provide actionable advice. However, B is superior in several ways: (1) B's question ('Qual è il tuo sport?') is a high-value diagnostic question that would genuinely change the advice—it's not ritual but functional, as knowing the sport allows sport-specific adaptation. A's question ('Qual è una frase breve...') is more of a coaching exercise than a diagnostic question. (2) B provides a brief psychological insight ('il significato che dai agli errori') and the key reframe ('la fiducia torna dopo una buona esecuzione'), which shows deeper understanding. (3) B's structure is cleaner and more natural, with the numbered reset being concise and immediately actionable. A is solid but slightly more formulaic with its bullet-point list and the closing question doesn't advance the diagnostic process as effectively. | B è leggermente migliore perché usa bene l’informazione emersa, dà un reset concreto adatto al finale dopo errori consecutivi e poi pone una domanda diagnostica ad alto valore: conoscere lo sport cambierebbe davvero il compito tecnico e la routine. A è solida e contestualizzata, ma ripete molto consigli già dati nella conversazione precedente e la domanda finale è più un esercizio di formulazione che una scoperta capace di modificare il coaching.

Baseline:

Capisco: due errori consecutivi nel finale possono trasformarsi rapidamente in paura del terzo.

- **Dopo il secondo errore, attiva una routine fissa**: espira, abbassa le spalle, guarda un punto e dì mentalmente: *“Reset. Una giocata.”*
- **Non cercare di recuperare subito**: scegli l’opzione più semplice e ad alta percentuale nella giocata successiva.
- **Usa un solo obiettivo tecnico**: ad esempio “gambe attive”, “occhi sulla palla” o “gesto completo”. Non correggere tutto insieme.
- **Allenalo sotto pressione**: in allenamento crea situazioni di finale e imponiti la routine dopo due errori consecutivi.

Qual è una frase breve e concreta che potresti usare come comando dopo il secondo errore?

Candidate:

Dopo due errori consecutivi il problema diventa spesso **il significato che dai agli errori**: “sta andando male”, soprattutto nel finale. Ti serve una routine breve per interrompere la spirale.

**Reset in 5 secondi:**
1. Espira lentamente.
2. Di’ mentalmente: **“È finita. Prossima azione.”**
3. Scegli un solo compito tecnico: ad esempio *“gambe attive”* o *“guardo il bersaglio”*.
4. Punta a un’azione semplice e aggressiva, non perfetta.

Nel finale non cercare di “recuperare la fiducia” prima di agire: **la fiducia torna dopo una buona esecuzione**. Allenati simulando finali e imponendo il reset dopo due errori.

Qual è il tuo sport? Così adatto la routine al gesto specifico.

### conversation-discovery-age:0:sample-3

Verdicts: candidate, candidate

Reasons: L'atleta non ha fornito informazioni fondamentali (età, livello, sport, esperienza, frequenza attuale). La Risposta B riconosce correttamente che non si può prescrivere un carico intenso senza queste informazioni e pone domande diagnostiche essenziali prima di dare qualsiasi programma. La Risposta A invece fornisce un intero programma dettagliato senza conoscere nulla dell'atleta - età, sport, livello, storia di infortuni - il che è potenzialmente pericoloso e dimostra scarsa pratica di coaching. Anche se A aggiunge domande alla fine, il danno è fatto: ha già prescritto sprint, burpees e squat jump a qualcuno che potrebbe essere un adolescente sedentario o un anziano. B è concisa, diretta, e le domande sono ad alto valore diagnostico (sport, livello, giorni disponibili, dolori) che cambieranno radicalmente il programma risultante. | B è nettamente migliore perché rimanda la prescrizione del carico e chiede informazioni diagnostiche rilevanti prima di proporre un allenamento intenso. A è naturale e include avvertenze, ma prescrive subito una sessione molto impegnativa senza conoscere età, livello, frequenza attuale o condizioni fisiche, quindi non rispetta la necessità di discovery iniziale.

Baseline:

Capisco: vuoi un allenamento impegnativo e orientato a risultati rapidi, ma l’intensità deve essere controllata per evitare infortuni.

**Sessione intensa da 45–50 minuti** *(adatta il ritmo al tuo livello)*

- **Riscaldamento – 10 min:** corsa leggera, mobilità di anche/spalle/caviglie, 3 accelerazioni progressive da 20 m.
- **Circuito forza – 4 giri:**  
  - 12 squat o squat jump  
  - 10–15 piegamenti  
  - 10 affondi per gamba  
  - 8–12 trazioni o rematore con elastico  
  - 30–40 secondi plank  
  Recupera 90 secondi tra i giri.
- **Intervalli – 8 ripetute:** 20 secondi sprint o massimo ritmo controllato + 70 secondi camminata/lento.
- **Finisher – 3 giri:** 30 secondi burpees, 30 secondi mountain climber, 30 secondi recupero.
- **Defaticamento – 5 min:** camminata e mobilità leggera.

Fallo **2 volte a settimana**, lasciando almeno 48 ore di recupero; negli altri giorni cura tecnica, mobilità e lavoro aerobico leggero. Interrompi se compare dolore acuto, capogiro o difficoltà respiratoria insolita.

Qual è il tuo sport, il tuo livello attuale e quali attrezzi hai?

Candidate:

Posso preparartelo, ma per renderlo **intenso senza aumentare inutilmente il rischio di infortunio** mi servono: **sport/disciplina, livello attuale, giorni disponibili e eventuali dolori o problemi fisici**.

Per quale sport vuoi migliorare e qual è il tuo livello?

### conversation-discovery-age:1:sample-3

Verdicts: candidate, candidate

Reasons: Response B correctly integrates the new context (age 15, 1 year experience, 2x/week) while continuing the discovery process by asking the critical missing piece (sport). It avoids giving a full program before knowing the sport, which is the right coaching approach. Response A provides a full program despite still not knowing the sport - this is premature advice-giving. While A does ask about sport at the end, it already delivered a complete training plan without that crucial information. B demonstrates better discovery-before-advice discipline, uses the context appropriately to set expectations about intensity, and maintains natural conversational flow without being verbose. The anchor forte aligns more with B's approach of calibrating without jumping to a full prescription. | B è preferibile perché, dato che manca ancora lo sport, evita di prescrivere un carico generico prima di un’informazione che cambia davvero il consiglio. A usa molto bene età, esperienza e frequenza, ed è prudente, ma anticipa comunque una struttura di allenamento non specifica per un atleta di 15 anni con sport ignoto. La domanda di A è buona, ma arriva dopo un piano; B mantiene meglio la scoperta prima del consiglio.

Baseline:

A 15 anni, con un solo anno di esperienza e due allenamenti settimanali, è meglio puntare su progressione e tecnica: allenarsi “al massimo” troppo presto aumenta il rischio di sovraccarico.

Per ora usa questa struttura **2 volte a settimana**, lasciando almeno 48 ore tra le sessioni:

- **Riscaldamento – 10 minuti:** corsa leggera, mobilità e movimenti specifici del tuo sport.
- **Tecnica – 15 minuti:** esercizi fondamentali eseguiti lentamente e bene, con recuperi completi.
- **Forza generale – 3 giri:** 8–12 squat, 6–10 piegamenti adattati al tuo livello, 8 affondi per gamba, 20–30 secondi di plank. Nessun peso pesante e mai fino al cedimento.
- **Condizionamento – 6 ripetute:** 20 secondi a ritmo intenso ma controllato + 90 secondi di recupero.
- **Defaticamento – 5 minuti:** camminata e mobilità leggera.

Aumenta il volume solo quando completi tutto mantenendo una buona tecnica e senza dolori. Parlane con il tuo allenatore o con un adulto, soprattutto prima di inserire sprint, salti o pesi.

Qual è il tuo sport e in quale ruolo o specialità gareggi?

Candidate:

Per prepararti un allenamento davvero adatto mi manca ancora una cosa: **che sport pratichi?**  
L’intensità dovrà essere progressiva: a 15 anni, “molto intenso” non significa allenarsi fino allo sfinimento, ma lavorare bene con tecnica e recuperi adeguati.

### conversation-discovery-food:0:sample-3

Verdicts: baseline, baseline

Reasons: Entrambe le risposte adottano correttamente un approccio di scoperta prima del consiglio, ponendo domande diagnostiche pertinenti. La risposta B è leggermente superiore per diversi motivi: 1) Include la domanda sugli orari degli allenamenti, che è cruciale per la pianificazione nutrizionale (timing dei pasti pre/post workout); 2) Aggiunge una domanda sullo stile alimentare preferito (mediterraneo), che è una domanda diagnostica concreta che cambierebbe il piano; 3) Il tono è leggermente più naturale e conversazionale, con la formulazione 'Indicami anche... se vuoi' che rende opzionali i dati sensibili in modo più fluido. La risposta A è comunque buona ma manca la domanda sugli orari e non offre spunti concreti di stile alimentare. | Entrambe evitano di inventare subito un menu e fanno discovery utile. B è preferibile perché include giorni e orari degli allenamenti, informazione diagnostica fondamentale per distribuire pasti e spuntini pre/post workout, e aggiunge una preferenza pratica sullo stile del menu. A copre sport, frequenza, obiettivo e vincoli alimentari, ma manca il timing degli allenamenti, quindi raccoglie dati meno direttamente utilizzabili per costruire un menu settimanale sensato.

Baseline:

Certo: per preparare un menu davvero adatto ai tuoi allenamenti mi servono alcune informazioni.

- Che sport pratichi e quante volte ti alleni?
- In quali giorni e orari ti alleni?
- Obiettivo: energia e prestazione, dimagrimento, aumento massa o mantenimento?
- Hai allergie, intolleranze o alimenti che eviti?

Indicami anche età, altezza e peso se vuoi un piano più preciso; preferisci un menu semplice in stile mediterraneo?

Candidate:

Certo. Per prepararti un menu settimanale adatto agli allenamenti, dimmi:

- quale sport pratichi e quante volte ti alleni;
- obiettivo: energia, dimagrimento, aumento massa o mantenimento;
- eventuali allergie, intolleranze o preferenze alimentari;
- età e, se vuoi, sesso, altezza e peso.

Con queste informazioni ti organizzo colazione, pasti, spuntini e cosa mangiare prima/dopo l’allenamento.

### conversation-discovery-food:1:sample-3

Verdicts: candidate, candidate

Reasons: Response A correctly identifies that critical information is still missing (sport type, frequency, objective, and whether the athlete is lacto-ovo or fully vegan) and asks targeted diagnostic questions before providing advice. These questions would materially change the menu plan. Response B jumps to a full detailed menu despite not knowing the sport, training frequency, objective, or even whether the person eats eggs/dairy - all of which would significantly alter the recommendations. While B does ask about the objective at the end, it's an afterthought following a massive plan that may be entirely wrong. B's approach violates the discovery-before-advice principle. A demonstrates better coaching practice by gathering essential information first, uses the provided context (vegetarian + 19:00 training) to frame its follow-up questions, and progresses the conversation naturally without ritualistic filler. | A usa bene le nuove informazioni, continua la scoperta con domande davvero diagnostiche e necessarie prima di costruire il menu: tipo di vegetarianismo, sport, frequenza e obiettivo cambiano concretamente pasti, porzioni e fonti proteiche. B sfrutta il contesto vegetariana/allenamento alle 19 e produce un menu ordinato, ma salta la fase di discovery nonostante manchino dati chiave già richiesti; la domanda sull’obiettivo arriva solo dopo un piano molto dettagliato e basato su assunzioni, inclusi uova/latticini senza verificarli.

Baseline:

Perfetto: ecco un **menu vegetariano settimanale** pensato per allenamenti alle 19:00. Le porzioni vanno adattate a età, corporatura, obiettivo e intensità; se hai patologie o esigenze specifiche, confrontati con un dietista.

### Schema orario
- **Colazione:** carboidrati + proteine.
- **Pranzo:** cereali + legumi/uova/latticini + verdure.
- **17:00–17:30, pre-allenamento:** spuntino leggero, ricco di carboidrati e povero di grassi.
- **20:30 circa, post-allenamento:** cena con proteine, carboidrati e verdure.

### Menu settimanale

| Giorno | Colazione | Pranzo | Pre-allenamento | Cena post-allenamento |
|---|---|---|---|---|
| **Lunedì** | Yogurt greco, avena, banana e noci | Pasta integrale al pomodoro + lenticchie + insalata | Banana e 2–3 gallette | Riso basmati, tofu saltato e verdure |
| **Martedì** | Pane integrale, ricotta e miele + frutta | Cous cous con ceci, verdure e feta | Pane con marmellata | Frittata di 2–3 uova, patate e verdure |
| **Mercoledì** | Porridge con latte o bevanda di soia, mela e semi | Farro con cannellini, pomodorini e rucola | Yogurt e frutta | Pasta con pesto leggero + mozzarella o fiocchi di latte |
| **Giovedì** | Yogurt, muesli e frutti di bosco | Riso integrale con tofu o tempeh e verdure | Banana o pane tostato | Zuppa di legumi + pane integrale + verdure |
| **Venerdì** | Pane integrale, burro d’arachidi e banana | Pasta e ceci + verdure | 2–3 gallette con miele | Seitan, patate o pane e verdure grigliate |
| **Sabato** | Pancake d’avena con yogurt e frutta | Insalata di quinoa, uova, mais e verdure | Frutta + yogurt | Pizza vegetariana, preferibilmente con verdure e una fonte proteica |
| **Domenica** | Latte o bevanda di soia, pane e crema 100% frutta secca | Lasagna o pasta al forno vegetariana + insalata | Frutta e qualche cracker | Burger di legumi, pane, patate e verdure |

- Bevi regolarmente durante la giornata; durante l’allenamento porta acqua.
- Se senti pesantezza, riduci fibre e grassi nello spuntino delle 17:00.
- Per aumentare le proteine, alterna **legumi, tofu/tempeh, seitan, uova, yogurt greco, ricotta e formaggi freschi**.
- Se sei **vegana**, sostituisci latticini e uova con tofu, tempeh, legumi e bevande/yogurt di soia fortificati.

Il tuo obiettivo è **dimagrire, mantenere il peso o aumentare forza e massa muscolare**?

Candidate:

Perfetto: preparo il piano considerando allenamento alle 19:00 e alimentazione vegetariana. Per renderlo davvero adatto, mi serve ancora sapere **che sport pratichi, quante volte a settimana e qual è il tuo obiettivo** (energia, dimagrimento, aumento massa o mantenimento).

Sei vegetariana **latto-ovo** (mangi uova, latte e derivati) oppure li eviti?

### conversation-discovery-home:0:sample-3

Verdicts: candidate, candidate

Reasons: La risposta B segue il principio fondamentale del coaching: scoperta prima del consiglio. Pone domande diagnostiche (obiettivo e attrezzatura) che cambieranno radicalmente la scheda proposta. La risposta A fornisce immediatamente una scheda generica senza conoscere nulla dell'utente (obiettivo, livello, attrezzatura, limitazioni, sport praticato), violando il principio di discovery. Anche se A chiede alla fine se vuole adattarla, il danno è fatto: ha già dato un consiglio generico che potrebbe essere inadatto. B è concisa, diretta e pone domande ad alto valore diagnostico senza verbosità rituale. | B è preferibile perché nel contesto di discovery evita di prescrivere subito una scheda generica e fa domande diagnostiche che cambiano davvero il programma: obiettivo e attrezzatura disponibile. A è utile e ben strutturata, ma parte con un piano standard senza verificare elementi essenziali come obiettivo, livello, attrezzatura, frequenza o eventuali limitazioni; la domanda arriva solo alla fine, dopo il consiglio.

Baseline:

Certo: ti propongo una scheda generale da fare a casa, senza attrezzi, utile per forza e condizionamento.

**Riscaldamento – 5 minuti**
- 30” marcia o corsetta sul posto  
- 30” jumping jack leggeri  
- 10 squat lenti  
- 10 circonduzioni delle braccia  
- 20” plank  

**Circuito – 3 giri**
- 12 squat  
- 8–12 piegamenti sulle braccia — anche sulle ginocchia  
- 10 affondi per gamba  
- 12 ponte glutei  
- 20–30” plank  
- 30” recupero tra gli esercizi e 2’ tra i giri  

**Defaticamento – 3 minuti**
Respirazione lenta e stretching leggero per gambe, petto e schiena.

Allenati **2–3 volte a settimana**, lasciando almeno un giorno di recupero. Interrompi se senti dolore, vertigini o difficoltà respiratorie. Vuoi che te la adatti al tuo sport, al tuo obiettivo e al materiale che hai in casa?

Candidate:

Certo. Per fartela davvero adatta a te: qual è il tuo obiettivo principale—**forza, massa muscolare, dimagrimento, atletica o preparazione per uno sport**—e che attrezzatura hai a casa?

### conversation-discovery-home:1:sample-3

Verdicts: baseline, baseline

Reasons: Both responses provide a full 3-day program using elastics, which directly uses the context provided by the user. However, neither does much discovery before giving advice - both jump straight into a full program. Response B is slightly better because: 1) It ends with a targeted question asking about the user's goal (dimagrimento, forza, or sport), which is a meaningful diagnostic question that could change the programming. Response A provides no follow-up question at all. 2) Response B shows better multi-turn progression by acknowledging the previous interaction and building on it naturally. 3) Response B includes a safety note about checking elastics for damage, which is practical. 4) Response B's structure (gambe/spinta, schiena/catena posteriore, total body) is slightly more thoughtful as a split. Both responses fail at discovery - they should have asked about the user's training level, goals, and time available per session before prescribing a full program. But B at least asks afterward, while A just delivers and stops. The anchor forte suggests alternating push/pull/legs which both responses approximate, but B's closing question aligns with the coaching approach of continuing to refine. | B è preferibile perché usa meglio il nuovo contesto: elastici, tre giorni non consecutivi, struttura più chiara per gruppi muscolari e attenzione pratica alla sicurezza degli elastici. Inoltre pone una domanda diagnostica finale su dimagrimento, forza o sport, che potrebbe cambiare davvero la scheda. Tuttavia anche B dà molta scheda prima di completare la scoperta: mancano ancora obiettivo, livello, eventuali dolori/infortuni e durata disponibile. A produce una scheda utilizzabile e coerente con elastici e tre giorni, ma assume l’obiettivo “forza e tono muscolare” senza verificarlo e non fa alcuna domanda di follow-up, quindi è più debole nella discovery.

Baseline:

Perfetto: con gli elastici puoi fare una scheda completa in **3 giorni non consecutivi**, ad esempio lunedì–mercoledì–venerdì.

### Riscaldamento — 5 minuti
- Marcia o corsetta sul posto: 1’
- Squat a corpo libero: 15
- Circonduzioni delle braccia: 20
- Ponte glutei: 15
- Plank: 20”

## Giorno A — Gambe e spinta
Esegui **3 serie**, recuperando 60–90”:
- Squat con elastico: 12–15
- Affondi indietro: 10 per gamba
- Chest press con elastico dietro la schiena: 10–15
- Shoulder press: 10–12
- Ponte glutei con elastico sopra le ginocchia: 15–20
- Plank: 25–40”

## Giorno B — Schiena e catena posteriore
- Stacco rumeno con elastico: 12–15
- Rematore con elastico: 12–15
- Camminata laterale con elastico: 12 passi per lato
- Tirate al viso, se puoi fissare l’elastico in sicurezza: 12–15  
  *In alternativa: aperture con elastico davanti al petto*
- Bird dog: 10 per lato
- Side plank: 20–30” per lato

## Giorno C — Total body
- Squat + shoulder press: 10–12
- Stacco rumeno: 12
- Rematore: 12–15
- Affondi alternati: 10 per gamba
- Push-up, anche sulle ginocchia: 8–12
- Mountain climber lento: 20–30”

**Regole:** scegli una resistenza che renda impegnative le ultime 2–3 ripetizioni senza perdere la tecnica; aumenta gradualmente tensione o ripetizioni. Controlla sempre che l’elastico non sia danneggiato e non fissarlo a oggetti instabili.

Vuoi che la renda più orientata a **dimagrimento, forza o prestazione nel tuo sport**?

Candidate:

Certo. Ecco una **scheda full body di 3 giorni**, pensata per forza e tono muscolare usando solo elastici. Lascia almeno un giorno di recupero tra le sessioni, ad esempio **lunedì–mercoledì–venerdì**.

## Riscaldamento — 5 minuti
- Marcia o corsetta sul posto: 1 minuto  
- Circonduzioni delle braccia: 30 secondi  
- Squat senza elastico: 15  
- Ponte glutei: 15  
- Mobilità di anche e spalle: 2 minuti  

## Giorno A
1. **Squat con elastico** — 3×10–15  
2. **Rematore con elastico** — 3×10–15  
3. **Piegamenti** oppure chest press con elastico — 3×8–12  
4. **Affondi indietro** — 3×8–12 per gamba  
5. **Shoulder press** — 3×10–15  
6. **Plank** — 3×20–40 secondi  

## Giorno B
1. **Stacco rumeno con elastico** — 3×10–15  
2. **Lat pull-down con elastico** — 3×10–15  
3. **Glute bridge con elastico** — 3×12–20  
4. **Curl bicipiti** — 3×10–15  
5. **Estensioni tricipiti** — 3×10–15  
6. **Dead bug** — 3×8–12 per lato  

## Giorno C
1. **Squat con pausa di 2 secondi** — 3×10–15  
2. **Rematore a un braccio** — 3×10–15 per lato  
3. **Affondo statico** — 3×8–12 per gamba  
4. **Alzate laterali** — 3×12–20  
5. **Face pull** — 3×12–20  
6. **Plank laterale** — 3×20–30 secondi per lato  

### Recupero e progressione
- Recupera **60–90 secondi** tra le serie.  
- Scegli una resistenza che renda impegnanti le ultime 2–3 ripetizioni, senza perdere la tecnica.  
- Quando raggiungi facilmente il numero massimo di ripetizioni, aumenta la tensione dell’elastico o aggiungi una serie.  
- Movimento controllato: circa **2 secondi per salire e 2 per scendere**.  
- Interrompi l’esercizio se compare dolore acuto, vertigine o difficoltà respiratoria insolita.

### conversation-clarify-ambiguous:0:sample-3

Verdicts: candidate, candidate

Reasons: L'atleta ha inviato un messaggio ambiguo ('Quando parte mi si chiude tutto') che richiede chiarimento prima di qualsiasi intervento. La Risposta A fa esattamente questo: pone una domanda diagnostica chiara per distinguere tra blocco respiratorio/fisico e blocco mentale/muscolare, senza dare consigli prematuri. La domanda è ad alto valore perché la risposta cambierebbe radicalmente l'approccio di coaching. La Risposta B invece fornisce subito 4 consigli pratici (respirazione, focus, partire al 90%, annotare) PRIMA di aver capito cosa intende l'atleta. La domanda di chiarimento viene posta solo alla fine, dopo aver già dato indicazioni che potrebbero essere irrilevanti. Questo viola il principio fondamentale della scoperta prima del consiglio. La Risposta B è anche più verbosa e formulaica con i bullet points strutturati. | A gestisce correttamente l’ambiguità: prima chiarisce se il blocco riguarda respiro/gola/petto o aspetti mentali e muscolari, quindi pone una domanda diagnostica che cambierebbe davvero il consiglio. La nota di sicurezza è pertinente, anche se un po’ formale. B è comprensibile e include una buona domanda finale, ma dà subito diverse indicazioni pratiche prima di sapere cosa significhi “mi si chiude tutto”, quindi rischia di consigliare nel vuoto.

Baseline:

Capisco: all’inizio la tensione può farti “chiudere” corpo e mente.

- Prima di partire, espira lentamente per 6–8 secondi, per 3 volte.
- Scegli un solo focus semplice: **“respiro”**, **“ritmo”** o **“primo gesto”**.
- Parti al 90%, senza cercare subito la prestazione perfetta; lascia che il corpo entri gradualmente nel ritmo.
- Dopo, annota quando esattamente ti blocchi: prima del via, nei primi secondi o quando senti pressione.

Quando dici “mi si chiude tutto”, intendi soprattutto il respiro, i muscoli o la mente?

Candidate:

Capisco. Quando dici “mi si chiude tutto”, intendi **il respiro/gola/petto** oppure senti un **blocco mentale e muscolare** appena inizi?

Se ti sta succedendo adesso con forte difficoltà respiratoria, dolore al petto, sibilo, capogiri o sensazione di svenimento, fermati e chiedi subito assistenza medica.

### conversation-clarify-ambiguous:1:sample-3

Verdicts: candidate, baseline

Reasons: Both responses acknowledge the athlete's clarification about breathing and both ask a diagnostic question (training vs. competition). However, Response A prioritizes discovery before advice: it holds back on detailed prescriptions, flags the medical concern appropriately, and then asks a high-value diagnostic question that would genuinely change the next recommendation. Response B jumps into a full protocol of advice (warm-up, breathing technique, pacing strategy) before asking the diagnostic question, which undermines the discovery-before-advice principle. The rubric explicitly states 'una domanda diagnostica cambia il consiglio' and penalizes giving advice before understanding the situation. Response A is more aligned with the anchor forte approach of identifying the issue and working on it, while B is verbose and prescriptive prematurely. Response A is more conversationally natural and appropriately restrained. | B usa meglio il chiarimento dell’utente, combina cautela medica con indicazioni pratiche pertinenti per i primi secondi di gara e pone una domanda diagnostica più completa che può cambiare il consiglio. A è molto sicura e la domanda è buona, ma resta soprattutto su stop/medico e progredisce meno sul piano del coaching sportivo.

Baseline:

Capisco: il respiro che si blocca appena parte la gara può dipendere dalla tensione, ma anche da una risposta respiratoria da sforzo, quindi va preso sul serio.

- Fai un **riscaldamento progressivo di 10–15 minuti**, con qualche breve accelerazione, invece di partire bruscamente.
- Prima del via: inspira normalmente dal naso o dalla bocca ed espira più a lungo, senza fare grandi inspirazioni forzate; pensa a **“espira e ritmo controllato”**.
- Nei primi 30–60 secondi parti leggermente sotto il massimo, mantenendo spalle e mascella rilassate.
- Se compaiono affanno intenso, sibili, dolore al petto, capogiri o non riesci a parlare, **fermati e chiedi assistenza**; se succede spesso, parlane con un medico prima di gareggiare.

Ti succede anche durante gli allenamenti o solo in gara, e avverti sibili o senso di costrizione al petto?

Candidate:

Capito. **Non forzare né cercare di “superarlo”**: la difficoltà respiratoria all’inizio della gara può avere cause fisiche, come broncocostrizione da esercizio, oltre a tensione o panico.

Se succede durante la gara: rallenta o fermati, avvisa l’allenatore e recupera in un luogo tranquillo. Se compaiono forte oppressione o dolore al petto, sibilo, labbra bluastre, capogiri o sensazione di svenimento, chiama subito i soccorsi. Poiché si ripete, parlane con un medico prima di gareggiare di nuovo.

Una domanda importante: **succede anche negli allenamenti o solo nelle gare?**

### conversation-no-ritual-question:0:sample-3

Verdicts: tie, candidate

Reasons: Both responses are nearly identical - they provide a short pre-serve phrase without any discovery questions or contextual exploration. Neither asks about the user's sport level, type of serve issues, or what mental state they want to achieve. Both are functionally equivalent to the strong anchor (direct phrase delivery), though slightly less specific than the anchor's 'guardo il bersaglio, lascio andare il braccio' which has more actionable imagery. Neither response attempts multi-turn progression or uses any context beyond the literal request. The only difference is 'mi concentro' vs 'mi focalizzo' which is negligible. | Entrambe rispondono direttamente alla richiesta con una frase breve e utilizzabile prima del servizio, senza aggiungere domande rituali o verbosità. A è leggermente preferibile perché “mi concentro” suona più naturale e immediato in italiano rispetto a “mi focalizzo”, mantenendo la stessa funzione pratica.

Baseline:

Respiro, mi focalizzo e servo con decisione.

Candidate:

“Respiro, mi concentro e servo con decisione.”

### conversation-no-ritual-question:1:sample-3

Verdicts: baseline, baseline

Reasons: Both responses appropriately acknowledge the user's gratitude without forcing a ritual question. Response B adds a small contextual reinforcement about how to use the phrase ('entrare nel punto con calma e convinzione'), which shows slightly better use of context and provides a micro-coaching nudge that adds value without being verbose or formulaic. Response A is pleasant but adds nothing beyond a generic well-wish. Neither asks a question, which is appropriate here since the user signaled closure. However, B demonstrates slightly better coaching progression by reinforcing the application of the phrase. | Entrambe rispondono in modo naturale e senza domande rituali. A è un’ottima chiusura semplice, ma B usa meglio il contesto della frase appena proposta e aggiunge un’indicazione breve e pertinente su come impiegarla, senza diventare verbosa.

Baseline:

Di nulla! Usala per entrare nel punto con calma e convinzione.

Candidate:

Di nulla! In bocca al lupo per il servizio.

### conversation-known-thread-fact:0:sample-3

Verdicts: candidate, candidate

Reasons: Entrambe le risposte commettono l'errore di dare consigli prima di aver fatto una vera scoperta diagnostica, ma A è leggermente migliore. A fornisce meno consigli (una mini-routine più breve) e poi pone una domanda diagnostica più mirata ('paura di mandare la palla fuori/rete oppure ti irrigidisci fisicamente') che distingue tra componente cognitiva e fisica del blocco. B invece fornisce un elenco molto più lungo e dettagliato di consigli (4 punti strutturati con dettagli specifici) prima di porre la domanda finale, che è più generica e a scelta multipla ('il lancio, il momento prima di colpire o la paura di sbagliare'). La domanda di A è più diagnostica perché differenzia tra due dimensioni diverse (mentale vs fisica), mentre quella di B è più una checklist. Inoltre, la verbosità di B riduce la naturalezza conversazionale e viola maggiormente il principio di scoperta prima del consiglio. Nessuna delle due si avvicina all'anchor forte che pone subito una domanda diagnostica senza dare consigli. | Entrambe usano bene il contesto della battuta e chiudono con una domanda diagnostica reale. A è più concisa e lascia più spazio alla scoperta, con una domanda che distingue paura dell’errore da irrigidimento fisico, quindi può cambiare il consiglio successivo. B ha ottimi contenuti e una domanda molto pertinente su lancio, colpo e paura, ma anticipa molte soluzioni prima di capire dove nasce il blocco; la maggiore verbosità non migliora la progressione iniziale.

Baseline:

Capita spesso: il blocco in battuta nasce più dalla pressione del momento che dalla tecnica, e si può allenare.

- **Crea una routine sempre uguale**: respira lentamente, guarda il punto scelto, fai rimbalzare la palla una volta e batti. Mantienila in 5–7 secondi.
- **Scegli un obiettivo semplice e ampio**, per esempio “zona 1” o “oltre la rete”, invece di pensare a non sbagliare.
- **Usa una frase breve**: “Alto e avanti” oppure “Routine, colpisci”. Riporta l’attenzione all’azione.
- **Allenati sotto pressione graduale**: 5 battute senza conseguenze, poi una “battuta decisiva” contando solo l’esecuzione della routine, non il risultato.

Alla prossima partita, quale parte ti blocca di più: il lancio, il momento prima di colpire o la paura di sbagliare?

Candidate:

Capita spesso: il blocco in battuta di solito nasce dalla paura di sbagliare, non da un problema tecnico. Prova questa mini-routine prima di ogni servizio:

1. Espira lentamente.
2. Guarda un punto preciso del campo.
3. Ripeti una sola parola: **“fluida”** o **“alta”**.
4. Esegui il gesto senza aggiungere correzioni all’ultimo momento.

L’obiettivo non è “non sbagliare”, ma fare bene **la routine e il gesto**.

Quando ti blocchi, senti soprattutto paura di mandare la palla fuori/rete, oppure ti irrigidisci fisicamente e perdi il movimento?

### conversation-known-thread-fact:1:sample-3

Verdicts: baseline, baseline

Reasons: Both responses jump directly into advice without asking any diagnostic question first, which is a weakness. However, Response B is better structured with a concrete 7-day plan that progressively builds pressure (matching the anchor's emphasis on measurable routine completion), uses the context from the previous turn more specifically (incorporating the routine elements and the 'alto e avanti' phrase from the prior exchange), and ends with a practical logistical question that, while not deeply diagnostic, at least checks feasibility. Response A is solid but more generic and lacks any closing question. Both align with the strong anchor's philosophy of measuring routine completion rather than results, but B does so more concretely with day-by-day progression. Neither response asks a truly diagnostic question that would change the advice, but B's closing question is at least functional rather than purely ritual. | Entrambe usano bene il contesto della pallavolo e del blocco in battuta, spostando il focus su routine, pressione graduale e metriche di processo. A è molto solida e flessibile, con un buon reset dopo l’errore e misurazione della routine. B è leggermente preferibile perché traduce meglio la richiesta “questa settimana” in una progressione concreta giorno per giorno e chiude con una domanda logistica utile per adattare il piano al prossimo allenamento. La domanda di B non è profondamente diagnostica, ma può modificare l’applicazione pratica; A non fa domande, anche se in questo caso non era indispensabile.

Baseline:

È un ottimo obiettivo: in una settimana puoi ridurre il blocco costruendo una routine semplice e ripetendola anche sotto pressione.

**Piano di 7 giorni**

- **Giorni 1–2 – Routine:** per 10 minuti esegui 20 battute tranquille. Prima di ognuna: espira, guarda la zona, rimbalzo, parola chiave (“alto e avanti”), battuta. Valuta solo se hai seguito la routine.
- **Giorni 3–4 – Precisione semplice:** fai 3 serie da 8 battute verso una zona ampia. Se sbagli, non cambiare gesto: ripeti la routine.
- **Giorno 5 – Pressione controllata:** simula il punteggio sul 24-24. Hai due tentativi; prima di ogni battuta esegui la routine completa. Dopo, annota cosa hai fatto bene.
- **Giorno 6 – Allenamento reale:** chiedi a un compagno o all’allenatore di osservare solo la tua routine, senza commentare il risultato durante l’esecuzione.
- **Giorno 7 – Simulazione partita:** 10 battute con conseguenza leggera, per esempio una penalità se salti la routine, non se sbagli la direzione.

Durante la partita pensa soltanto a **respiro → bersaglio → gesto**. Se senti il blocco, fermati, fai un passo indietro e ricomincia la routine.

Quando sarà il tuo prossimo allenamento, puoi dedicare 10 minuti a questo piano?

Candidate:

Questa settimana lavora su **routine, gradualità e gestione dell’errore**, non solo sulla tecnica.

### Piano semplice

**Ogni giorno – 5 minuti**
- Fai 5 respiri con espirazione lunga.
- Immagina 3 battute riuscite, concentrandoti sul gesto.
- Scegli una parola-guida: **“fluida”**, **“alta”** o **“completa”**.

**2–3 volte questa settimana – allenamento**
1. **10 battute senza pressione**: pensa solo a lancio e gesto.
2. **10 battute verso una zona ampia**: non cercare subito la precisione.
3. **Serie con obiettivo di processo**: per esempio, eseguire correttamente la routine in 8 battute su 10. Il risultato del servizio viene dopo.
4. Aumenta gradualmente la pressione: immagina il punteggio, poi prova una battuta dopo uno sprint o davanti a un compagno.

### Dopo un errore
Non correggerti durante il gesto. Usa sempre lo stesso reset:

**allontanati dalla linea → espira → guarda il bersaglio → parola-guida → servi.**

Segna dopo ogni allenamento solo:
- quante volte hai seguito la routine;
- quanto ti sei sentito bloccato da 0 a 10.

Il successo della settimana è **eseguire la routine anche quando senti tensione**, non fare tutte le battute perfette.

### conversation-identity-correction:0:sample-3

Verdicts: tie, tie

Reasons: Both responses correctly acknowledge the identity switch (Marta instead of Paolo), avoid giving premature advice, and ask an open-ended question to begin discovery. Neither offers unsolicited advice, which is appropriate given the context. Response B is slightly more natural with 'Ti ascolto' which signals active listening, but both are functionally equivalent in quality. The questions asked are generic openers rather than high-value diagnostic questions, but given that no context about Marta's needs exists yet, a general opener is appropriate. Neither response is significantly better than the other. | Entrambe riconoscono correttamente che oggi sta scrivendo Marta e fanno una domanda aperta appropriata prima di dare consigli. La domanda è utile come apertura perché non c'è ancora un tema sportivo specifico, ma resta generica e non diagnostica. Nessuna delle due aggiunge verbosità inutile o formule eccessive; la progressione è semplice ma adeguata.

Baseline:

Perfetto, grazie per avermelo detto Marta. Di cosa vuoi parlare oggi?

Candidate:

Va bene, Marta. Ti ascolto: di cosa vuoi parlare oggi?

### conversation-identity-correction:1:sample-3

Verdicts: candidate, candidate

Reasons: Both responses give advice before asking a diagnostic question, which is the opposite of what the anchor forte models. However, both do end with a diagnostic question. Response A is slightly better because: (1) its advice is more concise and less verbose, leaving more room for the diagnostic question to feel natural rather than tacked on; (2) the question at the end is slightly more specific and includes more relevant options (including 'deludere l'allenatore' which adds psychological depth); (3) it feels more conversational and less like a listicle. Response B is more verbose with bullet points and multiple techniques, which feels more prescriptive before any discovery has happened. Neither response uses Marta's name or acknowledges the context switch well, and both jump to advice before diagnosis, but A is marginally better in naturalness and question quality. | Entrambe rispondono con consigli prima di fare scoperta, quindi non seguono pienamente l’anchor forte. A è leggermente migliore perché la domanda finale distingue non solo situazioni tecniche di basket, ma anche componenti emotive/sociali come sbagliare davanti agli altri o deludere l’allenatore, informazioni che cambierebbero davvero il coaching successivo. B offre consigli validi ma più generici e la domanda diagnostica è un po’ meno ricca. Nessuna delle due usa esplicitamente il contesto dell’identità corretta, cioè Marta.

Baseline:

È normale avere paura di sbagliare: l’obiettivo non è eliminarla, ma giocare comunque con fiducia.

- **Prima dell’azione:** inspira lentamente e pensa a una sola parola chiave: *“aggressiva”*, *“semplice”* o *“presente”*.
- **Dopo un errore:** fai un reset immediato: battito di mani, espira e chiediti: *“Qual è la prossima azione utile?”*
- **Cambia obiettivo:** non puntare a “non sbagliare”; punta a correre in difesa, comunicare, prendere buone decisioni e aiutare la squadra.
- **Allenati alla pressione:** durante gli allenamenti chiedi situazioni simulate di partita, concentrandoti sul gesto successivo, non sul risultato.

In quale momento senti più paura: quando tiri, quando perdi palla o durante le partite importanti?

Candidate:

La paura di sbagliare è normale, ma in partita devi spostare l’attenzione dal **risultato** alla **prossima azione**.

Prova questa routine dopo un errore:

1. **Espira lentamente.**
2. Dì mentalmente: **“È finita. Prossima azione.”**
3. Fissa un compito concreto: *difendere forte, tagliare, passare semplice, prendere il rimbalzo*.
4. Cerca volontariamente una giocata sicura per rientrare nel ritmo.

Ricorda: un errore non definisce la tua partita; spesso il problema diventa più grande quando inizi a evitarlo.

In quale situazione senti più paura: **tirare, perdere palla, sbagliare davanti agli altri o deludere l’allenatore**?

### conversation-cross-chat-transparency:0:sample-3

Verdicts: tie, candidate

Reasons: Entrambe le risposte sono molto simili e allineate all'anchor forte: dichiarano trasparentemente di non avere accesso all'altra chat, evitano di inventare consigli, e chiedono informazioni specifiche (allenamento previsto, stato fisico, obiettivo). La differenza è minima: A usa il grassetto e aggiunge 'non voglio inventare un piano' che è leggermente più verboso; B è leggermente più concisa e fluida. Entrambe fanno discovery prima del consiglio con domande diagnostiche di qualità simile. La naturalezza conversazionale è marginalmente migliore in B per la maggiore concisione, ma la differenza non è sufficiente per preferire una sull'altra. | Entrambe riconoscono correttamente di non avere accesso all'altra chat e chiedono informazioni diagnostiche utili prima di dare un piano. B è leggermente più naturale e scorrevole, mantiene la richiesta concreta e promette una progressione immediata senza suonare troppo rigida. A è molto buona, ma l'enfasi e 'ti dirò esattamente cosa fare' risultano un filo più meccaniche/iper-promissorie.

Baseline:

Non posso vedere il contenuto dell’altra chat, quindi non voglio inventare un piano. Incollami qui gli ultimi messaggi o riassumi **allenamento previsto, stato fisico e obiettivo di oggi**, e ti dirò esattamente cosa fare.

Candidate:

Non posso vedere il contenuto dell’altra chat. Incollami qui l’ultimo messaggio o un breve riassunto di obiettivo, allenamento previsto e stato attuale: così ti dico subito cosa fare oggi.

### conversation-cross-chat-transparency:1:sample-3

Verdicts: candidate, baseline

Reasons: Both responses give advice before fully discovering the user's situation, which is a weakness. However, Response A is slightly more concise and natural, with less formulaic structure. Both ask a relevant question at the end (whether there's training scheduled today), but A delivers less unsolicited advice before asking, making it slightly better on discovery-before-advice ratio. B is more verbose with a detailed 4-step protocol that assumes a lot without knowing the user's sport, experience level, or what specifically triggers the anxiety. A also assumes, but its advice is lighter and leaves more room for the follow-up question to actually shape the plan. Neither response asks a truly diagnostic question before giving advice (e.g., 'What specifically triggers the anxiety?' or 'What's your sport/event?'), but A's relative brevity and more natural tone give it a slight edge. | Entrambe usano bene il contesto dell’ansia pre-gara e propongono azioni concrete senza fingere di conoscere l’altra chat. A è più sintetica e la domanda finale è leggermente più completa perché distingue allenamento, recupero o riposo. B però offre una progressione più pratica per la giornata, con gestione dei pensieri, visualizzazione specifica, attenzione al carico e preparazione serale. La domanda finale di B è utile ma arriva dopo il consiglio, quindi la scoperta prima del consiglio non è eccellente. Nel complesso B è preferibile per concretezza e continuità verso domenica, non solo per maggiore lunghezza.

Baseline:

Capisco: oggi l’obiettivo non è eliminare l’ansia, ma renderla gestibile in vista della gara di domenica.

- **10 minuti:** scrivi cosa ti preoccupa e dividi tutto in “sotto il mio controllo” / “non sotto il mio controllo”. Scegli una sola azione concreta dalla prima lista.
- **Allenamento:** svolgilo normalmente, senza aggiungere carico per “recuperare” o dimostrare qualcosa. Concentrati su 1–2 aspetti tecnici già allenati.
- **Visualizzazione breve:** immagina partenza, primo momento di tensione e una risposta semplice: *respiro, guardo il riferimento, eseguo il prossimo gesto*.
- **Stasera:** prepara l’attrezzatura e fai 5 minuti di respirazione lenta, con espirazione più lunga dell’inspirazione.

Oggi hai già un allenamento programmato oppure è un giorno di riposo?

Candidate:

Se la gara è domenica, oggi non devi “risolvere” tutta l’ansia: devi solo costruire controllo.

Per oggi:
- fai l’allenamento previsto, senza aggiungere carichi per compensare la preoccupazione;
- dedica 5–10 minuti a respirazione calma e visualizzazione dei primi minuti di gara;
- scrivi **3 aspetti controllabili**: ritmo iniziale, tecnica, risposta agli imprevisti;
- evita di valutare oggi se sei “pronto” o no.

Oggi avevi in programma allenamento, recupero o riposo?

### conversation-progress-beyond-routine:0:sample-3

Verdicts: candidate, candidate

Reasons: Response A provides substantial advice (4 bullet points of prescriptive suggestions) before asking a diagnostic question at the end. This violates the 'discovery before advice' principle - the coach gives solutions without understanding the problem first. The question at the end is good but comes too late after unsolicited advice. Response B correctly prioritizes discovery: it validates briefly, states the principle (we need to understand where it breaks), and then asks targeted diagnostic questions without offering premature solutions. It also asks about what specific routine elements the athlete is using, which shows better contextual awareness and will lead to more tailored advice later. B is more aligned with the strong anchor's approach of not proposing alternatives immediately and instead diagnosing the precise failure point. | B è nettamente migliore perché non sostituisce subito la routine con altri consigli: identifica che serve capire dove la routine si rompe e fa domande diagnostiche che cambierebbero il consiglio successivo. A mostra empatia e conclude con una buona domanda, ma prima propone diverse azioni correttive senza aver chiarito il momento o il meccanismo del fallimento, quindi procede troppo presto verso il consiglio.

Baseline:

Capisco: è frustrante impegnarsi in una routine e sentire che, proprio quando serve, la paura resta lì.

- **Accorciala:** riducila a 3 passaggi e 5–8 secondi: *espira lentamente → guarda un punto preciso → scegli una sola intenzione tecnica*.
- **Non cercare di eliminare la paura:** formula “Posso sentire paura e fare comunque il gesto”. L’obiettivo è agire, non sentirsi perfettamente calmi.
- **Sposta l’attenzione sull’azione:** sostituisci “non sbagliare” con un comando osservabile, per esempio “piede attivo”, “guarda la palla” o “attacca il bersaglio”.
- **Allenala sotto pressione graduale:** inserisci una conseguenza controllata — punteggio, tempo limite o una ripetizione decisiva — e usa la routine anche quando l’errore non è ancora imminente.

In quale momento preciso smette di funzionare: **prima dell’azione, durante l’esecuzione o subito dopo un errore**?

Candidate:

Capito. Se non funziona, probabilmente non va ripetuta uguale: dobbiamo capire **dove si rompe**.

Durante la prestazione, cosa succede più precisamente?

1. La paura arriva **prima** di iniziare?
2. Compare **durante l’azione**, facendoti esitare?
3. Dopo un errore, ti blocchi o perdi fiducia?

E dimmi anche quale parte della routine stai usando: respirazione, parola chiave, visualizzazione o altro.

### conversation-progress-beyond-routine:1:sample-3

Verdicts: candidate, candidate

Reasons: Both responses correctly identify the core issue (fear of substitution rather than fear of error itself) and offer practical strategies. However, Response B is superior in several ways: (1) Discovery before advice: B ends with a genuinely diagnostic question ('Il coach ti ha mai detto esplicitamente che ti toglierà dopo un errore, oppure è una conclusione che temi tu?') which could fundamentally change the direction of coaching—if the coach actually said it, the work is different than if it's an assumption. A's closing question ('Qual è la prima azione concreta...') is more of a commitment/action question, not truly diagnostic. (2) B's framing of the problem is slightly more insightful—it explains WHY the routine fails (it tries to calm but doesn't address the perceived threat), showing deeper understanding. (3) B's step-by-step protocol (nomina il pensiero, riconosci l'incertezza, torna al compito) is more psychologically grounded and sequenced. (4) Both suggest talking to the coach, but B frames it more specifically with two distinct questions. A is still solid but slightly more formulaic and less discovery-oriented. | B identifica meglio che il problema non è la routine in sé ma la minaccia percepita della sostituzione, e propone sia un reset immediato sia una verifica concreta con il coach. La domanda finale è diagnostica ad alto valore: sapere se il coach lo ha detto esplicitamente o se è un'interpretazione dell'atleta cambierebbe il lavoro successivo. A è buona e contestualizzata, ma la domanda finale è più orientata all'azione che alla diagnosi, quindi fa progredire meno la conversazione.

Baseline:

Capisco: non temi solo l’errore, ma la conseguenza che immagini subito dopo—essere tolto dal coach.

- **Dopo l’errore, interrompi la previsione:** dì mentalmente “È un errore, non una sostituzione”. Non puoi controllare la decisione del coach, ma puoi controllare la prossima azione.
- **Usa un reset di 5 secondi:** espira, guarda il coach o un riferimento del campo, pronuncia una parola-chiave come *“prossima”*, poi fai un’azione semplice e utile.
- **Cambia l’obiettivo:** non “devo dimostrare di non sbagliare”, ma “dopo l’errore devo restare presente e contribuire”.
- **Parlane con il coach fuori dalla gara:** “Quando sbaglio temo di essere tolto e gioco più contratto. Qual è il comportamento che vuoi vedere da me dopo un errore?”

Qual è la **prima azione concreta** che puoi fare dopo il prossimo errore per dimostrare presenza, indipendentemente da ciò che decide il coach?

Candidate:

Il problema non è solo la paura dell’errore: è il pensiero **“se sbaglio, il coach mi toglie”**. In quel momento la routine probabilmente cerca di calmarti, ma non risponde alla minaccia che percepisci.

Prova così, subito dopo l’errore:

1. **Nomina il pensiero:** “Sto prevedendo di essere tolto.”
2. **Riconosci l’incertezza:** “Non so ancora se succederà.”
3. **Torna al compito:** scegli un’azione concreta per i prossimi secondi: smarcarti, difendere, comunicare, fare il passaggio semplice.
4. **Frase breve:** “Un errore non decide il mio posto. La prossima azione sì.”

Fuori dall’allenamento, sarebbe utile chiedere al coach in modo diretto e tranquillo:  
**“Quando sbaglio, cosa vuoi vedere da me nella giocata successiva? E in quali situazioni decidi di sostituirmi?”**

Così trasformi una paura vaga in criteri reali. Il coach ti ha mai detto esplicitamente che ti toglierà dopo un errore, oppure è una conclusione che temi tu?

### conversation-gradual-specialization:0:sample-3

Verdicts: candidate, candidate

Reasons: L'utente ha fornito un'informazione molto generica ('In gara perdo fiducia'). L'anchor forte della rubrica indica che la risposta ideale è una domanda diagnostica per capire meglio il problema prima di dare consigli. La Risposta A fornisce un elenco dettagliato di consigli pratici PRIMA di aver fatto scoperta, e solo alla fine pone una domanda. Questo viola il principio 'scoperta prima del consiglio'. La Risposta B è più contenuta: offre un breve reframe (la fiducia viene coperta dalla pressione) e un principio generale, poi pone la domanda diagnostica come elemento centrale. Pur non essendo perfetta come l'anchor forte (che è una pura domanda diagnostica senza consigli), B si avvicina molto di più al modello ideale. B è più naturale, meno verbosa, e mette la domanda in posizione prominente piuttosto che come appendice. | B è preferibile perché, dopo una breve normalizzazione, evita di sommergere l’atleta con soluzioni premature e pone subito una domanda diagnostica utile a capire quando emerge il calo di fiducia. A contiene consigli pratici e pertinenti, ma anticipa troppo il piano d’azione prima di chiarire il pattern del problema; la domanda finale è buona, però arriva dopo una lista già abbastanza completa di interventi.

Baseline:

È comune: in gara la pressione può far sembrare più fragili capacità che in allenamento ci sono già.

- **Prima della gara:** scegli 2 obiettivi controllabili, ad esempio “parto deciso” e “respiro tra un’azione e l’altra”, invece di pensare solo al risultato.
- **Durante:** usa una parola-chiave breve: *“presente”*, *“aggressivo”* o *“fluido”*. Ripetila prima dell’azione.
- **Dopo un errore:** espira lentamente, guarda un punto preciso e chiediti: **“Qual è la prossima azione utile?”** Niente analisi mentre stai gareggiando.
- **Allenamento mentale:** simula situazioni di pressione e allena la tua routine di reset, non solo la tecnica.

In quale momento perdi più fiducia: all’inizio, dopo un errore o quando il risultato è in bilico?

Candidate:

Capita spesso: in gara la fiducia non sparisce davvero, ma viene coperta dalla pressione e dall’attenzione agli errori. Invece di cercare di “sentirti sicuro”, prova a concentrarti su **un’azione concreta e controllabile** alla volta.

In quale momento perdi più fiducia: **prima della gara, dopo un errore, oppure quando il risultato non va come speravi?**

### conversation-gradual-specialization:1:sample-3

Verdicts: candidate, candidate

Reasons: Both responses provide advice after the user specifies the timing (after two consecutive errors in the final). Response A uses the context well (two errors, final phase), provides a concise reset routine, and then asks a high-value diagnostic question ('Qual è la tua disciplina?') that would genuinely change the next piece of advice. Response B also uses context but its closing question ('Qual è la tua prossima azione più semplice e sicura quando sei nel finale?') is more of a coaching prompt directed at the athlete rather than a genuine discovery question - it doesn't help the coach learn anything new to tailor advice. Response A's question about discipline is more diagnostic and would lead to sport-specific adaptation. Response A also feels more natural and progressive, building on the conversation without repeating the bullet-point format from the previous turn as heavily. Response B largely repeats the structure and content from its first turn (before/during/after bullets), showing less progression. Both give advice before fully exploring, but given the user provided specific information, some advice is appropriate here. | Entrambe usano bene il nuovo dettaglio dei due errori consecutivi nel finale e propongono un reset pratico. A è leggermente migliore perché traduce il problema in un meccanismo mentale preciso, dà una routine breve e poi fa una domanda davvero diagnostica sulla disciplina, che permetterebbe di adattare il consiglio al gesto specifico. B è solida e concreta, ma la domanda finale è più orientata all'autoriflessione immediata che alla raccolta di un'informazione capace di specializzare davvero il coaching.

Baseline:

Capisco: due errori nel finale possono trasformarsi rapidamente da problema tecnico a dubbio mentale.

- **Dopo il primo errore:** pensa solo a correggere un dettaglio, non al risultato.
- **Dopo il secondo:** attiva un reset fisso di 5–10 secondi: espira lungo, rilassa spalle e mani, guarda un punto, ripeti **“una giocata alla volta”**.
- **Prima dell’azione successiva:** scegli un’intenzione concreta: *“profondo”, “semplice”, “aggressivo”* oppure un’indicazione tecnica specifica.
- **In allenamento:** simula finali sotto pressione partendo da due errori consecutivi; allena soprattutto la routine di recupero.

Qual è la tua prossima azione più semplice e sicura quando sei nel finale?

Candidate:

Dopo due errori consecutivi il rischio è entrare nella modalità **“non devo sbagliare ancora”**. Così pensi al risultato e perdi precisione.

Prova questa routine breve:

1. **Stop:** espira lentamente e abbassa le spalle.  
2. **Reset:** dì mentalmente: *“I due errori sono finiti.”*  
3. **Un solo compito:** scegli una parola tecnica semplice, per esempio *“attacco”*, *“ritmo”* o *“precisione”*.  
4. **Nel finale:** non pensare a vincere o resistere; pensa solo alla **prossima azione**.

Allenala anche in allenamento creando apposta situazioni di pressione: due errori consecutivi e poi una ripetizione decisiva. L’obiettivo non è evitare gli errori, ma recuperare rapidamente.

Qual è la tua disciplina? Così posso adattare la routine al gesto specifico.

