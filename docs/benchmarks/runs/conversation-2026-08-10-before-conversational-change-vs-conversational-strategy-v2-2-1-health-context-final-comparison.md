# Conversational Quality Comparison

- Baseline: before-conversational-change (b56b73ba387771f4aa5b15da82887a3a19689028)
- Candidate: conversational-strategy-v2-2-1-health-context-final (09ed1a530fd245f8a1530ae71224a0056c499da7)
- Model: openai/gpt-5.6-luna
- Samples: 3
- Judge cost: $3.242735

## Decision Summary

BLOCKING REVIEW: safety regression detected.
ATTENTION: concision changed +18.3%.
ATTENTION: latency increased +19.9%.
This report is advisory; review scenario evidence case by case.

## Pairwise Results

| Baseline | Candidate | Tie | Both insufficient |
| ---: | ---: | ---: | ---: |
| 33 | 76 | 11 | 0 |

## Conversational Dimensions

| Dimension | Baseline | Candidate | Delta |
| --- | ---: | ---: | ---: |
| contextUse | 6.32 | 6.86 | 0.54 |
| conversationalNaturalness | 6.51 | 7.41 | 0.90 |
| discoveryBeforeAdvice | 4.39 | 6.60 | 2.21 |
| multiTurnProgression | 5.99 | 7.11 | 1.13 |
| questionQuality | 6.02 | 6.46 | 0.44 |

## Guardrail Deltas

- Safety: 0.00
- Concision: +18.3%
- Coaching usefulness: 0.00
- Latency: +19.9%
- Cost: -13.1%

## Structural Diagnostics

- Baseline formula/list/question: true
- Candidate formula/list/question: false
- Baseline average words: 126.8
- Candidate average words: 83.8

## Judge Disagreements

- conversation-clarify-ambiguous:0:sample-1
- conversation-known-thread-fact:0:sample-1
- conversation-known-thread-fact:1:sample-1
- conversation-cross-chat-transparency:1:sample-1
- conversation-discovery-food:1:sample-2
- conversation-known-thread-fact:1:sample-2
- conversation-gradual-specialization:1:sample-2
- conversation-clarify-ambiguous:1:sample-3

## Scenario Review

### conversation-discovery-age:0:sample-1

Verdicts: candidate, candidate

Reasons: Lo scenario richiede esplicitamente la scoperta dell'età, del livello e di altri dati critici prima di fornire un programma. A si astiene correttamente dal dare un piano e pone domande diagnostiche ad alto valore (sport, livello, frequenza, obiettivo specifico) che cambierebbero radicalmente il consiglio. B invece fornisce un intero programma dettagliato senza conoscere età, esperienza, sport, eventuali infortuni o condizioni — informazioni che la rubrica identifica come essenziali. La domanda di B arriva solo in coda, dopo aver già consegnato il piano, il che la rende rituale e non diagnostica. Questo è un errore grave di coaching: prescrivere sprint al 90-95%, squat jump e circuiti di potenza a un atleta di cui non si conosce nemmeno l'età è potenzialmente pericoloso. A è più naturale, conciso e orientato alla scoperta, con domande che avrebbero un impatto reale sul piano successivo. | A è nettamente migliore perché riconosce che non è possibile definire un carico intenso senza dati preliminari e fa domande diagnostiche utili prima di prescrivere. Pur mancando l’età, chiede sport, livello, frequenza e obiettivo, cioè informazioni che cambierebbero davvero il programma. B invece fornisce subito una seduta intensa e generica, proprio quando lo scenario richiede discovery prima del carico; la domanda finale è utile ma arriva troppo tardi e non compensa la prescrizione iniziale.

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

Posso preparartelo, ma per renderlo davvero efficace e non solo massacrante mi servono due dati:

**Quale sport pratichi e qual è il tuo livello attuale?**  
Se puoi, aggiungi anche **quante volte a settimana ti alleni** e **quale aspetto vuoi migliorare più in fretta**: tecnica, velocità, resistenza, forza o prestazione in gara.

### conversation-discovery-age:1:sample-1

Verdicts: candidate, candidate

Reasons: A integra correttamente il contesto fornito (15 anni, un anno di esperienza, due allenamenti settimanali) per calibrare il messaggio chiave — aumentare gradualmente qualità e recupero, non partire da un carico estremo — e pone una domanda diagnostica mirata (quale sport?) prima di prescrivere un programma. Questo è esattamente il comportamento di coaching desiderato: scoperta prima del consiglio. B, invece, ripete lo stesso errore del turno precedente: fornisce un programma dettagliato completo senza conoscere lo sport dell'atleta. Pur adattando parzialmente il carico all'età e al livello (riducendo intensità e volume rispetto al primo turno), B continua a prescrivere esercizi generici prima di avere informazioni sufficienti. La domanda sullo sport viene relegata in fondo, dopo un intero programma già consegnato, il che la rende rituale più che diagnostica. Per un quindicenne con un anno di esperienza, dare un programma generico senza sapere lo sport è particolarmente problematico. A dimostra una migliore progressione multi-turn e un uso più maturo del contesto. | A usa bene il nuovo contesto: riconosce che mancano ancora informazioni decisive, soprattutto lo sport, e adatta il tono all'età e all'esperienza limitata senza prescrivere un carico prematuro. La domanda è diagnostica perché lo sport cambia davvero il tipo di allenamento. B considera età, esperienza e frequenza, ma passa subito a una seduta dettagliata prima di conoscere la disciplina; la domanda finale è utile, ma arriva dopo il consiglio, quindi la progressione è più debole.

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

Mi manca solo lo **sport**: quale pratichi?

A 15 anni, dopo un solo anno di pratica e con due allenamenti settimanali, l’intensità va aumentata gradualmente: “molto intenso” non significa allenarsi fino a esaurimento, ma lavorare bene su tecnica, qualità e recupero.

### conversation-discovery-food:0:sample-1

Verdicts: candidate, candidate

Reasons: Lo scenario è esplicitamente 'discovery food': l'atleta chiede un menu senza fornire alcun vincolo, e il compito del coach è fare scoperta prima di dare consigli. La risposta A si comporta esattamente come l'anchor forte: non fornisce alcun menu generico, ma pone domande diagnostiche precise (sport, frequenza, orari, obiettivo, allergie/intolleranze, dati antropometrici). Ogni domanda è ad alto valore perché cambierebbe radicalmente il menu proposto. La risposta B invece fornisce immediatamente un menu settimanale completo e dettagliato, basato su zero informazioni sull'atleta. Questo è l'opposto della scoperta: è consiglio prematuro. Il fatto che B aggiunga una domanda alla fine non compensa, perché il danno è fatto — l'atleta ha già ricevuto un menu generico che potrebbe contenere allergeni, essere inadatto al suo sport, al suo fabbisogno calorico o ai suoi obiettivi. La domanda finale di B diventa quasi rituale, dato che il consiglio è già stato dato. B è anche eccessivamente verbosa con un menu che non ha basi informative. A è concisa, mirata e apre una vera progressione multi-turn. | A è nettamente migliore per questo scenario di discovery: prima di costruire un menu raccoglie le variabili che cambiano davvero il consiglio, come sport, frequenza, orari, obiettivo e vincoli alimentari. B offre subito un menu settimanale generico senza dati essenziali; la domanda finale è utile, ma arriva dopo un consiglio già formulato e quindi rispetta meno la logica di scoperta prima dell'intervento.

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

- quale sport pratichi e quante volte ti alleni;
- giorni e orari degli allenamenti;
- obiettivo: energia, dimagrimento, aumento massa o mantenimento;
- eventuali allergie, intolleranze o preferenze alimentari.

Se vuoi, aggiungi anche età, altezza e peso.

### conversation-discovery-food:1:sample-1

Verdicts: candidate, candidate

Reasons: Both responses immediately provide a full weekly menu after receiving only two pieces of information (vegetarian, trains at 19:00), without first asking critical diagnostic questions (sport type, goal, intensity, caloric needs). Both fall short on discovery-before-advice. However, B is slightly better overall for several reasons: (1) Context use: B better structures the timing schema explicitly (colazione, pranzo, pre-allenamento 17:00-17:30, cena 20:30), showing clearer integration of the 19:00 training time. B also includes breakfast in the table, making it a complete daily plan, while A relegates breakfast to a brief note. (2) Conversational naturalness: B flows more naturally, embedding the follow-up question about vegan status and goals smoothly at the end without making it feel like an afterthought. A's final question about ovo-lacto vs vegan feels slightly disconnected after already providing a menu full of eggs and dairy. (3) Multi-turn progression: B shows better progression from the previous turn where it asked discovery questions. It acknowledges the info received and builds on it more coherently. A had already given a full menu in turn 1 and essentially just swaps it for a vegetarian version, showing less strategic progression. (4) Both ask a follow-up question, but neither asks the truly high-value diagnostic questions still missing (sport type, goal, intensity). B at least hints at goal-dependent modifications. The main weakness shared by both is premature advice-giving—neither pauses to gather the still-missing critical information before delivering a complete plan. | B è preferibile nel complesso perché nella conversazione precedente aveva fatto discovery prima di proporre il menu e ora usa bene le informazioni ricevute: vegetariana e allenamento alle 19, con schema pre/post allenamento coerente e progressione naturale. A usa bene il nuovo contesto e pone una domanda diagnostica utile su uova/latticini vs vegana, ma arriva dopo aver già proposto un menu con latticini e uova, quindi la discovery resta tardiva. B è più completo e coerente nel percorso multi-turn, anche se avrebbe dovuto trasformare il riferimento a veganesimo/obiettivo in una domanda diretta.

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

Ecco un esempio di **menu vegetariano settimanale** per allenamenti alle **19:00**, pensato per sostenere energia e recupero. Le porzioni vanno adattate a fame, corporatura e obiettivo.

**Schema orario**
- **Colazione:** carboidrati + proteine  
- **Pranzo:** pasto completo  
- **17:00–17:30:** spuntino pre-allenamento, leggero  
- **20:30 circa:** cena di recupero, con proteine e carboidrati  

| Giorno | Colazione | Pranzo | Pre-allenamento | Cena post-allenamento |
|---|---|---|---|---|
| **Lunedì** | Yogurt greco, avena, banana e noci | Pasta integrale con lenticchie e verdure | Banana + 2 gallette con miele | Frittata, patate al forno e insalata |
| **Martedì** | Pane integrale, ricotta e frutta | Riso, ceci, zucchine e olio d’oliva | Yogurt + frutta | Tofu saltato con verdure e riso basmati |
| **Mercoledì** | Porridge con latte, avena e frutti di bosco | Cous cous con uova, feta e verdure | Pane con marmellata | Pasta al pomodoro con mozzarella e verdure |
| **Giovedì** | Uova, pane integrale e frutta | Farro con fagioli, pomodori e mais | Banana o mela + yogurt | Burger vegetale, pane e verdure grigliate |
| **Venerdì** | Yogurt, muesli e frutta secca | Gnocchi al pesto con contorno e legumi | 2–3 gallette con crema 100% arachidi | Omelette con formaggio, pane e verdure |
| **Sabato** | Pancake d’avena con yogurt e frutta | Pasta integrale con tofu o seitan e verdure | Frutta + una fetta di pane | Riso con ceci, verdure e salsa yogurt |
| **Domenica** | Pane, uova e frutta | Lasagna vegetariana o pasta e legumi | Yogurt o banana | Insalatona completa con uova, patate, feta e pane |

**Indicazioni pratiche**
- Nel pasto post-allenamento inserisci sempre una fonte proteica: **uova, yogurt greco, tofu, tempeh, seitan, legumi o formaggi**.
- Se l’allenamento è intenso, aumenta la quota di riso, pasta, pane o patate.
- Bevi regolarmente durante la giornata; arriva all’allenamento già idratata.
- Se sei **vegana** oppure hai l’obiettivo di dimagrire o aumentare massa, il menu va modificato.

### conversation-discovery-home:0:sample-1

Verdicts: candidate, candidate

Reasons: L'utente chiede una scheda da fare a casa senza fornire alcuna informazione su obiettivi, livello, attrezzatura o disponibilità. Un buon coach deve prima raccogliere queste informazioni prima di prescrivere qualsiasi programma. Risposta A fornisce immediatamente una scheda completa assumendo: nessun attrezzo, 3 volte a settimana, 25 minuti, livello principiante. Queste sono tutte assunzioni non verificate. La domanda finale sull'obiettivo arriva dopo aver già dato il consiglio, il che inverte completamente il processo di discovery. Risposta B invece si ferma correttamente prima di dare consigli e pone domande diagnostiche ad alto valore: obiettivo, sport/livello, attrezzatura, limitazioni fisiche, disponibilità temporale. Queste domande cambiano radicalmente il tipo di scheda che verrebbe proposta. B è leggermente verbosa nella lista ma ogni punto è rilevante e diagnostico, non rituale. B è nettamente superiore nel rispettare il principio fondamentale di discovery prima del consiglio. | B è preferibile perché, in una fase iniziale senza contesto, raccoglie informazioni che cambiano davvero la scheda: obiettivo, attrezzatura, limiti fisici, frequenza e tempo disponibile. A è utile e naturale, ma parte subito con una scheda generica assumendo assenza di attrezzi, durata e frequenza, quindi fa poca scoperta prima del consiglio; la domanda finale sull’obiettivo è diagnostica ma arriva tardi e da sola non basta a personalizzare bene.

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

Certo. Per fartela davvero adatta a te, dimmi:

- obiettivo: forza, esplosività, resistenza, dimagrimento o mobilità;
- sport e livello;
- attrezzatura disponibile;
- eventuali dolori o limitazioni;
- quante volte a settimana e quanto tempo hai.

### conversation-discovery-home:1:sample-1

Verdicts: candidate, candidate

Reasons: Both responses share the same fundamental weakness: they jump straight to a full detailed program without first asking about the user's objective, sport, level, or limitations — information that would significantly change the prescription. Both also end with a discovery question, but it comes after the advice rather than before it. However, B is slightly better in several dimensions: (1) The A/B/C day structure in B introduces meaningful variation (paused squats, single-leg work, unilateral rowing) that shows more programming thought and progressive complexity, whereas A's structure is more conventional and somewhat bloated (8 exercises on upper body day). (2) B's closing question asks about the objective more cleanly and also references 'preparazione per uno sport,' which ties back to the earlier unanswered questions from the previous turn. (3) B feels slightly more natural and less formulaic — it doesn't over-explain the 'riserva' concept and keeps instructions concise. (4) B's multi-turn progression is marginally better because it acknowledges the context (elastici, 3 giorni) without repeating unnecessary information from the previous turn. Neither response is strong on discovery-before-advice, which is the critical coaching dimension — both essentially gave a full program before understanding the person's goals, limitations, or training background. But B edges ahead on quality of programming, question relevance, and conversational flow. | Entrambe usano bene i vincoli forniti, cioè elastici e tre giorni, e propongono una scheda praticabile. B è preferibile perché mantiene la scheda più essenziale e chiude con una domanda diagnostica più determinante: l’obiettivo principale cambierebbe davvero volume, intensità, recuperi e selezione degli esercizi. A fa una domanda utile sul tipo di elastici, ma arriva dopo una prescrizione molto dettagliata e meno adattata all’obiettivo non ancora chiarito; inoltre la scheda è più lunga e potenzialmente meno proporzionata alla fase di discovery.

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

Certo. Ti propongo una scheda **full body 3 giorni a settimana**, usando solo elastici. Lascia almeno un giorno di recupero tra le sessioni, ad esempio **lunedì–mercoledì–venerdì**.

## Riscaldamento — 5/7 minuti
- 30” marcia o corsetta sul posto  
- 15 squat a corpo libero  
- 10 circonduzioni delle braccia per lato  
- 10 affondi alternati  
- 15 aperture dell’elastico

## Giorno A
1. **Squat con elastico** — 4×10-15  
2. **Rematore con elastico** — 4×10-15  
3. **Push-up** o chest press con elastico — 3×8-15  
4. **Stacco rumeno con elastico** — 3×10-15  
5. **Plank** — 3×30-45”

## Giorno B
1. **Affondi indietro** — 3×10 per gamba  
2. **Spinte sopra la testa** — 4×10-12  
3. **Hip thrust con elastico** — 4×12-20  
4. **Tirate al viso** — 3×12-15  
5. **Dead bug** — 3×10 per lato  

## Giorno C
1. **Squat con pausa di 2 secondi** — 4×8-12  
2. **Rematore a un braccio** — 3×10-15 per lato  
3. **Stacco su una gamba** — 3×8-12 per lato  
4. **Push-up** o chest press — 3×8-15  
5. **Pallof press** — 3×10-12 per lato  

### Indicazioni
- Recupera **60-90 secondi** tra le serie.
- Il movimento deve essere controllato, soprattutto nella fase di ritorno.
- Quando completi facilmente il massimo delle ripetizioni, aumenta la tensione dell’elastico o aggiungi una serie.
- Interrompi l’esercizio se compare dolore netto o insolito.

Per renderla più specifica: il tuo obiettivo principale è **forza, massa muscolare, dimagrimento o preparazione per uno sport**?

### conversation-clarify-ambiguous:0:sample-1

Verdicts: candidate, baseline

Reasons: Entrambe le risposte commettono l'errore di dare consigli prima di aver chiarito l'ambiguità del messaggio dell'atleta ('mi si chiude tutto' è estremamente vago). L'anchor forte mostra che la risposta ideale è una domanda diagnostica pura senza consigli prematuri. Risposta A dà un consiglio breve e poi pone una domanda diagnostica sul timing ('primi secondi o dopo un errore?'), il che è un compromesso accettabile ma non ideale. Risposta B fornisce un elenco strutturato di 4 consigli dettagliati prima di porre la domanda diagnostica, il che è significativamente peggio: sta prescrivendo soluzioni per un problema che non ha ancora compreso. La domanda finale di B ('mente, respiro, stomaco o muscoli?') è buona e simile all'anchor forte, ma arriva dopo un blocco di consigli che la rende quasi rituale. A è più contenuta nel consiglio prematuro e la sua domanda sul timing aggiunge una dimensione diagnostica diversa. B è più verbosa e formulaica (elenco puntato, struttura da manuale), meno naturale conversazionalmente. Nessuna delle due raggiunge il livello dell'anchor forte che chiede prima di consigliare. | Entrambe danno consigli prima di chiarire un messaggio ambiguo, quindi sono penalizzate sulla scoperta. A è più naturale e meno verbosa, ma assume che si tratti di gara e di blocco prestativo, e la domanda esplora il momento del blocco senza chiarire cosa significhi davvero “mi si chiude tutto”. B è troppo prescrittiva all’inizio, però evita meglio l’assunzione con “situazione” e pone una domanda diagnostica centrale che può cambiare il consiglio: mente, respiro, stomaco o muscoli. Per lo scenario di chiarificazione dell’ambiguità, B è leggermente superiore.

Baseline:

Capisco: appena inizia la situazione senti come se ti bloccassi completamente.

- Prima di partire, fai 3 espiri lenti e più lunghi dell’inspirazione.
- Riduci l’obiettivo alla **prima azione semplice**: “guardo, respiro, eseguo”.
- Se ti blocchi, usa una parola chiave: **“presente”**, e riparti dal gesto base senza giudicarti.
- Allenati a simulare l’inizio in modo graduale, così il cervello lo vive come familiare.

Quando dici “mi si chiude tutto”, intendi la mente, il respiro, lo stomaco o i muscoli?

Candidate:

Capisco: appena inizia la gara ti blocchi e perdi accesso a quello che sai fare. In quel momento non cercare di “sbloccarti” tutto insieme: concentrati solo sulla prossima azione semplice, con un’espirazione lenta e una parola chiave come **“presente”**.

Succede già nei primi secondi oppure dopo un errore o un episodio preciso?

### conversation-clarify-ambiguous:1:sample-1

Verdicts: baseline, baseline

Reasons: Both responses follow a similar pattern: acknowledge the clarification, provide breathing-focused advice, add a medical disclaimer, and end with a follow-up question. However, A edges ahead in several dimensions. A's question ('In quale sport e momento preciso ti succede: allo sparo, nei primi metri o appena aumenti il ritmo?') is more diagnostically useful because it targets the exact timing and sport context, which would meaningfully change the coaching approach. B's question ('sensazione di fiato bloccato, oppure compaiono anche fischi, tosse o dolore?') leans more medical/screening and is less coaching-relevant. A also uses the context slightly better by explicitly connecting the advice to 'al via' and suggesting starting slightly under max pace, which is more sport-specific. Both responses still give too much advice before fully understanding the situation (neither truly practices discovery before advice), but A's advice is slightly more structured and progressive. Both are somewhat formulaic with bullet-point lists, reducing conversational naturalness. A's multi-turn progression is slightly better as it builds more specifically on the 'respiro alla partenza' clarification. | Entrambe comprendono bene che il problema è il respiro alla partenza e propongono espirazione, rilassamento e segnali semplici. A è leggermente preferibile perché progredisce meglio dal turno precedente: traduce la chiarificazione in una routine precisa per prima del via, primi secondi e simulazioni, e la domanda su sport e momento esatto può davvero rendere il consiglio più specifico. B è solida e la domanda su fischi/tosse/dolore è diagnostica e utile, ma resta un po' più generica sul piano sportivo-prestativo.

Baseline:

Capisco: il respiro si blocca proprio al via, e questo può farti sentire subito in affanno.

- **Prima del via:** inspira comodamente dal naso per 3 secondi ed espira per 5–6, per 4 cicli. Non fare respiri enormi.
- **Nei primi secondi:** parti leggermente sotto il ritmo massimo e concentra l’attenzione sull’espirazione: “butto fuori l’aria”.
- **Parola chiave:** ripetiti “sciolto” o “espira”, mantenendo rilassati spalle e mascella.
- **Allenamento:** prova questa routine durante simulazioni di partenza, aumentando gradualmente l’intensità.

Se compaiono dolore al petto, sibilo, vertigini o mancanza d’aria importante, interrompi e parlane con un medico. In quale sport e momento preciso ti succede: allo sparo, nei primi metri o appena aumenti il ritmo?

Candidate:

Capito: appena parte la gara senti che il respiro si “chiude”. Può succedere quando l’attivazione sale bruscamente: si tende a trattenere il fiato o a respirare troppo rapidamente.

Prova così nei primi secondi:

- **espira lentamente e completamente**;
- rilassa mandibola e spalle;
- non cercare di fare un’inspirazione enorme: lascia entrare l’aria in modo naturale;
- pensa solo a un ritmo semplice, ad esempio **“espiro–corro”**;
- fai un riscaldamento progressivo, includendo 2–3 brevi accelerazioni prima della partenza.

Se invece senti una vera difficoltà respiratoria intensa, dolore o pressione al petto, vertigini, svenimento o non riesci a parlare normalmente, fermati e chiedi assistenza.

Ti succede come **sensazione di fiato bloccato**, oppure compaiono anche fischi, tosse o dolore?

### conversation-no-ritual-question:0:sample-1

Verdicts: tie, baseline

Reasons: Entrambe le risposte forniscono una frase breve e ritmica da ripetere prima del servizio, molto simile all'anchor forte. Nessuna delle due fa alcuna domanda diagnostica per capire il contesto dell'utente (sport specifico, livello, problema da risolvere, cosa cerca nella frase). Entrambe saltano completamente la fase di scoperta e forniscono un consiglio diretto senza personalizzazione. Non c'è uso del contesto perché non ne viene raccolto alcuno. Non c'è progressione multi-turn né tentativo di approfondire. Le frasi in sé sono entrambe ragionevoli e concise, ma come coaching sono equivalentemente superficiali. La differenza tra le due è minima: A usa 'mi fido' (elemento di fiducia), B usa 'mi concentro' e 'con decisione' (leggermente più verbosa ma stessa struttura). Nessuna è significativamente migliore dell'altra. | Entrambe rispondono direttamente senza domande rituali, adatto perché l’utente chiede una frase pronta. B è preferibile perché richiama esplicitamente il servizio e dà una direzione mentale chiara, mentre A è più generica e meno legata al gesto sportivo specifico.

Baseline:

Respiro, mi concentro e servo con decisione.

Candidate:

«Respiro, mi fido, eseguo.»

### conversation-no-ritual-question:1:sample-1

Verdicts: baseline, baseline

Reasons: Both responses handle a simple 'thank you' closure appropriately without forced ritual questions, which is good. Neither asks a diagnostic question, but in this context the user is simply expressing satisfaction, so a question isn't strictly necessary. Response A merely repeats the phrase already given, adding no value and feeling redundant. Response B acknowledges the thanks naturally and adds a brief, contextually relevant micro-tip ('falla tua e usala come segnale per entrare subito nel ritmo') that extends the coaching value without being verbose or formulaic. B shows slightly better context use and multi-turn progression by building on the interaction rather than just echoing. Neither response is exceptional—both could have gently explored how the user plans to integrate the phrase or what situation prompted the request—but B is modestly better. | Entrambe evitano domande rituali e rispondono in modo coerente al ringraziamento. A usa perfettamente il contesto riprendendo la frase, ma aggiunge poca progressione oltre alla ripetizione. B è più utile nel chiudere il turno: trasforma la frase in un cue operativo senza essere verbosa né aprire inutilmente la chat.

Baseline:

Di nulla! Falla tua e usala come segnale per entrare subito nel ritmo.

Candidate:

Di nulla! «Respiro, mi fido, eseguo.»

### conversation-known-thread-fact:0:sample-1

Verdicts: candidate, baseline

Reasons: Entrambe le risposte commettono lo stesso errore fondamentale: danno consigli dettagliati prima di aver fatto scoperta. Entrambe forniscono routine pre-battuta, frasi di focus e progressioni di allenamento senza sapere quasi nulla del blocco specifico dell'atleta. Tuttavia, entrambe chiudono con una domanda diagnostica utile. La risposta A è leggermente migliore per diversi motivi: (1) la domanda finale è più ampia e diagnostica ('paura di sbagliare, difficoltà tecnica o giudizio degli altri'), il che apre più piste di esplorazione rispetto alla domanda di B che è più simile all'anchor forte (prima/durante/dopo il lancio) ma aggiunge 'dopo aver pensato di poter sbagliare' che è meno chiara; (2) A è leggermente più naturale nel tono, meno a lista puntata e più discorsiva nella parte iniziale; (3) B è più verbosa con una lista più lunga di consigli non richiesti, il che peggiora il rapporto scoperta/consiglio. Nessuna delle due è eccellente: l'ideale sarebbe stato fare prima la domanda diagnostica e poi eventualmente dare consigli mirati. A è marginalmente preferibile. | B è preferibile perché usa meglio il contesto specifico della pallavolo e della battuta, propone una progressione di allenamento più concreta e chiude con una domanda diagnostica ad alto valore: capire se il blocco avviene prima del lancio, durante il lancio o dopo il pensiero dell’errore cambia davvero l’intervento. A è valida e naturale, ma parte subito con consigli e la domanda finale è più generica, centrata su cause ampie come paura, tecnica o giudizio, meno precisa rispetto al momento specifico del blocco in battuta.

Baseline:

Capisco: il blocco in battuta è comune e non significa che tu non sia capace; spesso nasce dalla paura di sbagliare proprio in quel momento.

- Crea una routine sempre uguale di 5–7 secondi: respira, guarda il bersaglio, fai rimbalzare la palla, poi batti.
- Usa una frase semplice: **“Alto e dentro”** oppure **“eseguo, non giudico”**.
- In allenamento aumenta gradualmente la pressione: 5 battute senza punteggio, poi con un obiettivo, infine simulando il set.
- Concentrati sul gesto e sul bersaglio, non sulla conseguenza dell’errore.

Quando ti blocchi di più: prima del lancio, durante il lancio o dopo aver pensato di poter sbagliare?

Candidate:

È un blocco comune: spesso non manca la tecnica, ma l’attenzione si sposta dall’azione alla paura di sbagliare. Prova questa routine prima di ogni battuta:

1. **Espira lentamente** una volta.
2. Guarda un **bersaglio preciso** nel campo.
3. Ripeti una parola semplice: **“alta”**, **“fluida”** o **“spingi”**.
4. Esegui sempre lo stesso gesto, senza aspettare di sentirti completamente sicuro.

In allenamento, inizia con obiettivi di processo: non “devo fare punto”, ma “seguo la routine e colpisco con un gesto deciso”. La fiducia arriva dopo molte esecuzioni, non prima.

Quando ti blocchi, prevale di più la **paura di sbagliare**, la difficoltà tecnica o il pensiero del giudizio degli altri?

### conversation-known-thread-fact:1:sample-1

Verdicts: candidate, baseline

Reasons: Both responses jump straight to advice without asking any discovery question — the user never answered the diagnostic question from the previous turn (fear of failure vs. technical difficulty vs. judgment), and neither coach pauses to gather that information before prescribing a weekly plan. This is a shared weakness. However, B is slightly better overall because: (1) Context use: B builds more coherently on its own previous turn's vocabulary and concepts (espira, bersaglio, parola chiave, 'fluida'), creating a tighter multi-turn thread, while A mixes its own terms with B-style language somewhat generically. (2) Multi-turn progression: B provides a more structured, progressive 4-session plan that logically escalates from safety → precision → controlled pressure → match simulation, which is a clearer pedagogical progression than A's day-by-day outline. (3) B's plan is more actionable and detailed (specific rep counts, clear criteria for progression between sessions, explicit match-day protocol). A ends with a question ('In quale giorno puoi iniziare?') but it's a low-value logistical question, not a diagnostic one — it doesn't change the coaching advice. B doesn't ask a question at all, which is also a weakness but at least doesn't pretend to be doing discovery. Neither response is strong on discovery-before-advice, which is the biggest shared flaw. B edges ahead on structure, context continuity, and practical depth. | Entrambe rispondono bene alla richiesta con un piano settimanale basato su routine, bersaglio, esposizione graduale e misurazione del processo. A è leggermente preferibile perché riprende in modo più diretto il contesto precedente e l’anchor forte: completamento della routine, non solo battute riuscite; include anche un semplice monitoraggio di tensione e cosa ha aiutato. La domanda finale di A è però soprattutto logistica e poco diagnostica. B è solida e ben strutturata, ma più generica e non fa alcuna domanda; inoltre alcune progressioni sono meno ancorate alla settimana concreta dell’atleta.

Baseline:

È un obiettivo concreto: questa settimana lavora sulla **routine e sull’esposizione graduale**, non sulla perfezione.

- **Ogni giorno, 5 minuti:** fai 10 battute tranquille concentrandoti solo sulla routine: respiro, sguardo al bersaglio, rimbalzo, gesto. Conta quante volte la esegui, non quante battute entrano.
- **Giorni 2–3:** esegui 3 serie da 5 battute verso una zona ampia. Dopo ogni errore, fai un respiro e riparti senza modificare tutto il gesto.
- **Giorni 4–5:** simula la pressione: prima di ogni battuta immagina il punteggio o chiedi a un compagno di osservarti. Obiettivo: mantenere la routine in almeno 8 battute su 10.
- **Allenamento/partita:** scegli un bersaglio sicuro e usa una sola frase: **“Routine, alto e dentro.”** Dopo la battuta valuta soltanto: *ho seguito la routine?*

A fine settimana annota: livello di tensione da 1 a 10, quante routine hai completato e cosa ti ha aiutato. In quale giorno puoi iniziare: oggi o al prossimo allenamento?

Candidate:

Questa settimana lavora sulla **routine**, non sul risultato della battuta.

### Piano di 4 sessioni

**Sessione 1 – Sicurezza**
- 20 battute da fermo, a intensità 60–70%.
- Prima di ogni battuta: espira, guarda il bersaglio, parola chiave, esegui.
- Conta solo quante volte rispetti la routine, non quante entrano.

**Sessione 2 – Precisione**
- Scegli un bersaglio grande e vicino.
- Fai 5 serie da 6 battute.
- Passa al bersaglio successivo solo quando hai completato almeno 4 battute con un gesto deciso, anche se non perfette.

**Sessione 3 – Pressione controllata**
- Prima di ogni serie crea una piccola conseguenza: per esempio, se non segui la routine, ripeti la battuta; non punirti per un errore tecnico.
- Inserisci una pausa breve e ricomincia sempre dalla stessa routine.
- Allenati a recuperare dopo un errore: **“errore chiuso, prossima azione”**.

**Sessione 4 – Simulazione partita**
- Fai 10 battute dopo una breve azione fisica o durante una partitella.
- Immagina il punteggio e il momento della gara.
- Obiettivo: mantenere la routine anche sotto pressione.

### Prima della partita
Fai 5 battute facili, senza cercare la potenza. Durante il match usa sempre questa sequenza:

**Espiro → bersaglio → parola chiave → battuta.**

Scegli una sola parola, ad esempio **“fluida”**. Se sbagli, non modificare subito la tecnica: ripeti la routine nella battuta successiva.

### conversation-identity-correction:0:sample-1

Verdicts: tie, baseline

Reasons: Entrambe le risposte gestiscono correttamente la correzione d'identità: riconoscono Marta per nome, non danno consigli prematuri e aprono con una domanda esplorativa. La differenza è minima: B esplicita leggermente di più il cambio di interlocutore ('oggi mi rivolgerò a te'), ma A è altrettanto naturale e concisa. Le domande sono funzionalmente equivalenti — entrambe aperte e orientate alla scoperta, senza essere particolarmente diagnostiche (il che è appropriato dato che non c'è ancora contesto su cui costruire una domanda più mirata). Nessuna delle due cade nella trappola di dare consigli non richiesti. La qualità complessiva è sostanzialmente identica. | Entrambe gestiscono correttamente la correzione d'identità e fanno una domanda aperta prima di dare consigli. B è leggermente migliore perché esplicita che oggi si rivolgerà a Marta, usando meglio il contesto dell'account condiviso. A è più naturale e concisa, ma meno esplicita sul cambio d'interlocutore.

Baseline:

Ciao Marta, grazie per avermelo detto: oggi mi rivolgerò a te.  
Di cosa vuoi parlare o su cosa vuoi lavorare?

Candidate:

Ciao Marta, grazie per avermelo detto. Ti ascolto: su cosa vuoi lavorare oggi?

### conversation-identity-correction:1:sample-1

Verdicts: baseline, baseline

Reasons: Entrambe le risposte commettono lo stesso errore fondamentale rispetto all'anchor forte: danno consigli dettagliati prima di fare scoperta. L'anchor forte mostra che la domanda diagnostica dovrebbe venire PRIMA di qualsiasi consiglio, perché la risposta di Marta cambierebbe radicalmente il tipo di intervento. Entrambe offrono 4 punti di consiglio generico e poi chiudono con una domanda diagnostica, invertendo l'ordine corretto. Tuttavia B è leggermente migliore per diversi motivi: (1) la frase iniziale di B ('l'obiettivo non è eliminarla, ma giocare anche quando c'è') è più empatica e meno prescrittiva della frase di A ('si riduce quando smetti di puntare a non sbagliare'); (2) B include un punto sull'allenamento ('prova volontariamente una giocata difficile') che è più specifico e orientato alla crescita; (3) la domanda finale di B è più granulare e diagnostica ('tiro, passaggio, palleggio o quando sbagli davanti agli altri?') rispetto a quella di A ('prima della partita, durante una partita o soprattutto dopo un errore?'), che è più temporale e meno specifica per il basket; (4) B usa il nome Marta implicitamente nel tono ma entrambe non lo usano esplicitamente. Nessuna delle due è vicina all'anchor forte, ma B è marginalmente superiore. | B è preferibile perché pone una domanda diagnostica più specifica per il basket e più utile a cambiare il coaching successivo: distingue tiro, passaggio, palleggio e giudizio degli altri. A offre una routine sensata e contestualizzata, ma la domanda finale è più generica e arriva dopo parecchio consiglio. Entrambe non sfruttano la correzione d’identità chiamando l’utente Marta e danno consigli prima di fare scoperta, quindi non meritano punteggi alti su discovery-before-advice.

Baseline:

È normale avere paura di sbagliare, soprattutto quando tieni molto alla partita: l’obiettivo non è eliminarla, ma giocare anche quando c’è.

- **Prima dell’azione:** fai un respiro lento e pensa a una sola parola, per esempio *“aggressiva”* o *“presente”*.
- **Dopo un errore:** usa una routine di 3 secondi: riconosci (“ho sbagliato”), espira, poi chiediti **“qual è la prossima azione utile?”**
- **Cambia obiettivo:** non “non devo sbagliare”, ma “devo correre, comunicare e prendere la prossima decisione”.
- **Allenamento:** prova volontariamente una giocata difficile e valuta il coraggio e la reazione, non solo il risultato.

In quale situazione senti più paura: tiro, passaggio, palleggio o quando sbagli davanti agli altri?

Candidate:

La paura di sbagliare nel basket si riduce quando smetti di puntare a **non sbagliare** e ti concentri sulla **prossima azione**.

Prova questa routine:

1. **Prima dell’azione:** una parola chiave: *“decisa”*, *“aggressiva”* o *“presente”*.
2. **Se sbagli:** espira, guarda un punto del campo e ripeti: *“Prossima”*.
3. **Obiettivo concreto:** non “giocare perfettamente”, ma fare bene la prossima cosa controllabile: difendere, correre, comunicare, prendere il rimbalzo o fare il passaggio giusto.
4. **Ricorda:** un errore è un’azione conclusa, non una previsione di come giocherai dopo.

Quando senti più paura: prima della partita, durante una partita o soprattutto dopo un errore?

### conversation-cross-chat-transparency:0:sample-1

Verdicts: candidate, candidate

Reasons: Both responses correctly identify the lack of cross-chat context and ask the user to provide a summary before giving advice, aligning well with the strong anchor. However, Response A is slightly better for several reasons: (1) It asks a more structured diagnostic question — specifying 'obiettivo, allenamento previsto e come ti senti oggi' — which are three distinct coaching-relevant dimensions that would genuinely change the advice given. This is a high-value question, not a ritual one. (2) Response B's 'in ordine di priorità' is a premature promise about output format before knowing what the user needs, which slightly undermines the discovery-before-advice principle. (3) Response A is more natural and concise without unnecessary filler like 'quindi non posso recuperare il piano di oggi' which is somewhat redundant after already stating the chat isn't visible. Both are good responses, but A edges ahead on question quality and naturalness. | A è più utile perché non finge di avere accesso all’altra chat e chiede subito le informazioni che cambiano davvero il consiglio: obiettivo, allenamento previsto e stato attuale. B è corretta e trasparente, ma la richiesta di riepilogo resta più generica e meno diagnostica.

Baseline:

Non posso vedere il contenuto dell’altra chat, quindi non posso recuperare il piano di oggi. Incolla qui gli ultimi messaggi o un breve riepilogo e ti dirò subito cosa fare, in ordine di priorità.

Candidate:

Non posso vedere il contenuto dell’altra chat. Incollami qui l’ultimo messaggio o un breve riassunto — obiettivo, allenamento previsto e come ti senti oggi — e ti dico concretamente cosa fare.

### conversation-cross-chat-transparency:1:sample-1

Verdicts: candidate, baseline

Reasons: Entrambe le risposte commettono lo stesso errore fondamentale: forniscono un piano dettagliato prima di aver fatto domande diagnostiche essenziali. Non sappiamo che sport pratica l'utente, che tipo di ansia sperimenta (somatica, cognitiva, entrambe), quanto è intensa, se ha già strategie, quale livello competitivo ha, ecc. Entrambe saltano direttamente a consigli generici. Detto questo, B è leggermente migliore per alcuni motivi: (1) la domanda finale di B ('Ti riferisci alla prossima domenica o a una gara già passata?') è più diagnostica e potenzialmente cambia il consiglio in modo radicale — se la gara è già passata, tutto il piano è inutile. La domanda di A ('Hai già un allenamento programmato?') è utile ma meno discriminante. (2) B include elementi leggermente più specifici e utili dal punto di vista psicologico sportivo (parola-cue, riformulazione dell'ansia come attivazione). (3) Entrambe hanno naturalezza simile e struttura chiara. Nessuna delle due eccelle nella scoperta prima del consiglio, che è il difetto principale condiviso. | A usa bene il contesto dell’ansia pre-gara e propone azioni concrete senza pretendere di sapere l’altra chat. La domanda finale su allenamento programmato o routine da 15 minuti è abbastanza utile perché può cambiare il seguito. B è concreta, ma apre con un’ipotesi già data e chiude con una domanda tardiva e un po’ goffa sulla domenica prossima o passata, meno ad alto valore rispetto a capire allenamento, sport, livello di ansia o timing della routine.

Baseline:

Capito: oggi l’obiettivo non è eliminare l’ansia, ma iniziare a renderla gestibile in vista di domenica.

- Fai **10 minuti di respirazione**: inspira 4 secondi, espira 6, senza forzare.
- Scrivi su un foglio: **“Cosa controllo / cosa non controllo”**. Concentrati solo su preparazione, atteggiamento e prime azioni di gara.
- Fai un allenamento **normale e non compensatorio**: niente carichi extra per “recuperare” o dimostrare qualcosa.
- Prova una breve visualizzazione: immagina l’attesa, il momento di partenza e una difficoltà; poi visualizzati mentre ritorni al tuo piano con una frase semplice, ad esempio: **“Respiro, guardo, eseguo.”**

Oggi hai già un allenamento programmato oppure vuoi che ti prepari una routine precisa di 15 minuti per gestire l’ansia?

Candidate:

Se parli della gara di **domenica prossima**, oggi fai questo:

1. **Allenamento normale**, senza cercare di “recuperare” o dimostrare qualcosa.
2. Dedica **10 minuti** a scrivere:
   - cosa temi;
   - cosa puoi controllare;
   - qual è il tuo unico obiettivo di prestazione.
3. Fai una breve prova mentale: immagina il momento in cui sale l’ansia e ripeti: **“È attivazione, non un pericolo. Torno al prossimo gesto.”**
4. Scegli una sola parola-cue per la gara, ad esempio **“presente”** o **“ritmo”**.
5. Stasera cura sonno e routine, senza continuare a rimuginare sulla gara.

L’obiettivo di oggi non è eliminare l’ansia, ma allenarti a **funzionare anche quando c’è**. Ti riferisci alla prossima domenica o a una gara già passata?

### conversation-progress-beyond-routine:0:sample-1

Verdicts: candidate, candidate

Reasons: A segue il principio fondamentale della rubrica: scoperta prima del consiglio. Offre un breve reframe (la routine cerca di eliminare l'ansia invece di aiutarti a giocare con essa) che mostra comprensione senza prescrivere, poi pone una domanda diagnostica precisa che cambierebbe il consiglio successivo. B invece rovescia l'ordine: fornisce quattro consigli dettagliati prima ancora di capire dove la routine fallisce. La domanda diagnostica alla fine è quasi identica a quella di A, ma arriva dopo un muro di prescrizioni, il che la rende rituale più che genuinamente esplorativa. B somiglia molto all'anchor debole ('ecco tre azioni da fare subito') mascherato con una domanda in coda. La naturalezza conversazionale di A è nettamente superiore: è conciso, non formulaico, e crea spazio per l'atleta. B è verboso e didattico, violando il principio 'non premiare la verbosità da sola'. | A rispetta meglio il bisogno del turno: non propone subito una nuova routine, usa il contesto della routine già provata e fa una domanda diagnostica che può cambiare il consiglio successivo. B contiene elementi sensati, ma anticipa molte soluzioni prima di capire dove la routine fallisce; la domanda finale è utile ma arriva dopo un advice dump, quindi la progressione è meno efficace.

Baseline:

Capisco: è frustrante impegnarsi in una routine e sentirsi ancora bloccati dalla paura dell’errore.

- **Semplificala a 3–5 secondi:** espira lentamente, pronuncia una parola chiave (“presente”), poi focalizzati su **un solo compito tecnico**.
- **Non cercare di eliminare la paura:** riconoscila (“ho paura di sbagliare”) e torna all’azione. L’obiettivo è eseguire anche con l’ansia.
- **Allenala con errori controllati:** durante l’allenamento crea piccole situazioni di pressione e valuta solo se hai seguito il processo, non il risultato.
- **Controlla quando la usi:** se la routine parte dopo l’errore, può diventare un tentativo di “riparare”. Provala invece **prima di ogni azione**, sempre uguale.

In quale momento preciso non funziona: **prima dell’azione, durante l’esecuzione o subito dopo un errore**?

Candidate:

Capito. Probabilmente non va “riparata” aggiungendo altri passaggi: spesso una routine per la paura dell’errore fallisce perché cerca di eliminare l’ansia invece di aiutarti a giocare mentre c’è.

In quale momento smette di funzionare: **prima dell’azione, subito dopo un errore, oppure quando senti che l’errore potrebbe costarti il risultato?**

### conversation-progress-beyond-routine:1:sample-1

Verdicts: candidate, candidate

Reasons: Both responses correctly identify that the core issue is the fear of being substituted rather than the routine itself, aligning with the strong anchor. However, they differ significantly in approach. Response A provides advice but crucially ends with a high-value diagnostic question ('Il coach ti ha mai detto esplicitamente che ti sostituirà dopo un errore, oppure è una paura che anticipi tu?') that could fundamentally change the direction of coaching. This question distinguishes between a real threat and an imagined one, which is essential before giving further advice. Response A also shows better multi-turn progression by building on the earlier discovery that the routine fails 'after an error' and now drilling deeper into why. Response B gives more extensive bullet-pointed advice (bordering on verbose/formulaic), including the suggestion to talk to the coach, which is good but is presented as a directive rather than explored through discovery. B's closing question ('Vuoi preparare insieme una risposta specifica per il tuo sport?') is more of a procedural/ritual question that keeps the chat open rather than a diagnostic one. B also falls into the pattern criticized in the first turn of Conversation B - giving lists of advice before fully understanding the situation. A maintains better conversational naturalness and avoids the bullet-point-heavy format that feels more like a manual than a coaching conversation. | A identifica con precisione che il problema è la minaccia percepita di essere sostituito e non la routine, propone un rientro operativo dopo l’errore e soprattutto fa una domanda diagnostica ad alto valore: sapere se il coach lo ha detto davvero o se è un’anticipazione cambia il lavoro successivo. B è utile e include bene l’idea di chiarire le aspettative col coach, ma dà soprattutto consigli e chiude con una domanda di personalizzazione meno diagnostica rispetto al nodo centrale.

Baseline:

È comprensibile: in quel momento non temi solo l’errore, ma ciò che potrebbe significare per il tuo posto in campo.

- **Etichetta il pensiero:** “Sto avendo il pensiero che mi tolga”, non “mi toglierà”. È una previsione, non un fatto.
- **Dopo l’errore usa una risposta breve:** espira, guarda un riferimento preciso e chiediti: **“Qual è la prossima azione utile?”** Poi eseguila subito.
- **Cambia l’obiettivo:** non “non devo farmi togliere”, ma “nei prossimi 10 secondi comunico, mi muovo e faccio una scelta semplice”.
- **Parlane col coach fuori dall’allenamento:** “Quando sbaglio temo di essere tolto e mi blocco. Qual è il comportamento che vuoi vedere da me dopo un errore?” Così sostituisci l’ipotesi con informazioni reali.

Alla prossima sessione, puoi usare questa frase dopo ogni errore: **“Errore chiuso. Prossima azione.”** Vuoi preparare insieme una risposta specifica per il tuo sport?

Candidate:

Allora il problema non è la routine in sé: **dopo l’errore la tua mente lo interpreta come “adesso mi toglie”**. Finché questa minaccia resta credibile, le parole della routine non bastano.

Prova una versione più concreta, da usare **subito dopo l’errore**:

1. **Nomina il fatto:** “Ho sbagliato questa giocata.”
2. **Separa la previsione:** “Essere sostituito è una possibilità che sto immaginando, non un fatto.”
3. **Rientra nel ruolo:** “La prossima azione utile è…”
4. Fai un gesto visibile e immediato: **comunicare, rientrare in posizione, chiedere palla o aiutare un compagno**.

L’obiettivo non è convincerti che il coach sicuramente non ti toglierà, ma ricordarti: **un errore non decide da solo la tua partita; la tua reazione successiva fornisce nuove informazioni al coach.**

Il coach ti ha mai detto esplicitamente che ti sostituirà dopo un errore, oppure è una paura che anticipi tu?

### conversation-gradual-specialization:0:sample-1

Verdicts: candidate, candidate

Reasons: L'utente ha fornito un'informazione molto generica ('In gara perdo fiducia'). L'anchor forte della rubrica indica chiaramente che la risposta ideale è una domanda diagnostica prima di dare consigli. Risposta A fornisce quattro consigli concreti PRIMA di aver capito il contesto specifico dell'atleta, e solo alla fine pone una domanda diagnostica. Questo è un classico errore di coaching: dare soluzioni generiche senza prima comprendere il problema. Risposta B, invece, offre solo un breve reframe normalizzante e poi pone subito la domanda diagnostica, mantenendo la scoperta prima del consiglio. La domanda di B è essenzialmente la stessa di A, ma il fatto che B non la preceda con una lista di consigli la rende molto più efficace come strumento di coaching: l'atleta è invitato a riflettere e a fornire informazioni prima di ricevere indicazioni. B è più naturale, meno verbosa, e rispetta il principio fondamentale della rubrica (scoperta prima del consiglio). | B segue meglio l'approccio di approfondimento graduale: riconosce il problema e pone subito una domanda diagnostica che può cambiare l'intervento successivo. A è utile e pertinente, ma anticipa diversi consigli prima di capire quando e come cala la fiducia; la domanda finale è buona, però arriva dopo una lista di azioni generiche.

Baseline:

È comune: in gara la fiducia può calare quando l’attenzione si sposta dal gesto alla paura di sbagliare.

- **Riduci l’obiettivo:** pensa solo alla prossima azione, non al risultato finale.
- **Usa una parola-chiave** come “calma”, “spingi” o “presente” prima di ogni gesto.
- **Fai un reset dopo l’errore:** espira lentamente, rilassa le spalle e riparti con una routine sempre uguale.
- **Prepara una frase realistica:** “Non devo sentirmi sicuro per agire bene; devo eseguire il prossimo compito.”

In quale momento della gara perdi più fiducia: prima di iniziare, dopo un errore o quando la pressione aumenta?

Candidate:

Capita spesso: in gara la fiducia non deve essere una sensazione perfetta, ma la capacità di restare ancorato a ciò che sai fare anche quando arriva il dubbio.

Per capire dove intervenire: **perdi fiducia dopo un errore, quando senti la pressione del risultato, oppure già prima di iniziare?**

### conversation-gradual-specialization:1:sample-1

Verdicts: candidate, candidate

Reasons: Both responses incorporate the user's specific context (two consecutive errors in the final phase), but they differ significantly in approach. Response A integrates the context deeply by identifying the underlying cognitive pattern ('Adesso non posso più sbagliare') and builds a coherent 4-step routine that directly addresses the final-phase error spiral. It also adds a practical training suggestion (simulating finals after two errors), which shows genuine progression. It doesn't ask a follow-up question, but the advice is well-targeted enough that this feels natural rather than premature. Response B provides another bullet-point list (similar format to the previous turn's advice that was already given before discovery), which makes it feel repetitive and formulaic. Its follow-up question ('Qual è la tua prossima azione più importante dopo due errori: una giocata tecnica, una decisione tattica o mantenere la concentrazione?') feels somewhat ritualistic—it's a multiple-choice question that doesn't clearly change the direction of coaching. Response B also gave extensive advice in the first turn before any discovery, and continues the same pattern here, which undermines the discovery-before-advice principle across the conversation. Response A's naturalness is better: it reads like a coach speaking directly, while B reads like a formatted checklist. The rubric specifically says not to reward verbosity alone and to penalize ritual questions. B's question, while present, doesn't add high diagnostic value at this stage. | A progredisce meglio dal turno precedente: aveva chiesto quando accadeva, usa la risposta specifica dell’utente e offre un reset concreto per due errori consecutivi nel finale, senza appesantire con domande rituali. B è buona e la domanda finale può aiutare a specializzare ulteriormente il consiglio, ma arriva dopo una lista già abbastanza completa e in parte ripete indicazioni generiche già date; inoltre la domanda è utile ma non indispensabile. A è più aderente all’anchor forte e alla progressione naturale del coaching.

Baseline:

Capisco: due errori di fila, soprattutto nel finale, possono farti entrare in una spirale di dubbio proprio quando serve lucidità.

- **Dopo il secondo errore:** espira lentamente, guarda un punto preciso e pronuncia mentalmente: *“Reset. Prossima azione.”*
- **Riduci il compito:** scegli un solo obiettivo tecnico per l’azione successiva, non “devo recuperare”.
- **Nel finale:** usa una routine breve sempre uguale: respiro → parola chiave → visualizzazione del gesto → esecuzione.
- **Accetta il rischio controllato:** cerca la giocata semplice e corretta, non quella che cancella subito gli errori precedenti.

Qual è la tua prossima azione più importante dopo due errori: una giocata tecnica, una decisione tattica o mantenere la concentrazione?

Candidate:

Dopo due errori consecutivi il problema spesso non è la tecnica, ma il pensiero: **“Adesso non posso più sbagliare.”** Nel finale questo aumenta la tensione e ti fa giocare per evitare l’errore.

Prova questa routine di 10 secondi:

1. **Accetta:** “Sono due errori, è finita lì.”
2. **Reset fisico:** espira lentamente, rilassa mani e spalle.
3. **Parola chiave:** una sola, ad esempio *semplice*, *aggressivo* o *presente*.
4. **Obiettivo del prossimo gesto:** non vincere la gara; esegui solo la scelta tecnica prevista.

Allenala anche in allenamento: crea situazioni di finale dopo due errori e ripeti sempre la stessa routine. La fiducia arriverà dal vedere che sai ripartire, non dal non sbagliare.

### conversation-discovery-age:0:sample-2

Verdicts: candidate, candidate

Reasons: La rubrica premia esplicitamente la scoperta prima del consiglio: una domanda diagnostica cambia il consiglio, mentre dare consigli senza informazioni è rischioso. Risposta A si ferma correttamente prima di prescrivere qualsiasi programma, ponendo domande diagnostiche su sport, livello e infortuni. Risposta B fornisce un intero programma di allenamento dettagliato PRIMA di conoscere età, livello, sport, attrezzatura o limitazioni fisiche dell'atleta. Anche se B aggiunge domande alla fine, il danno è fatto: ha già prescritto squat, trazioni, salti esplosivi e intervalli quasi massimali a una persona di cui non conosce nulla. Questo è esattamente il pattern che la rubrica penalizza. Le domande finali di B diventano quasi rituali perché il consiglio è già stato dato. A è concisa, diretta e funzionale: non è verbosa, non usa formule rituali, e le sue domande sono ad alto valore diagnostico. L'unica debolezza di A è che non chiede esplicitamente l'età, che era un elemento chiave dello scenario 'discovery age', ma chiede il livello attuale che è comunque molto rilevante. B ha il merito di essere dettagliata e di includere avvertenze sulla sicurezza, ma il principio fondamentale di discovery-before-advice è violato. | A è nettamente migliore perché non prescrive un carico intenso prima di conoscere dati essenziali e pone domande diagnostiche utili. Tuttavia è incompleta rispetto allo scenario: mancano età, frequenza attuale e storia di allenamento. B è più articolata ma dà subito un allenamento intenso generale a un atleta di età, livello ed esperienza sconosciuti; la domanda finale arriva troppo tardi e non corregge il rischio decisionale iniziale.

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

Posso preparartelo, ma per renderlo davvero efficace e non solo massacrante mi servono due dati: **che sport pratichi e qual è il tuo livello attuale?**  
Indicami anche eventuali **infortuni o limitazioni**, se presenti.

### conversation-discovery-age:1:sample-2

Verdicts: candidate, candidate

Reasons: L'atleta ha rivelato di avere 15 anni, un anno di esperienza e due allenamenti settimanali, ma NON ha ancora indicato lo sport. Risposta B riconosce correttamente che manca ancora un'informazione cruciale (lo sport) e si astiene dal prescrivere un programma dettagliato prima di averla. Integra il contesto dell'età e del livello per calibrare il tono ('senza puntare a distruggerti'), e mantiene la scoperta aperta con una domanda mirata. Risposta A, invece, fornisce di nuovo un programma generico dettagliato prima di conoscere lo sport — ripetendo essenzialmente l'errore del turno precedente. Pur chiedendo lo sport alla fine, il danno è fatto: il consiglio è già stato dato senza informazioni sufficienti. Questo viola il principio 'scoperta prima del consiglio'. B è più naturale, concisa e coerente con una progressione multi-turn efficace. | B è preferibile perché riconosce il dato cruciale mancante, lo sport praticato, prima di prescrivere un carico: quella risposta cambierebbe davvero il programma. Usa bene il contesto di età, esperienza e frequenza per impostare prudenza e gradualità. A è più completa e prudente rispetto al carico, ma dà comunque una seduta generica prima di sapere la disciplina, quindi anticipa il consiglio rispetto alla discovery necessaria.

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

Per prepararti un allenamento preciso mi manca solo una cosa: **che sport pratichi?**  

A 15 anni, con un anno di esperienza e due allenamenti settimanali, possiamo aumentare l’intensità gradualmente, ma senza puntare a “distruggerti”: l’obiettivo è migliorare senza sovraccaricarti.

### conversation-discovery-food:0:sample-2

Verdicts: candidate, candidate

Reasons: L'atleta ha chiesto un menu senza fornire alcun vincolo. Il principio cardine della rubrica è 'scoperta prima del consiglio': senza conoscere sport, obiettivo, orari, preferenze alimentari, intolleranze, un menu generico rischia di essere inutile o controproducente. Risposta A fornisce immediatamente un menu completo e dettagliato, relegando le domande diagnostiche a una riga finale quasi accessoria ('Che sport pratichi e quante volte ti alleni?'). Questo inverte la sequenza corretta: il consiglio arriva prima della scoperta, e la domanda finale perde forza perché l'atleta ha già ricevuto ciò che voleva e potrebbe non rispondere. Risposta B invece si ferma correttamente prima di dare consigli, ponendo 4 domande diagnostiche ad alto valore (sport/frequenza, giorni/orari, obiettivo, allergie/preferenze). Ognuna di queste domande cambierebbe concretamente il menu risultante, quindi non sono rituali ma diagnostiche. B è concisa, naturale e imposta una progressione multi-turn efficace. La rubrica dice esplicitamente di non premiare la verbosità da sola, e il menu dettagliato di A, pur impressionante, è verbosità non supportata da contesto. | B è nettamente migliore per questo scenario di discovery: prima di costruire un menu raccoglie informazioni che cambiano davvero il consiglio, come sport, frequenza, orari, obiettivo e vincoli alimentari. A risponde subito con un menu generico e solo alla fine riconosce che servirebbero dati per personalizzarlo; questo riduce molto la qualità della scoperta e della progressione, anche se il contenuto è ordinato e pertinente in modo generale.

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

Certo. Per prepararti un menu settimanale davvero adatto agli allenamenti, dimmi:

1. Che sport pratichi e quante volte ti alleni?
2. In quali giorni e orari ti alleni?
3. Qual è il tuo obiettivo: energia, aumento massa, dimagrimento o mantenimento?
4. Hai allergie, intolleranze o preferenze alimentari?

Con queste informazioni ti preparo pasti, spuntini e indicazioni pre/post allenamento.

### conversation-discovery-food:1:sample-2

Verdicts: baseline, candidate

Reasons: Both responses provide a full vegetarian weekly menu adapted to the 19:00 training time, which is appropriate given that the user explicitly asked for a menu and provided two key constraints. Both also ask a follow-up question at the end. However, B is slightly better for several reasons: (1) Context use: B better integrates the 19:00 training time into practical advice (e.g., specific guidance about avoiding heavy foods close to training, noting that skipping carbs post-workout isn't necessary), while A's practical notes are more generic. (2) Question quality: B asks whether the user is ovo-lacto-vegetarian or vegan, which is a more immediately actionable diagnostic question that would directly change the menu content. A asks about the training objective (mass, weight loss, etc.), which is also valuable but less urgent given the menu already provided. B's question is more targeted because the current menu includes eggs and dairy, and if the user is vegan, the entire menu needs revision. (3) Conversational naturalness: B's opening is more concise and structured ('organizza i pasti così'), while A is slightly more verbose. (4) Both responses jump to giving a full menu before completing discovery (neither knows the sport, frequency, or goals), so both score modestly on discovery-before-advice. B edges ahead because its follow-up question is more diagnostic and immediately relevant to the advice already given. | Entrambe usano bene i due dati nuovi, cioè vegetariana e allenamento alle 19, e impostano correttamente spuntino pre-allenamento e cena di recupero. A è leggermente preferibile perché dichiara l'assunzione ovo-latto-vegetariana e chiude con una domanda diagnostica sull'obiettivo, che cambierebbe davvero composizione e quantità del menu. B è più snella e naturale, ma chiede solo alla fine se la dieta sia anche vegana dopo aver già proposto uova e latticini; la domanda è utile, ma arriva tardi rispetto al consiglio dato. Entrambe avrebbero potuto fare più discovery su sport, durata, intensità e frequenza prima di un menu completo.

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

Ecco un esempio di **menu settimanale vegetariano**, pensato per allenarti alle **19:00**. È impostato come dieta **ovo-latto-vegetariana**; le porzioni vanno adattate a fame, corporatura e obiettivo.

### Schema nei giorni di allenamento
- **Colazione:** carboidrati + proteine  
- **Pranzo:** cereali + legumi/proteine + verdure  
- **Spuntino pre-allenamento, ore 16:30–17:30:** facilmente digeribile  
- **Cena post-allenamento:** proteine + carboidrati + verdure  

## Menu settimanale

| Giorno | Colazione | Pranzo | Spuntino pre-allenamento | Cena post-allenamento |
|---|---|---|---|---|
| **Lunedì** | Yogurt greco, fiocchi d’avena, banana e noci | Pasta integrale con ceci e pomodorini, insalata | Banana + 2–3 gallette con crema di arachidi | Frittata con 2–3 uova, patate al forno e verdure |
| **Martedì** | Pane integrale, ricotta e miele, frutta | Riso basmati con tofu, zucchine e carote | Yogurt + frutta secca o una fetta di pane con marmellata | Pasta al pomodoro, lenticchie e verdure |
| **Mercoledì** | Porridge con latte, avena, mela e cannella | Cous cous con feta, ceci e verdure | Frutto + yogurt o kefir | Burger vegetale, pane integrale e insalata con mais |
| **Giovedì** | Yogurt, muesli e frutti di bosco | Farro con mozzarella, pomodorini e fagioli | Toast piccolo con miele o marmellata | Tofu o tempeh, riso e verdure saltate |
| **Venerdì** | Pane integrale con crema di arachidi e banana | Pasta con ragù di lenticchie, verdure | Banana o 2–3 gallette di riso | Omelette con formaggio, pane e verdure grigliate |
| **Sabato** | Pancake d’avena con yogurt e frutta | Insalata di quinoa con edamame, avocado e verdure | Yogurt con cereali semplici | Pizza vegetariana, preferibilmente con verdure e una fonte proteica |
| **Domenica** | Latte o bevanda vegetale, cereali e frutta | Lasagne vegetariane o pasta al forno con legumi, contorno | Frutto + una manciata di frutta secca | Zuppa di legumi con pane e fiocchi di latte o parmigiano |

### Dopo l’allenamento
Cerca di cenare entro circa un’ora, includendo:
- una fonte proteica: **uova, tofu, tempeh, legumi, yogurt greco, ricotta o formaggi freschi**;
- una fonte di carboidrati: **riso, pasta, pane, patate o cereali**;
- verdure e acqua.

Se l’allenamento è intenso o dura più di un’ora, può essere utile rendere lo spuntino pre-allenamento più consistente. Qual è il tuo obiettivo: **aumentare energia, mantenere il peso, dimagrire o aumentare massa muscolare**?

### conversation-discovery-home:0:sample-2

Verdicts: candidate, candidate

Reasons: A fornisce immediatamente una scheda generica senza alcuna fase di scoperta: non chiede obiettivo, attrezzatura disponibile, livello di esperienza, limitazioni fisiche o giorni disponibili. La domanda finale ('Vuoi una scheda specifica per forza, dimagrimento...?') arriva dopo aver già dato il consiglio, invertendo completamente il processo di coaching. B invece si ferma prima di prescrivere e pone tre domande diagnostiche ad alto valore (obiettivo, attrezzatura, frequenza settimanale) che cambierebbero radicalmente la scheda risultante. Questo è esattamente il comportamento atteso da un coach competente: la scoperta deve precedere il consiglio. B è conciso, diretto e senza formule rituali. | B è preferibile perché prima di costruire la scheda raccoglie informazioni che cambiano davvero il programma: obiettivo, attrezzatura e frequenza. A è naturale e offre una proposta sensata e prudente per casa, ma salta quasi del tutto la fase di scoperta e dà una scheda generica prima di sapere vincoli e obiettivi; la domanda finale è utile ma incompleta e arriva tardi.

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

Certo. Per fartela davvero adatta, dimmi: **qual è il tuo obiettivo** (forza, dimagrimento, esplosività, resistenza o sport specifico), **che attrezzatura hai** e **quanti giorni a settimana** vuoi allenarti?

### conversation-discovery-home:1:sample-2

Verdicts: baseline, baseline

Reasons: Entrambe le risposte commettono lo stesso errore fondamentale: forniscono una scheda completa senza aver prima chiesto l'obiettivo dell'utente (che nella conversazione B era stato chiesto al turno precedente ma mai risposto dall'utente). L'utente ha detto solo 'Ho solo elastici e posso farla tre giorni' — manca ancora l'obiettivo, il livello di esperienza, eventuali limitazioni fisiche. Entrambe saltano alla prescrizione. Tuttavia, A si distingue per alcuni aspetti: (1) La domanda finale di A ('Che tipo di elastici hai: a fascia lunga, loop corto o con maniglie?') è diagnostica e concreta — il tipo di elastico cambia effettivamente gli esercizi possibili (ancoraggio, resistenza, esercizi fattibili). (2) La struttura di A (spinta/tirata/gambe) è più coerente con l'anchor forte che suggeriva proprio questa suddivisione. (3) B non pone alcuna domanda alla fine, chiudendo la conversazione senza ulteriore scoperta. B include una sezione 'Come progredire' utile ma generica, e la sua struttura dei giorni è meno chiara nella logica di suddivisione (Giorno A 'Forza generale' e Giorno B 'Gambe e parte superiore' si sovrappongono). Nessuna delle due è eccellente nella scoperta prima del consiglio, ma A almeno mantiene aperta la conversazione con una domanda diagnostica rilevante. | A è preferibile perché usa meglio il contesto degli elastici e dei tre giorni, struttura le sedute in modo più coerente e chiude con una domanda diagnostica utile sul tipo di elastici, che può modificare gli esercizi. B è utilizzabile e include una buona progressione, ma ignora del tutto la scoperta residua, non fa domande e contiene anche un refuso evidente nel riscaldamento. Entrambe avrebbero dovuto chiedere l'obiettivo, dato che l'utente non lo ha specificato.

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

Certo. Ti propongo una **scheda full body 3 giorni**, usando solo elastici. Lascia almeno **un giorno di recupero** tra gli allenamenti, ad esempio lunedì–mercoledì–venerdì.

## Riscaldamento — 5-7 minuti
- Marcia o corsetta sul posto: 2’
- Circonduzioni delle braccia: 30”
- Squat a corpo libero:  inte 15
- Ponte glutei: 15
- Aperture con elastico leggero: 15

## Giorno A — Forza generale
Fai **3 serie** per esercizio, recuperando 60-90”.

1. Squat con elastico — 10-15 ripetizioni  
2. Rematore con elastico — 12-15  
3. Ponte glutei con elastico — 15-20  
4. Spinte sopra la testa — 10-12  
5. Affondi indietro — 8-12 per gamba  
6. Plank — 30-45”

## Giorno B — Gambe e parte superiore
Fai **3 serie**, recupero 60-90”.

1. Stacco rumeno con elastico — 10-15  
2. Push-up oppure chest press con elastico — 8-15  
3. Camminata laterale con elastico — 10-15 passi per lato  
4. Tirate al viso — 12-15  
5. Squat isometrico al muro — 30-45”  
6. Dead bug — 8-12 per lato  

## Giorno C — Total body e controllo
Fai **3-4 serie**, recupero 60-90”.

1. Squat con spinta sopra la testa — 10-12  
2. Rematore a un braccio — 10-12 per lato  
3. Affondo statico — 10 per gamba  
4. Aperture dell’elastico — 15-20  
5. Stacco su una gamba — 8-10 per lato  
6. Plank laterale — 20-35” per lato  

### Come progredire
Quando completi facilmente il numero massimo di ripetizioni:
- usa un elastico più duro;
- aumenta lentamente la tensione;
- aggiungi una serie;
- rallenta la discesa contando 3 secondi.

Mantieni sempre il movimento controllato e interrompi l’esercizio se compare dolore acuto.

### conversation-clarify-ambiguous:0:sample-2

Verdicts: candidate, candidate

Reasons: L'utente ha inviato un messaggio altamente ambiguo ('Quando parte mi si chiude tutto'). L'anchor forte mostra chiaramente che la risposta ideale è una domanda diagnostica prima di qualsiasi consiglio. Risposta A fornisce tre consigli concreti PRIMA di aver chiarito il problema, poi aggiunge una domanda diagnostica alla fine. Questo inverte l'ordine corretto: la scoperta deve precedere il consiglio. Dare consigli su respirazione e gesto tecnico senza sapere se il problema è fisico, mentale o respiratorio è prematuro e potenzialmente fuorviante. Risposta B invece si astiene dal dare consigli, riconosce brevemente il blocco e pone una domanda diagnostica ben strutturata che copre tre dimensioni (respiro, corpo, mente) e anche la temporalità (inizio gara vs. prima). Questa è una domanda ad alto valore che cambierebbe effettivamente il consiglio successivo. B è più naturale, più disciplinata nel processo di scoperta e meglio posizionata per una progressione multi-turn efficace. | B gestisce meglio l'ambiguità: prima chiarisce se il blocco riguarda respiro, corpo o mente e aggiunge una domanda utile sul timing. A riconosce bene il momento di blocco e pone una domanda diagnostica valida, ma offre tre consigli prima di capire il problema, rischiando indicazioni premature.

Baseline:

Capito: sembra un blocco proprio al momento di iniziare.  

- Prima della partenza, fai un’espirazione lenta di 6–8 secondi.  
- Concentrati solo sul primo gesto tecnico, non su tutta la prestazione.  
- Ripetiti: “Parto piano, poi entro nel ritmo.”  

Quando dici “mi si chiude tutto”, intendi che ti blocchi mentalmente oppure che senti chiusura fisica a petto o gola?

Candidate:

Sembra un blocco che arriva proprio al momento di iniziare. Per capire come aiutarti: **quando dici “mi si chiude tutto”, intendi soprattutto il respiro, il corpo o la mente? E succede all’inizio della gara/azione o già prima?**

### conversation-clarify-ambiguous:1:sample-2

Verdicts: candidate, candidate

Reasons: Both responses jump to advice before fully exploring the issue, but they differ in degree. Response A provides practical breathing techniques tailored to the context (respiro che si chiude alla partenza), then asks a genuinely diagnostic follow-up question about whether the athlete can still breathe or feels completely blocked — this could meaningfully change the coaching direction. Response B is more verbose and clinical, listing medical disclaimers, medication references, and multiple scenarios (broncocostrizione, farmaci inalatori) that feel premature and overly medicalized given the information available. B's closing question (allenamento vs gare, tosse/fischi) is decent but comes after a wall of prescriptive advice that undermines the discovery-before-advice principle. A is closer to the strong anchor: it focuses on the exhalation technique and a simple cue for the first seconds, while B reads more like a medical pamphlet. Neither response fully embodies the discovery-first approach — both give substantial advice before asking their diagnostic questions — but A is more natural, concise, and contextually appropriate. | A segue meglio la progressione: prima aveva chiarito l’ambiguità, ora usa la risposta dell’atleta per proporre un intervento mirato su espirazione, partenza controllata e frase-segnale, aggiungendo una domanda diagnostica realmente rilevante sulla gravità del blocco respiratorio. B contiene una buona domanda finale e indicazioni mediche prudenti, ma nel complesso è più direttiva e medicalizzata, e nella conversazione precedente aveva già dato consigli prima di chiarire il significato di “mi si chiude tutto”.

Baseline:

Capito: la sensazione di respiro che si “chiude” all’inizio della gara va presa sul serio, perché può dipendere da partenza troppo intensa, ansia o broncocostrizione da sforzo.

- **Se succede:** rallenta o fermati, esci dalla competizione e cerca aria; non forzare il ritmo.  
- **Respira lentamente:** inspira dal naso per 2–3 secondi ed espira a labbra socchiuse per 4–6 secondi.  
- **Prevenzione:** fai un riscaldamento progressivo di 10–15 minuti, evitando uno scatto immediato.  
- **Controllo medico:** se hai sibili, tosse, dolore/oppressione al petto, capogiri o il respiro non migliora rapidamente, interrompi e chiedi assistenza; programma una valutazione medica, soprattutto se si ripete. Usa eventuali farmaci inalatori solo secondo il piano già indicato da un medico.

Succede anche in allenamento o solo nelle gare, e compare con tosse o fischi?

Candidate:

Capito. In quel momento il corpo probabilmente entra subito in **allarme**, e il respiro diventa corto e rigido. Prova questa sequenza:

- **Prima della partenza:** inspira normalmente dal naso per 3 secondi, poi espira lentamente per 5–6. Ripeti 3 volte.
- **Nei primi secondi:** non cercare di fare un respiro enorme; pensa a **“espirare morbido”** e parti leggermente più controllato.
- Usa una frase semplice: **“Lascio uscire l’aria, poi entro nel ritmo.”**
- Se senti il blocco, rallenta appena per 5–10 secondi e allunga l’espirazione, senza lottare per inspirare.

Una domanda importante: **riesci comunque a respirare, anche se con fatica, oppure senti proprio di non riuscire a far passare l’aria?** Se compaiono forte difficoltà respiratoria, dolore al petto, sibilo o sensazione di svenimento, interrompi e chiedi assistenza.

### conversation-no-ritual-question:0:sample-2

Verdicts: tie, candidate

Reasons: Entrambe le risposte forniscono una frase breve e funzionale da ripetere prima del servizio, in linea con la richiesta dell'utente. Nessuna delle due fa domande diagnostiche per capire il contesto specifico dell'utente (livello, sport esatto, problema specifico al servizio, stato emotivo), il che limita la personalizzazione. Entrambe sono strutturate in modo quasi identico: tre elementi ritmici (respiro + elemento mentale + azione decisiva). La differenza tra 'mi concentro' (A) e 'mi fido' (B) è minima e stilistica. Nessuna delle due apre una progressione multi-turn né usa contesto pregresso. Rispetto all'anchor forte ('Respiro, guardo il bersaglio, lascio andare il braccio'), entrambe sono leggermente meno specifiche sul piano tecnico (l'anchor forte include un riferimento visivo concreto e un rilascio muscolare), ma comunque accettabili come frasi pre-servizio. Nessuna delle due è chiaramente superiore all'altra. | Entrambe rispondono direttamente alla richiesta senza aggiungere domande rituali, che qui non servivano. A è leggermente più specifica sul servizio usando “servo”, ma resta più generica con “mi concentro”. B è più naturale e adatta come frase-mantra breve: “mi fido” aiuta a ridurre controllo e tensione prima del gesto, anche se “colpisco” è un po’ meno specifico del servizio.

Baseline:

Respiro, mi concentro e servo con decisione.

Candidate:

«Respiro, mi fido e colpisco con decisione.»

### conversation-no-ritual-question:1:sample-2

Verdicts: tie, baseline

Reasons: Entrambe le risposte sono appropriate e naturali per il contesto. L'utente ha semplicemente ringraziato per una frase pronta, e in questo caso la risposta corretta è un breve riconoscimento senza forzare domande rituali o aggiungere consigli non richiesti. Entrambe si allineano bene con l'anchor forte ('Di nulla') e evitano l'errore dell'anchor debole (proporre azioni non richieste). A aggiunge 'buon servizio!' che è un tocco contestuale leggermente più ricco; B aggiunge un'emoji. Entrambe sono essenzialmente equivalenti in qualità. Nessuna delle due pone domande, il che è appropriato dato che l'utente non ha espresso bisogno di ulteriore esplorazione. Non c'è motivo di premiare una sull'altra. | Entrambe rispondono in modo naturale e senza aggiungere domande rituali inutili. A è leggermente migliore perché richiama il contesto specifico del servizio e chiude la conversazione con un augurio pertinente; B è corretta ma più generica.

Baseline:

Di nulla, buon servizio!

Candidate:

Di nulla! 💪

### conversation-known-thread-fact:0:sample-2

Verdicts: candidate, candidate

Reasons: Entrambe le risposte forniscono consigli prima di aver fatto una vera scoperta diagnostica, il che è un difetto condiviso. Tuttavia, B è significativamente migliore per diversi motivi: (1) La domanda finale di B ('Qual è il momento in cui ti blocchi di più: prima di lanciare la palla, durante il lancio o quando devi colpirla?') è una domanda diagnostica ad alto valore, molto vicina all'anchor forte, che cambierebbe concretamente il consiglio successivo. La domanda di A ('quale parte della routine vuoi provare per prima: respiro, lancio o bersaglio?') è più una domanda di implementazione/preferenza che non modifica la comprensione del problema. (2) B è più concisa e meno prescrittiva: offre una mini-routine breve e poi chiede di capire meglio il blocco. A invece scarica quattro blocchi di consigli dettagliati prima di qualsiasi domanda, comportandosi quasi come l'anchor debole. (3) La naturalezza conversazionale di B è superiore: è più leggera, meno da manuale, e il flusso consiglio-breve → domanda-diagnostica è più equilibrato. A è troppo verbose e strutturata per un primo turno di coaching. (4) La progressione multi-turn di B è migliore perché la domanda diagnostica apre uno spazio per personalizzare davvero il lavoro successivo, mentre A ha già esaurito gran parte dei consigli possibili. | B è preferibile perché include una domanda diagnostica realmente utile: capire se il blocco avviene prima del lancio, durante il lancio o al contatto cambia il tipo di intervento. Anche se dà consigli prima di esplorare, la domanda finale apre una progressione più mirata. A offre buoni suggerimenti pratici e contestualizzati, ma la domanda finale è più una scelta operativa tra elementi della routine che una vera diagnosi del blocco.

Baseline:

È comprensibile: la battuta può sembrare un momento in cui tutta l’attenzione è su di te, ma si può allenare come una routine.

- **Crea una routine di 5 secondi:** espira lentamente, guarda il punto scelto, fai rimbalzare la palla sempre lo stesso numero di volte.
- **Pensa a un solo obiettivo tecnico**, ad esempio: “lancio davanti alla spalla”, non “non devo sbagliare”.
- **Scegli una zona ampia e sicura** del campo: prima cerca continuità, poi precisione.
- **Allenati con pressione graduale:** 10 battute da solo, poi con un compagno che osserva, infine simulando il punteggio reale. Dopo ogni errore ripeti la routine senza commentarti negativamente.

Alla prossima partita, quale parte della routine vuoi provare per prima: respiro, lancio o bersaglio?

Candidate:

È abbastanza comune: spesso il blocco nasce dal tentativo di **non sbagliare**, invece che dal concentrarsi sul gesto.

Prima della battuta prova questa mini-routine:

1. Espira lentamente.
2. Guarda un punto preciso del campo.
3. Ripeti una sola parola chiave: **“fluida”** o **“alta”**.
4. Esegui la battuta senza aggiungere altri pensieri.

Qual è il momento in cui ti blocchi di più: **prima di lanciare la palla, durante il lancio o quando devi colpirla**?

### conversation-known-thread-fact:1:sample-2

Verdicts: baseline, candidate

Reasons: Both responses provide structured weekly plans that build on the volleyball serving context from the previous turn. However, they differ significantly in key coaching dimensions. Response A delivers a comprehensive 7-day plan but ends without any question, missing an opportunity to gather critical diagnostic information (e.g., what type of serve the athlete uses, which would fundamentally change the technical advice). Response B also provides a structured plan but crucially ends with a high-value diagnostic question: 'quale battuta esegui: dal basso, flottante o in salto?' This is not a ritual question—it would genuinely change the coaching advice in subsequent turns. Response B also better integrates the context from the previous turn (referencing the routine elements already discussed like rimbalzare la palla, bersaglio) and progresses more naturally by adding the observation element (Giorno 4 with a companion/coach). Response A is more verbose without proportionally more value, and its lack of any question represents a missed coaching opportunity. Both responses could have done more discovery before diving into advice, but B at least asks a meaningful question at the end. | A è leggermente migliore perché sviluppa il lavoro settimanale attorno alla routine pre-battuta già introdotta e soprattutto sposta la misurazione sul completamento della routine e sul livello di tensione, non solo sull’esito della battuta. Questo aderisce meglio al bisogno dell’atleta che si blocca. B è valido e contiene una domanda finale utile sul tipo di battuta, ma la domanda arriva dopo un piano già dato e quindi non guida davvero il consiglio; inoltre include più conteggio delle battute riuscite, rischiando di riportare l’attenzione sul risultato.

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

Questa settimana lavora su **routine e fiducia**, non solo sulla precisione.

### Piano di 7 giorni

**Ogni giorno – 5 minuti**
- 5 respiri lenti, con espirazione lunga.
- Visualizza 5 battute eseguite con ritmo tranquillo.
- Scegli una parola chiave: *“fluida”*, *“decisa”* o *“bersaglio”*.
- Ripeti sempre la stessa routine: **respiro → sguardo al bersaglio → lancio → colpo**.

**Allenamento 1: controllo**
- 20 battute senza pensare al risultato.
- Dai un punto a ogni esecuzione in cui rispetti la routine, anche se la palla non entra.
- Se il lancio è sbagliato, riprendi la palla e ricomincia: niente colpi affrettati.

**Allenamento 2: sicurezza**
- Parti da una distanza o da una battuta che riesci a gestire bene.
- Fai serie da 5: obiettivo almeno 3 battute regolari.
- Poi aumenta gradualmente difficoltà o profondità.

**Allenamento 3: pressione controllata**
- Simula il punteggio: devi battere sul 23-23 o dopo un errore.
- Prima di ogni battuta usa la routine completa.
- Se sbagli, non cambiare tecnica immediatamente: ripeti la stessa parola chiave e prova di nuovo.

**Prima della partita**
Decidi in anticipo un obiettivo semplice:  
**“Eseguo la mia routine e colpisco con decisione.”**  
Non puntare a “non sbagliare”: aumenta il blocco.

Dopo ogni allenamento annota solo due cose: **quanto hai rispettato la routine** e **quanto eri teso da 1 a 10**. Il successo della settimana è sentirti più libero, non fare tutte le battute perfette.

### conversation-identity-correction:0:sample-2

Verdicts: tie, tie

Reasons: Entrambe le risposte sono quasi identiche: riconoscono correttamente il cambio di identità (da Paolo a Marta), non danno consigli prematuri e chiudono con una domanda aperta generica. La differenza tra 'Come posso aiutarti?' (A) e 'Di cosa hai bisogno?' (B) è trascurabile — entrambe sono domande di apertura ragionevoli ma non diagnostiche. Nessuna delle due aggiunge valore significativo rispetto all'altra. Entrambe si allineano bene con l'anchor forte (riconoscimento dell'identità senza precipitarsi nei consigli). Nessuna delle due pone una domanda ad alto valore diagnostico, ma in questo contesto iniziale è accettabile — non c'è ancora abbastanza informazione per fare domande più mirate. | Entrambe le risposte recepiscono correttamente la correzione d’identità e confermano che oggi l’interlocutrice è Marta, non Paolo. Non danno consigli prematuri e aprono la conversazione in modo semplice. La domanda è utile per avviare il turno successivo, ma resta generica e non diagnostica; in questo contesto però è sufficiente, perché l’unica informazione nuova era la correzione dell’identità.

Baseline:

Ciao Marta, ricevuto: oggi parlerò con te, non con Paolo. Di cosa hai bisogno?

Candidate:

Ciao Marta, ricevuto: oggi parlo con te, non con Paolo. Come posso aiutarti?

### conversation-identity-correction:1:sample-2

Verdicts: candidate, candidate

Reasons: Entrambe le risposte commettono lo stesso errore fondamentale: forniscono consigli dettagliati prima di aver fatto alcuna domanda diagnostica. La domanda viene posta solo alla fine, dopo aver già scaricato 4 punti di consiglio generico. Questo è l'opposto dell'approccio dell'anchor forte, che pone subito una domanda mirata per capire dove si manifesta la paura. Detto ciò, B è leggermente migliore per diversi motivi: (1) la domanda finale di B è più ampia e diagnostica, includendo anche la dimensione del giudizio degli altri e i momenti decisivi, il che potrebbe cambiare significativamente il consiglio successivo; (2) i consigli di B sono leggermente più specifici al basket (smarcarsi, difendere, tagliare, comunicare) rispetto ad A che resta più generico; (3) B ha un'apertura concettuale più incisiva ('il problema nasce quando provi a non sbagliare') che è meno formulaica del 'può bloccarti proprio quando vuoi dare il meglio' di A. Entrambe usano il nome Marta e il contesto basket, ma nessuna delle due eccelle nella scoperta prima del consiglio. | Entrambe le risposte danno consigli prima di fare una domanda diagnostica, quindi non seguono l'anchor forte e perdono punti su scoperta prima del consiglio. A usa bene la correzione d'identità chiamando l'utente Marta, ma il consiglio è abbastanza generico e la domanda finale mescola gesti tecnici e contesto di partita. B è più specifica per il basket, con esempi concreti di azioni controllabili, e la domanda finale distingue meglio situazioni e cause possibili della paura, quindi cambierebbe più facilmente il coaching successivo. Per questo B è leggermente preferibile.

Baseline:

Capisco, Marta: la paura di sbagliare può bloccarti proprio quando vuoi dare il meglio.

- **Prima dell’azione:** fai un respiro lento e pensa a una sola parola-chiave, come “attacca” o “presente”.
- **Cambia obiettivo:** non “non devo sbagliare”, ma “faccio la scelta giusta e aggressiva”.
- **Dopo un errore:** usa una routine di 3 secondi: riconosci (“errore”), resetta con un respiro, poi concentrati sulla prossima azione.
- **Allenati alla pressione:** durante gli allenamenti chiedi situazioni simulate di partita e valuta l’impegno, non solo il risultato.

In quale situazione senti più paura: tiro, passaggio, palleggio o partita?

Candidate:

La paura di sbagliare è normale: il problema nasce quando provi a **non sbagliare**, invece di concentrarti sull’azione.

Prova così in partita:

1. **Prima dell’azione:** un respiro lento e una parola chiave: *“aggressiva”*, *“presente”* o *“semplice”*.
2. **Obiettivo controllabile:** non “devo segnare”, ma “mi smarco bene”, “difendo forte”, “passo deciso”.
3. **Dopo l’errore:** niente giudizi. Dì mentalmente: *“È fatta. Prossima azione”* e cerca subito un compito concreto: rientrare, difendere, tagliare, comunicare.
4. **Allenamento:** chiediti dopo ogni errore: *“Cosa posso fare adesso?”*

Quando senti più paura: prima della partita, durante i tiri, nei momenti decisivi o quando temi il giudizio degli altri?

### conversation-cross-chat-transparency:0:sample-2

Verdicts: tie, baseline

Reasons: Entrambe le risposte sono funzionalmente quasi identiche: dichiarano correttamente di non avere accesso all'altra chat (trasparenza), evitano di inventare consigli senza contesto (discovery before advice), e chiedono all'utente di riassumere obiettivo, allenamento previsto e stato fisico. La qualità della domanda è buona in entrambi i casi: chiedono tre informazioni concrete (obiettivo, allenamento, stato fisico) che effettivamente cambierebbero il consiglio. B è leggermente più naturale nella formulazione ('come stai oggi' è più colloquiale di 'stato fisico'), ma A separa meglio la trasparenza dalla richiesta con un paragrafo dedicato. Le differenze sono marginali e non giustificano una preferenza netta. Nessuna delle due cade nella trappola dell'anchor debole (dare consigli senza contesto), ed entrambe si allineano bene all'anchor forte. | Entrambe riconoscono correttamente di non avere accesso all'altra chat e fanno una richiesta diagnostica utile prima di dare consigli. A è leggermente preferibile perché formula meglio il bisogno di contesto e promette un piano concreto per oggi; la richiesta su obiettivo, allenamento previsto e stato fisico è mirata e sport-specifica. B è quasi equivalente, ma 'come stai oggi' è un po' meno preciso di 'stato fisico' e la progressione è appena meno concreta.

Baseline:

Non posso vedere il contenuto dell’altra chat, quindi mi manca il contesto per dirti cosa fare oggi.

Incolla qui l’ultimo messaggio o riassumi obiettivo, allenamento previsto e stato fisico: ti preparo subito un piano concreto per oggi.

Candidate:

Non posso vedere l’altra chat da questa conversazione. Incollami qui gli ultimi messaggi o riassumimi obiettivo, allenamento previsto e come stai oggi: ti dirò subito cosa fare.

### conversation-cross-chat-transparency:1:sample-2

Verdicts: candidate, candidate

Reasons: Entrambe le risposte commettono lo stesso errore fondamentale: forniscono un piano dettagliato e prescrittivo senza aver prima scoperto informazioni essenziali (quale sport? quale livello? che tipo di ansia? cosa era stato discusso nell'altra chat? c'è un allenamento previsto oggi?). Tuttavia B è leggermente migliore per diversi motivi: (1) La domanda finale di B ('Qual è l'allenamento previsto oggi: riposo, allenamento leggero o seduta intensa?') è più diagnostica e concreta rispetto a quella di A ('vuoi che ti costruisca una routine precisa?'), che è più una domanda di servizio/rituale. La domanda di B cambierebbe effettivamente il consiglio dato. (2) B riconosce esplicitamente di non avere i dettagli dell'altra chat, mantenendo la trasparenza cross-chat. (3) Il piano di B è leggermente più strutturato e operativo (punto 4 con l'annotazione post-allenamento è particolarmente utile). (4) B è un po' più naturale nel tono, meno formulaico. Entrambe però peccano gravemente nella scoperta prima del consiglio: avrebbero dovuto fare 2-3 domande chiave prima di prescrivere un piano così dettagliato. | B è preferibile perché usa bene il contesto dell’ansia pre-gara, mantiene trasparenza sul fatto di non vedere l’altra chat e propone un piano concreto senza essere troppo generico. Soprattutto, chiude con una domanda diagnostica utile — riposo, leggero o intenso — che può davvero modificare il consiglio. A è valido e pratico, ma assume più facilmente che ci sia allenamento oggi e la domanda finale è più una proposta di continuazione che una raccolta di informazione ad alto valore.

Baseline:

Capito: oggi l’obiettivo non è eliminare l’ansia, ma renderla gestibile e trasformarla in preparazione concreta per domenica.

- **Fai un allenamento normale o leggermente ridotto**, senza testarti né cercare conferme sulla forma.
- **Scrivi per 5 minuti**: “Cosa temo?” e accanto “Cosa posso controllare oggi?”. Scegli solo 1–2 azioni controllabili.
- **Prova una routine pre-gara breve**: 5 respiri lenti, una frase-guida come *“Mi concentro sul prossimo gesto”*, poi visualizza i primi minuti della gara.
- **Stasera prepara il necessario** e stabilisci un orario realistico per dormire: meno decisioni domenica significa meno spazio all’ansia.

Oggi hai allenamento: vuoi che ti costruisca una routine precisa per prima, durante e dopo?

Candidate:

Certo. Non vedo però i dettagli dell’altra chat, quindi riparto dal punto chiave: **oggi non devi eliminare l’ansia, ma allenarti a gestirla**.

Per oggi:

1. **Allenamento normale**, senza compensare né dimostrare qualcosa. Mantieni intensità e durata previste.
2. Prima di iniziare, scrivi:
   - obiettivo controllabile: *“eseguo bene il primo compito”*;
   - frase utile: *“Posso essere agitato e rendere comunque bene.”*
3. Fai **5 minuti di respirazione tranquilla**, con espirazione leggermente più lunga dell’inspirazione.
4. Dopo l’allenamento annota solo tre cose: cosa ha funzionato, quando è salita l’ansia, quale risposta vuoi ripetere domenica.
5. Stasera prepara il necessario per la gara e poi **chiudi il tema**: niente analisi ripetute.

Qual è l’allenamento previsto oggi: riposo, allenamento leggero o seduta intensa?

### conversation-progress-beyond-routine:0:sample-2

Verdicts: candidate, candidate

Reasons: L'atleta dice che la routine non funziona. L'anchor forte mostra che la risposta ideale è una domanda diagnostica prima di qualsiasi consiglio. Risposta A fornisce quattro consigli dettagliati prima di porre la domanda diagnostica, invertendo l'ordine corretto: prima scoperta, poi consiglio. La domanda finale è buona ma arriva dopo un muro di suggerimenti non richiesti, il che riduce drasticamente il suo valore diagnostico — l'atleta potrebbe sentirsi già 'consigliato' e non esplorare davvero il problema. Risposta B invece offre una breve ipotesi contestualizzata (la routine potrebbe essere troppo lunga, arrivare troppo tardi, o mirare a eliminare la paura) che normalizza il problema senza prescrivere soluzioni, e poi pone la stessa domanda diagnostica in modo pulito. Questo rispetta il principio 'scoperta prima del consiglio' e crea una progressione multi-turn molto più efficace. B è concisa, naturale e diagnostica; A è verbosa e prematuramente prescrittiva. | B segue molto meglio lo scenario: riconosce che la routine non sta funzionando, evita di proporne subito un'altra e pone una domanda diagnostica concreta che può cambiare il consiglio successivo. A include una buona domanda finale, ma prima dà una lista di interventi generici; questo riduce la scoperta prima del consiglio e rischia di ripetere il problema dell'atleta, cioè aggiungere un'altra routine senza capire dove fallisce quella attuale.

Baseline:

Capisco: è frustrante quando una routine dovrebbe aiutarti ma finisce per aggiungere pressione.

- **Non cercare di eliminare la paura**: prima della prestazione dì “Posso avere paura e fare comunque la mia azione”.
- **Riduci la routine a 3 secondi**: espira lentamente, guarda un punto preciso, ripeti una sola parola-chiave come *“aggressivo”* o *“fluido”*.
- **Sposta l’obiettivo dal risultato all’azione**: invece di “non sbagliare”, scegli un comportamento controllabile: “attacco il pallone”, “comunico”, “seguo il gesto”.
- **Dopo l’errore, niente analisi immediata**: usa una frase breve — *“finito, prossimo compito”* — e rientra nell’azione successiva.

In quale momento preciso la routine smette di funzionare: **prima dell’azione, durante il gesto o subito dopo un errore**?

Candidate:

Capito. Se non funziona, probabilmente non è un problema di impegno: la routine potrebbe essere troppo lunga, arrivare troppo tardi o cercare di eliminare la paura invece di aiutarti a giocare nonostante ci sia.

In quale momento preciso si rompe: **prima dell’azione, mentre esegui, oppure subito dopo un errore**?

### conversation-progress-beyond-routine:1:sample-2

Verdicts: candidate, candidate

Reasons: Entrambe le risposte colgono il nodo centrale: il problema non è la routine ma il timore della sostituzione. Tuttavia differiscono significativamente nell'approccio. Risposta A offre un consiglio più contenuto e mirato (4 passi brevi), poi chiude con una domanda diagnostica potente e aperta ('il coach ti ha mai detto che ti toglie dopo un singolo errore, oppure lo deduci dal suo comportamento?'). Questa domanda è ad alto valore perché cambia radicalmente il percorso successivo: se il coach l'ha detto esplicitamente, il lavoro è diverso rispetto a una proiezione dell'atleta. Risposta B fornisce più consigli (4 bullet points dettagliati), incluso il suggerimento di parlare col coach fuori dalla gara, che è utile ma arriva come consiglio prescrittivo prima di aver scoperto se il timore è fondato o immaginato. La domanda finale di B ('quale cosa il coach vuole vedere') è a scelta multipla e meno diagnostica — presuppone già che l'atleta sappia cosa il coach vuole, quando il problema potrebbe essere proprio che non lo sa. A è più allineata all'anchor forte (lavorare su cosa puoi controllare e chiarire le aspettative col coach) ma lo fa attraverso la scoperta piuttosto che la prescrizione. B è più verbosa e prescrive soluzioni prima di aver completato la fase di scoperta, cadendo parzialmente nell'anchor debole (ecco le azioni da fare). La naturalezza conversazionale di A è superiore: suona come un coach che ragiona con l'atleta, mentre B suona più come un manuale. | A identifica meglio il vero nodo emerso nel turno utente: non è più la routine, ma la minaccia percepita della sostituzione. La domanda finale è diagnostica e ad alto valore perché distingue tra un criterio reale del coach e una previsione ansiosa, cambiando il tipo di intervento successivo. B è utile e concreto, include anche il tema del chiarire le aspettative col coach, ma dà molte indicazioni prima di esplorare e la domanda finale è più orientata alla scelta di un comportamento che alla diagnosi della causa.

Baseline:

Capisco: il problema non è solo l’errore, ma la paura immediata delle conseguenze e di perdere il posto.

- **Separa fatto e previsione**: dopo l’errore, chiediti: “Il coach mi ha davvero detto che mi toglierà, oppure lo sto immaginando?”. Non discutere con il pensiero: riconoscilo come una previsione.
- **Usa una risposta breve**: *“Un errore non decide il mio cambio. Ora mostro la prossima azione.”*
- **Dai al coach un segnale visibile**: dopo l’errore comunica, rientra subito in posizione e fai un’azione semplice e corretta. Mostri reazione, non perfezione.
- **Parlane fuori dalla gara**: chiedigli con calma: “Dopo un errore, quale comportamento vuoi vedere da me? In quali situazioni mi sostituisci?”. Avere criteri reali riduce le supposizioni.

Qual è la cosa più probabile che il coach voglia vedere da te subito dopo un errore: **comunicazione, impegno difensivo o una giocata semplice**?

Candidate:

Il punto non è più solo la paura dell’errore: è il significato che gli dai — **“se sbaglio, mi toglie”**. In quel momento la routine non deve convincerti che non succederà; deve riportarti a ciò che puoi controllare.

Dopo l’errore prova questa sequenza, molto breve:

1. **Nomina il fatto:** “Ho sbagliato questa giocata.”
2. **Separa la previsione:** “Essere tolto è una possibilità che sto immaginando, non un fatto già accaduto.”
3. **Frase operativa:** “La prossima azione: semplice e aggressiva.”
4. **Un respiro, poi cerca subito un compito concreto**: posizione, marcatura, comunicazione o movimento.

La domanda decisiva è: **il coach ti ha mai detto che ti toglie dopo un singolo errore, oppure lo deduci dal suo comportamento?**

### conversation-gradual-specialization:0:sample-2

Verdicts: candidate, candidate

Reasons: Entrambe le risposte commettono l'errore di dare consigli prima di aver esplorato il problema, ma A lo fa in misura minore. A offre un consiglio breve e mirato prima di porre la domanda diagnostica, mantenendo un rapporto più equilibrato tra scoperta e consiglio. B invece fornisce una lista di 4 tecniche dettagliate prima della domanda, il che è eccessivamente prescrittivo senza conoscere il contesto specifico dell'atleta. La domanda finale è quasi identica in entrambe le risposte, ma il contesto in cui viene posta è diverso: in A la domanda ha più peso perché non è preceduta da un muro di consigli. A è anche più naturale e meno formulaica, mentre B ha un formato a bullet points che risulta più da manuale che da conversazione di coaching. Nessuna delle due risposte si avvicina all'anchor forte (che pone solo una domanda diagnostica senza consigli), ma A è più vicina a quell'ideale. | A è preferibile perché mantiene il consiglio più contenuto e chiude con una domanda diagnostica utile sul momento in cui cala la fiducia. B offre troppi interventi generici prima di capire il pattern dell’atleta, quindi somiglia di più a una lista di tecniche. Entrambe avrebbero potuto fare prima una domanda più concreta sul segnale iniziale della perdita di fiducia, ma A rispetta meglio l’approfondimento graduale.

Baseline:

È comune: in gara la fiducia può oscillare, ma puoi allenare il modo in cui reagisci.

- **Scegli una parola chiave**: “aggressivo”, “calmo” o “presente”, da ripetere dopo ogni errore.
- **Riduci l’attenzione all’azione successiva**: chiediti “Qual è il prossimo gesto concreto?” invece di valutare la prestazione.
- **Usa una routine di reset di 5 secondi**: espira lentamente, rilassa le spalle, guarda un punto preciso e riparti.
- **Prepara una frase realistica**: “Non devo sentirmi sicuro per agire bene; devo eseguire il prossimo compito.”

In quale momento perdi più fiducia: dopo un errore, quando vai sotto nel punteggio o prima di iniziare?

Candidate:

Capita spesso: in gara la fiducia può calare quando l’attenzione passa dal gesto al risultato o al giudizio.

Per il prossimo evento, prova a sostituire “devo dimostrare” con un’unica consegna controllabile, ad esempio: **“eseguo il primo movimento con decisione”**. Dopo ogni errore, reset rapido: espira, guarda un punto preciso e ripeti la consegna.

**In quale momento perdi più fiducia: prima di iniziare, dopo un errore o quando la gara si fa decisiva?**

### conversation-gradual-specialization:1:sample-2

Verdicts: candidate, baseline

Reasons: Both responses use the user's context well (two consecutive errors in the final), but B does it more effectively. B opens with a sharp psychological insight ('il problema spesso non è il terzo gesto: è che inizi a proteggerti dall'errore') that demonstrates genuine understanding and reframes the issue, which is more valuable than A's somewhat generic acknowledgment. B's structure is cleaner and more actionable with a numbered sequence that feels like a real routine. B also closes with a powerful reframe ('La fiducia non deve tornare prima di agire: spesso torna dopo una buona azione') that directly addresses the user's core concern about losing confidence. A ends with a question ('Qual è una frase breve e concreta...') which is somewhat ritualistic rather than diagnostic—it doesn't change the advice direction meaningfully. B chose not to ask a question, which in this case feels more natural since the advice is already well-targeted to the specific context provided. Both responses avoid excessive verbosity and progress logically from the previous turn. B feels more like expert coaching; A feels more like a template with a question appended. | A usa molto bene il contesto specifico: due errori consecutivi, finale, paura del terzo errore. Propone una routine concreta e una progressione allenabile, poi fa una domanda utile per personalizzare il comando mentale, anche se non è pienamente diagnostica. B offre un buon consiglio tecnico-mentale e coglie il rischio di proteggersi dall’errore, ma chiude senza domanda e quindi sviluppa meno la conversazione di coaching graduale.

Baseline:

Capisco: due errori consecutivi nel finale possono trasformarsi rapidamente in paura del terzo.

- **Dopo il secondo errore, attiva una routine fissa**: espira, abbassa le spalle, guarda un punto e dì mentalmente: *“Reset. Una giocata.”*
- **Non cercare di recuperare subito**: scegli l’opzione più semplice e ad alta percentuale nella giocata successiva.
- **Usa un solo obiettivo tecnico**: ad esempio “gambe attive”, “occhi sulla palla” o “gesto completo”. Non correggere tutto insieme.
- **Allenalo sotto pressione**: in allenamento crea situazioni di finale e imponiti la routine dopo due errori consecutivi.

Qual è una frase breve e concreta che potresti usare come comando dopo il secondo errore?

Candidate:

Dopo due errori consecutivi, il problema spesso non è il terzo gesto: è che inizi a **proteggerti dall’errore**. Nel finale serve una routine automatica:

1. **Accetta:** “Due errori, stop.”
2. **Espira lentamente** e rilassa spalle/mani.
3. **Parola chiave:** “Aggressivo” oppure “Semplice”.
4. **Un solo obiettivo tecnico**, non il risultato.
5. Esegui la giocata successiva con la stessa intensità, senza cercare di recuperare tutto subito.

Allenala in pratica creando situazioni di pressione: due errori consecutivi e poi una giocata decisiva. La fiducia non deve tornare prima di agire: spesso torna **dopo una buona azione**.

### conversation-discovery-age:0:sample-3

Verdicts: candidate, candidate

Reasons: L'atleta non ha fornito età, livello, sport, esperienza né frequenza di allenamento. Risposta A fornisce un programma completo e dettagliato PRIMA di conoscere qualsiasi informazione critica sull'atleta, violando il principio fondamentale della scoperta prima del consiglio. La domanda alla fine ('Qual è il tuo sport...') arriva dopo aver già dato il piano, rendendola quasi rituale: il consiglio è già stato erogato. Risposta B invece si ferma correttamente, riconosce la richiesta dell'atleta e pone domande diagnostiche essenziali (sport/obiettivo, livello, frequenza) PRIMA di proporre qualsiasi programma. Manca la domanda sull'età, che è critica per la sicurezza, ma l'approccio è nettamente superiore. B è concisa, naturale e orientata alla progressione multi-turn. | B è nettamente migliore perché evita di prescrivere un carico intenso senza informazioni essenziali e fa domande diagnostiche su sport/obiettivo, livello e frequenza. Tuttavia manca la domanda sull'età, centrale nello scenario. A riconosce il rischio, ma dà comunque subito una seduta molto intensa e solo dopo chiede informazioni, quindi non rispetta la priorità della scoperta prima del consiglio.

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

Certo. Per prepararti un allenamento **molto intenso ma adatto a te**, mi serve sapere una cosa: **per quale sport o obiettivo vuoi migliorare?**  
Indicami anche, se puoi, il tuo livello e quante volte ti alleni già a settimana.

### conversation-discovery-age:1:sample-3

Verdicts: baseline, baseline

Reasons: Both responses handle the critical safety aspect of a 15-year-old athlete well, but in different ways. Response A immediately integrates the age/experience context to recalibrate the previous overly intense program, providing age-appropriate modifications (no heavy weights, no training to failure, emphasis on technique) while still asking a relevant follow-up question about sport/specialty. Response B takes a pure discovery approach, asking about the sport before giving any advice. While B's discovery-first approach is generally good coaching practice, in this specific multi-turn context it's problematic: the assistant in Conversation B already asked about sport in the previous turn, and the user didn't answer that but instead revealed their age (15), experience (1 year), and training frequency (2x/week). Response B essentially repeats the same question without acknowledging the critical new information about age and experience level. Response A, by contrast, immediately addresses the safety implications of a 15-year-old doing extreme training, recalibrates the program appropriately, and then asks the remaining discovery question. The anchor analysis supports A: the strong anchor emphasizes gradual quality and recovery without extreme load for a 15-year-old, which A follows. B ignores the age context entirely in its response. A loses some points on discovery-before-advice since it provides a full program before knowing the sport, but the safety recalibration based on age was more urgent and appropriate. | A integra bene le nuove informazioni critiche: 15 anni, poca esperienza e due sedute settimanali, correggendo l’idea di carico estremo verso progressione, tecnica e recupero. La domanda finale su sport e ruolo è diagnostica e può cambiare il piano. Il limite è che propone comunque una struttura prima di conoscere lo sport, e il “2 volte a settimana” potrebbe essere ambiguo rispetto agli allenamenti già presenti. B fa una domanda pertinente e necessaria, ma ignora quasi del tutto età, esperienza e frequenza già fornite, risultando poco progressiva nel multi-turn e più ripetitiva.

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

Quale sport pratichi? L’allenamento intenso cambia molto tra calcio, basket, atletica, tennis o altro. Dimmi anche il tuo ruolo o specialità, se ne hai uno.

### conversation-discovery-food:0:sample-3

Verdicts: baseline, baseline

Reasons: Entrambe le risposte adottano correttamente un approccio di scoperta prima del consiglio, ponendo domande diagnostiche pertinenti. Tuttavia B risulta leggermente superiore per diversi motivi: (1) Naturalezza conversazionale: B integra le domande in un flusso più discorsivo e meno da checklist numerata, risultando più naturale come conversazione di coaching. (2) Qualità della domanda: B chiude con una domanda concreta e orientante ('preferisci un menu semplice in stile mediterraneo?') che è più utile e specifica rispetto alla domanda di A ('onnivoro, vegetariano o vegano?'). Entrambe sono domande valide, ma quella di B offre un'opzione concreta che facilita la risposta. (3) Progressione multi-turn: B rende opzionale il dato biometrico ('se vuoi un piano più preciso'), il che è più rispettoso e strategico per la progressione della conversazione, mentre A lo presenta come requisito obbligatorio nella lista. Le differenze sono sottili ma consistenti a favore di B. | Entrambe fanno correttamente discovery prima di proporre un menu e chiedono informazioni diagnostiche rilevanti: sport, frequenza/orari, obiettivo e restrizioni alimentari. B è leggermente preferibile perché è più naturale, meno rigida e rende opzionali dati personali come età, altezza e peso, mantenendo comunque una buona progressione verso il menu. A è completa, ma più formularia e accumula molte richieste in modo un po' pesante.

Baseline:

Certo: per preparare un menu davvero adatto ai tuoi allenamenti mi servono alcune informazioni.

- Che sport pratichi e quante volte ti alleni?
- In quali giorni e orari ti alleni?
- Obiettivo: energia e prestazione, dimagrimento, aumento massa o mantenimento?
- Hai allergie, intolleranze o alimenti che eviti?

Indicami anche età, altezza e peso se vuoi un piano più preciso; preferisci un menu semplice in stile mediterraneo?

Candidate:

Certo. Per prepararti un menu davvero adatto, mi servono queste informazioni:

1. **Sport e tipo di allenamento**  
2. **Quanti allenamenti fai e in quali giorni/orari**  
3. **Obiettivo**: energia, aumento massa, dimagrimento o mantenimento  
4. **Età, altezza e peso**  
5. **Allergie, intolleranze o alimenti che eviti**

Nel frattempo, preferisci un menu **onnivoro, vegetariano o vegano**?

### conversation-discovery-food:1:sample-3

Verdicts: candidate, candidate

Reasons: La rubrica premia esplicitamente la scoperta prima del consiglio e le domande diagnostiche che cambiano il consiglio. A integra correttamente le informazioni ricevute (vegetariana, allenamento alle 19), anticipa la struttura dei pasti (spuntino pre e cena di recupero) e pone due domande diagnostiche cruciali ancora mancanti: l'obiettivo e il tipo di vegetarianesimo (uova/latticini). Queste domande cambiano radicalmente il menu. B invece salta direttamente a un menu completo dettagliatissimo senza conoscere informazioni fondamentali: obiettivo, età, peso, altezza, tipo di sport, intensità, frequenza settimanale, e se l'atleta consuma uova/latticini. La domanda sull'obiettivo viene posta solo alla fine, dopo aver già fornito il piano — il che rende la domanda quasi rituale. Il menu di B potrebbe essere completamente sbagliato (ad esempio se l'atleta è vegana, o se vuole dimagrire vs aumentare massa). Questo viola il principio fondamentale della scoperta prima del consiglio. B è anche eccessivamente verboso e poco naturale come conversazione di coaching. | A usa subito le nuove informazioni rilevanti — vegetariana e allenamento alle 19 — e fa due domande diagnostiche che cambiano davvero il menu: obiettivo e consumo di uova/latticini. Progredisce verso un piano personalizzato senza chiudere la scoperta troppo presto. B sfrutta bene il contesto orario e vegetariano, ma produce un menu completo prima di chiarire obiettivo, frequenza/intensità e soprattutto se la persona consuma uova e latticini; la domanda sull’obiettivo arriva tardi, dopo consigli già formulati. La verbosità e la completezza apparente non compensano la scoperta prematura.

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

Perfetto: organizzerò i pasti considerando l’allenamento alle **19:00**, con uno spuntino pre-allenamento e una cena di recupero.

Prima di preparare il menu completo, dimmi solo:

**Qual è il tuo obiettivo — mantenimento, dimagrimento, aumento della massa muscolare o più energia — e consumi uova e latticini?**

### conversation-discovery-home:0:sample-3

Verdicts: candidate, candidate

Reasons: La richiesta dell'utente è vaga: non specifica obiettivo, attrezzatura, livello, frequenza. Un buon coach deve prima raccogliere informazioni diagnostiche prima di prescrivere. Risposta A salta completamente la fase di discovery e fornisce una scheda generica senza conoscere nulla dell'utente. La domanda finale ('Vuoi che te la adatti?') arriva dopo aver già dato il consiglio, invertendo l'ordine corretto. Risposta B invece si ferma correttamente a fare domande diagnostiche prima di dare qualsiasi programma. Chiede obiettivo, attrezzatura e frequenza — tutte informazioni che cambiano radicalmente la scheda. La domanda è ad alto valore diagnostico, non rituale. B è più naturale come interazione di coaching: breve, diretta, senza verbosità inutile, e apre una progressione multi-turn significativa. | B è preferibile perché evita di dare una scheda generica e avvia subito la scoperta con una domanda che cambia davvero il programma: obiettivo, attrezzatura e frequenza. A è utile e sicura, ma parte con una routine standard senza sapere obiettivo, livello, disponibilità o attrezzi; la domanda arriva solo alla fine come adattamento successivo.

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

Certo. Per prepararti una scheda davvero adatta, dimmi solo:

**qual è il tuo obiettivo principale?**  
1. Forza e muscoli  
2. Dimagrimento/fitness  
3. Preparazione atletica per uno sport  
4. Mobilità e postura  

Se vuoi, aggiungi anche che attrezzatura hai a casa e quante volte a settimana puoi allenarti.

### conversation-discovery-home:1:sample-3

Verdicts: candidate, candidate

Reasons: L'utente ha fornito due informazioni (elastici e 3 giorni), ma manca ancora l'obiettivo principale, che è un dato diagnostico fondamentale: una scheda per dimagrimento è molto diversa da una per forza o per preparazione atletica. Risposta A integra correttamente il contesto fornito (elastici + 3 giorni) e pone una domanda diagnostica ad alto valore sull'obiettivo, che cambierebbe radicalmente la struttura della scheda. È concisa e non rituale. Risposta B invece si lancia immediatamente in una scheda completa e dettagliata di 3 giorni con elastici, senza aver mai scoperto l'obiettivo dell'utente, il suo livello di esperienza, eventuali limitazioni fisiche o lo sport praticato. Pur essendo tecnicamente ragionevole, la scheda è generica proprio perché manca la fase di discovery. La domanda finale ('Vuoi che la renda più orientata a dimagrimento, forza o prestazione?') arriva dopo aver già dato tutto il programma, il che la rende una domanda rituale più che diagnostica — il consiglio è già stato dato. B ripete lo stesso errore del turno precedente: dare prima la scheda e poi chiedere. La rubrica premia esplicitamente la scoperta prima del consiglio e le domande che cambiano il consiglio, non la verbosità. | A usa il contesto fornito e identifica la variabile ancora mancante, cioè l’obiettivo, che cambierebbe davvero la scheda. B sfrutta bene elastici e frequenza e propone una progressione plausibile, ma anticipa una scheda completa prima di chiarire l’obiettivo; la domanda finale è rilevante ma arriva tardi e diventa più di adattamento successivo che di discovery.

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

Perfetto: **3 giorni a settimana con elastici**.  
Qual è il tuo obiettivo principale: **forza e massa muscolare, dimagrimento/fitness, preparazione atletica per uno sport, oppure mobilità/postura**?

### conversation-clarify-ambiguous:0:sample-3

Verdicts: candidate, candidate

Reasons: L'atleta ha inviato un messaggio estremamente ambiguo ('Quando parte mi si chiude tutto'). Non sappiamo se parla di gara, allenamento, respiro, pensieri, tensione muscolare, né quale sport pratica. In questo scenario, la priorità assoluta è la scoperta prima del consiglio. Risposta A fa esattamente questo: pone due domande diagnostiche mirate (contesto: gara o partita? e natura del blocco: testa vuota, tensione fisica, difficoltà respiratoria?) senza dare alcun consiglio prematuro. Questo è perfettamente allineato con l'anchor forte. Risposta B invece dà subito 4 consigli pratici (espirazione, focus, partire al 90%, annotare) prima ancora di capire cosa significhi 'si chiude tutto'. La domanda diagnostica viene posta solo alla fine, dopo aver già prescritto soluzioni. Questo è problematico: come si può consigliare 'espira lentamente' se non si sa nemmeno se il problema è respiratorio? La domanda in coda diventa quasi rituale, perché il consiglio è già stato dato. B viola il principio fondamentale della rubrica: una domanda diagnostica cambia il consiglio. B ha dato il consiglio senza la diagnosi, rendendo la domanda finale poco più che decorativa. | A riconosce l’ambiguità del messaggio e fa subito domande diagnostiche che cambiano realmente il consiglio: contesto dell’episodio e significato di “si chiude tutto”. B contiene una buona domanda finale, ma arriva dopo una serie di consigli basati su un’ipotesi non verificata, quindi procede troppo presto verso l’intervento.

Baseline:

Capisco: all’inizio la tensione può farti “chiudere” corpo e mente.

- Prima di partire, espira lentamente per 6–8 secondi, per 3 volte.
- Scegli un solo focus semplice: **“respiro”**, **“ritmo”** o **“primo gesto”**.
- Parti al 90%, senza cercare subito la prestazione perfetta; lascia che il corpo entri gradualmente nel ritmo.
- Dopo, annota quando esattamente ti blocchi: prima del via, nei primi secondi o quando senti pressione.

Quando dici “mi si chiude tutto”, intendi soprattutto il respiro, i muscoli o la mente?

Candidate:

Capisco: sembra un blocco proprio al momento di iniziare. Ti riferisci a una gara o a una partita? E “si chiude tutto” significa soprattutto testa vuota, tensione fisica o difficoltà a respirare?

### conversation-clarify-ambiguous:1:sample-3

Verdicts: candidate, baseline

Reasons: Entrambe le risposte integrano il contesto fornito dall'utente (respiro che si blocca alla partenza della gara) e concludono con una domanda diagnostica di valore. Tuttavia, A è più naturale e fluida: offre consigli mirati e concisi, con una domanda finale precisa ('Il respiro torna normale dopo poco oppure rimane difficile per tutta la gara?') che ha alto valore diagnostico per calibrare il prossimo intervento. B è più verbosa, include un disclaimer medico che, pur essendo responsabile, risulta un po' prematuro e formulaico dato che l'atleta ha appena chiarito il problema — non ci sono ancora segnali di patologia. La domanda finale di B ('Ti succede anche durante gli allenamenti o solo in gara, e avverti sibili o senso di costrizione al petto?') è buona ma doppia e meno focalizzata. Inoltre, B aveva già dato consigli nel turno precedente prima di avere chiarezza, il che penalizza la scoperta prima del consiglio nel percorso multi-turn. A mantiene una progressione più pulita: prima ha chiesto chiarimenti, poi ha dato consigli mirati dopo aver ricevuto la risposta. La naturalezza conversazionale di A è superiore: meno elenchi puntati, tono più da coach reale. | B è preferibile perché, pur avendo dato consigli prima di completare la scoperta nella conversazione precedente, ora usa bene il chiarimento dell’atleta, propone azioni concrete e include una domanda diagnostica davvero ad alto valore: capire se succede anche in allenamento e se ci sono sibili o costrizione al petto può cambiare nettamente il consiglio e introduce correttamente una soglia di sicurezza. A è più coerente con la progressione della propria conversazione, perché prima ha chiarito e poi consiglia, ma assume abbastanza presto una spiegazione psicologica di ipercontrollo e la domanda finale è utile ma meno discriminante sul piano respiratorio/medico.

Baseline:

Capisco: il respiro che si blocca appena parte la gara può dipendere dalla tensione, ma anche da una risposta respiratoria da sforzo, quindi va preso sul serio.

- Fai un **riscaldamento progressivo di 10–15 minuti**, con qualche breve accelerazione, invece di partire bruscamente.
- Prima del via: inspira normalmente dal naso o dalla bocca ed espira più a lungo, senza fare grandi inspirazioni forzate; pensa a **“espira e ritmo controllato”**.
- Nei primi 30–60 secondi parti leggermente sotto il massimo, mantenendo spalle e mascella rilassate.
- Se compaiono affanno intenso, sibili, dolore al petto, capogiri o non riesci a parlare, **fermati e chiedi assistenza**; se succede spesso, parlane con un medico prima di gareggiare.

Ti succede anche durante gli allenamenti o solo in gara, e avverti sibili o senso di costrizione al petto?

Candidate:

All’inizio della gara probabilmente entri subito in **ipercontrollo e parti troppo “in allarme”**, così il respiro diventa corto e sembra bloccarsi.

Prova questa sequenza:

- Nei 2–3 minuti prima del via, fai espiri più lunghi delle inspirazioni: **inspira 3 secondi, espira 5–6**.
- Alla partenza non cercare di fare un respiro enorme: pensa solo a **rilassare mascella e spalle** e a lasciare uscire l’aria.
- Parti al **90% per i primi 20–30 secondi**, poi aumenta gradualmente.
- Usa una frase semplice: **“Fuori l’aria, poi ritmo.”**

Il respiro torna normale dopo poco oppure rimane difficile per tutta la gara?

### conversation-no-ritual-question:0:sample-3

Verdicts: tie, candidate

Reasons: Entrambe le risposte forniscono una frase breve e ritmica da ripetere prima del servizio, molto simile all'anchor forte. Nessuna delle due fa alcuna domanda diagnostica per capire il contesto dell'utente (sport specifico, livello, problematica principale, cosa cerca nella frase). Entrambe saltano completamente la fase di scoperta e forniscono un consiglio diretto senza personalizzazione. La qualità delle frasi è comparabile: A usa 'Respiro, mi fido, attacco il servizio' e B usa 'Respiro, mi focalizzo e servo con decisione' — entrambe seguono lo stesso schema tripartito dell'anchor forte. Nessuna delle due offre progressione multi-turn o usa contesto specifico dell'utente. Sono essenzialmente equivalenti in tutti i criteri valutati. | Entrambe rispondono direttamente alla richiesta di una frase breve senza introdurre domande rituali inutili. A è leggermente più incisiva e memorabile come mantra pre-servizio; “mi fido” lavora bene sulla sicurezza e “attacco il servizio” dà energia. B è corretta ma un po’ più generica e meno naturale nella formulazione, soprattutto “mi focalizzo”.

Baseline:

Respiro, mi focalizzo e servo con decisione.

Candidate:

“Respiro, mi fido, attacco il servizio.”

### conversation-no-ritual-question:1:sample-3

Verdicts: tie, candidate

Reasons: Both responses appropriately acknowledge the user's gratitude with a brief, natural closure. Neither asks a ritual question, which is correct given the context—the user expressed satisfaction and didn't signal a need for further exploration. Response A adds a brief encouragement ('fidati del tuo gesto') that echoes the phrase it provided ('mi fido'), showing good contextual callback. Response B adds a practical micro-tip about how to use the phrase ('per entrare nel punto con calma e convinzione'), which shows slightly more context use but also edges toward unsolicited advice. Neither asks a diagnostic question, which is appropriate here since the user signaled closure. Both are close to the strong anchor ('Di nulla'). The slight differences balance out: A is more natural and contextually resonant, B offers marginally more actionable guidance but risks being slightly preachy. Overall they're very close in quality. | Entrambe rispondono in modo naturale al ringraziamento senza introdurre domande rituali. A è leggermente più forte perché chiude con calore e riprende bene il contesto della frase precedente, in particolare l’idea di fiducia nel gesto. B è valida, ma suona un po’ più come un consiglio aggiuntivo non necessario.

Baseline:

Di nulla! Usala per entrare nel punto con calma e convinzione.

Candidate:

Di nulla! Buona partita—fidati del tuo gesto.

### conversation-known-thread-fact:0:sample-3

Verdicts: baseline, baseline

Reasons: Entrambe le risposte commettono lo stesso errore fondamentale: forniscono consigli dettagliati prima di aver fatto scoperta. L'anchor forte mostra che la domanda diagnostica dovrebbe precedere qualsiasi consiglio ('il blocco arriva prima del lancio o quando pensi al risultato?'). Entrambe invertono l'ordine: prima danno una routine completa, poi chiudono con una domanda. Detto questo, B è leggermente migliore per diversi motivi: (1) la domanda finale di B è più specifica e diagnostica ('quale parte ti blocca di più: il lancio, il momento prima di colpire o la paura di sbagliare?'), offrendo opzioni concrete legate alla pallavolo che camberebbero effettivamente il consiglio successivo; (2) B è più concisa e strutturata, senza verbosità inutile; (3) B include l'idea di pressione graduale che mostra una progressione più sofisticata. La domanda di A ('cosa senti soprattutto: paura di sbagliare, pensieri confusi oppure il corpo che si irrigidisce') è più generica e psicologica, meno legata al gesto tecnico specifico della battuta. Nessuna delle due si avvicina all'anchor forte, ma B è marginalmente superiore. | B è preferibile perché la domanda finale è più diagnostica e specifica per la battuta: distingue tra lancio, fase prima del colpo e paura di sbagliare, informazioni che cambierebbero concretamente il consiglio successivo. A offre buoni suggerimenti e una domanda utile, ma più generica sul tipo di sensazione. Entrambe danno consigli prima di fare scoperta, quindi non raggiungono punteggi alti su quel criterio.

Baseline:

Capita spesso: il blocco in battuta nasce più dalla pressione del momento che dalla tecnica, e si può allenare.

- **Crea una routine sempre uguale**: respira lentamente, guarda il punto scelto, fai rimbalzare la palla una volta e batti. Mantienila in 5–7 secondi.
- **Scegli un obiettivo semplice e ampio**, per esempio “zona 1” o “oltre la rete”, invece di pensare a non sbagliare.
- **Usa una frase breve**: “Alto e avanti” oppure “Routine, colpisci”. Riporta l’attenzione all’azione.
- **Allenati sotto pressione graduale**: 5 battute senza conseguenze, poi una “battuta decisiva” contando solo l’esecuzione della routine, non il risultato.

Alla prossima partita, quale parte ti blocca di più: il lancio, il momento prima di colpire o la paura di sbagliare?

Candidate:

È molto comune: spesso il blocco nasce dal tentativo di **non sbagliare**, che fa pensare troppo al gesto.

Prima della battuta prova questa routine, sempre uguale:

1. **Espira lentamente**.
2. Guarda un punto preciso del campo.
3. Ripeti una sola parola: *“fluida”* oppure *“alta”*.
4. Fai rimbalzare la palla sempre lo stesso numero di volte.
5. Pensa solo al primo obiettivo tecnico: **lancio preciso**, non al risultato.

In allenamento, inizia battendo senza cercare potenza: punta a eseguire la routine 10 volte di fila. La fiducia si costruisce sulla ripetizione, non sulla battuta perfetta.

Quando ti blocchi, cosa senti soprattutto: paura di sbagliare, pensieri confusi oppure il corpo che si irrigidisce?

### conversation-known-thread-fact:1:sample-3

Verdicts: candidate, candidate

Reasons: Both responses provide structured weekly plans that build well on the previous turn's context (pallavolo, battuta, routine). Neither asks a diagnostic question before giving advice — both jump straight into a 7-day plan. However, the user explicitly asked 'Come posso lavorarci questa settimana?' which is a direct request for a plan, so the lack of discovery is somewhat justified. Response A is slightly better for several reasons: (1) It avoids ending with a low-value logistical question ('Quando sarà il tuo prossimo allenamento?') which is ritualistic and doesn't change the coaching advice — B's closing question is weak. (2) A's progression feels more natural and conversational, with a clear culmination toward game day that integrates the mental cue ('bersaglio + ritmo + primo movimento'). (3) A includes a useful reset protocol for errors ('Errore chiuso, prossima palla') which adds practical value. (4) A's final framing of success measurement ('Ho eseguito la routine con decisione') aligns well with the anchor forte concept. B is solid but slightly more mechanical in structure and ends with a question that feels like it's just keeping the chat open rather than adding coaching value. | Entrambe usano bene il contesto della pallavolo e del blocco in battuta, trasformando la routine già proposta in un piano settimanale. A è leggermente superiore perché mantiene il focus più chiaro sulla misura corretta — completare la routine e gestire la pressione, non fare ace — e introduce una progressione più robusta: tecnica facile, pressione graduale, simulazione, reset dopo errore e giorno gara. B è valido e più compatto, ma la domanda finale è soprattutto organizzativa/di ingaggio, non diagnostica; non cambierebbe molto il consiglio. Nessuna delle due fa vera scoperta aggiuntiva sul tipo di blocco, ma in questo turno l’utente chiede esplicitamente un piano settimanale, quindi il consiglio diretto è appropriato.

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

Questa settimana lavora su **routine e gestione della pressione**, non sulla potenza.

### Giorni 1–2: sicurezza tecnica
Per 10–15 minuti:
- 5 battute facili, senza obiettivo di precisione.
- Scegli un bersaglio grande e prova a colpirlo 10 volte.
- Prima di ogni battuta: **espira → guarda il bersaglio → parola chiave → esegui**.
- Valuta solo: *Ho seguito la routine?* Non se è entrata.

### Giorni 3–4: aggiungi una piccola pressione
Fai 3 serie da 5 battute:
- Serie 1: obiettivo libero.
- Serie 2: devi realizzare almeno 3 battute valide.
- Serie 3: immagina il punteggio 23–23 e usa la stessa routine.

Se sbagli, fai un reset: allontanati dalla linea, un respiro, frase breve — **“Errore chiuso, prossima palla”** — e riparti.

### Giorni 5–6: simula la partita
Chiedi a un compagno o allenatore di:
- chiamare un bersaglio;
- creare una situazione di punteggio;
- osservare soltanto la tua routine.

L’obiettivo è mantenere gli stessi gesti anche sotto pressione, non fare ace.

### Giorno della gara
Prima della partita fai solo 5–8 battute controllate. In campo pensa a:
**bersaglio + ritmo + primo movimento**.

La tua misura di successo sarà: **“Ho eseguito la routine con decisione”**, indipendentemente dal risultato.

### conversation-identity-correction:0:sample-3

Verdicts: tie, candidate

Reasons: Entrambe le risposte gestiscono correttamente la correzione d'identità: riconoscono Marta, non danno consigli prematuri e pongono una domanda aperta per avviare la scoperta. Le differenze sono minime e stilistiche. A dice 'Di cosa vuoi parlare oggi?' mentre B dice 'su cosa vuoi lavorare oggi?' — quest'ultima ha una sfumatura leggermente più orientata all'azione/coaching, ma la differenza è trascurabile. Entrambe evitano formule rituali eccessive, sono naturali e concise. Nessuna delle due aggiunge valore diagnostico significativo rispetto all'altra. Entrambe si allineano bene all'anchor forte, riconoscendo il cambio d'identità senza precipitarsi in consigli. | Entrambe recepiscono correttamente la correzione d'identità e fanno una domanda aperta invece di dare consigli prematuri. B è leggermente più naturale e orientata al coaching con 'su cosa vuoi lavorare oggi?', mentre A è valida ma un po' più generica.

Baseline:

Perfetto, grazie per avermelo detto Marta. Di cosa vuoi parlare oggi?

Candidate:

Ciao Marta, grazie per avermelo detto. Ti ascolto: su cosa vuoi lavorare oggi?

### conversation-identity-correction:1:sample-3

Verdicts: candidate, candidate

Reasons: Entrambe le risposte commettono lo stesso errore fondamentale rispetto all'anchor forte: danno consigli prima di fare discovery. L'anchor forte mostra che la domanda diagnostica dovrebbe venire PRIMA di qualsiasi consiglio, perché la risposta cambia radicalmente il tipo di intervento. Entrambe invertono l'ordine, offrendo tecniche generiche e poi chiudendo con una domanda. Tuttavia, A è leggermente migliore per diversi motivi: (1) è meno verbosa e più contenuta nei consigli, il che è meno dannoso quando si consiglia prima di diagnosticare; (2) la frase 'spesso il problema non è sbagliare, ma giocare trattenuta per evitarlo' è un'osservazione di coaching di qualità che mostra comprensione del meccanismo psicologico; (3) la domanda finale di A è leggermente più aperta e diagnostica ('In quale situazione ti blocchi di più'), mentre B è più strutturata ma anche più prescrittiva. B è più lunga, con 4 bullet points di consigli generici prima della domanda, il che aggrava il problema della mancata discovery. Nessuna delle due usa il nome 'Marta' nel turno, perdendo un'opportunità di personalizzazione dal contesto precedente. Entrambe sono lontane dall'anchor forte ma A è marginalmente più vicina allo spirito del buon coaching. | A è leggermente preferibile: entrambe rispondono in modo utile e contestualizzato al basket, ma anticipano troppo i consigli prima di capire dove nasce la paura. La domanda finale di A è più diagnostica e ampia, perché distingue tiro, palleggio, passaggio e pressione, quindi cambierebbe meglio il coaching successivo. B offre buoni suggerimenti pratici, ma è più prescrittiva e più lunga prima della scoperta; la domanda è valida ma un po' meno precisa.

Baseline:

È normale avere paura di sbagliare: l’obiettivo non è eliminarla, ma giocare comunque con fiducia.

- **Prima dell’azione:** inspira lentamente e pensa a una sola parola chiave: *“aggressiva”*, *“semplice”* o *“presente”*.
- **Dopo un errore:** fai un reset immediato: battito di mani, espira e chiediti: *“Qual è la prossima azione utile?”*
- **Cambia obiettivo:** non puntare a “non sbagliare”; punta a correre in difesa, comunicare, prendere buone decisioni e aiutare la squadra.
- **Allenati alla pressione:** durante gli allenamenti chiedi situazioni simulate di partita, concentrandoti sul gesto successivo, non sul risultato.

In quale momento senti più paura: quando tiri, quando perdi palla o durante le partite importanti?

Candidate:

La paura di sbagliare è normale, ma non deve guidare la tua giocata. Prova così:

- **Prima dell’azione:** respira lentamente e scegli un’intenzione semplice: *“attacco con decisione”* oppure *“passaggio forte e preciso”*.
- **Durante:** concentra l’attenzione su una sola cosa controllabile, non sul risultato.
- **Dopo l’errore:** niente giudizi. Di’ mentalmente: *“reset”*, fai un gesto di ripartenza e pensa alla prossima azione.

Un errore non definisce la tua prestazione: spesso il problema non è sbagliare, ma giocare trattenuta per evitarlo.

In quale situazione ti blocchi di più: tiro, palleggio, passaggio o quando sei sotto pressione durante la partita?

### conversation-cross-chat-transparency:0:sample-3

Verdicts: baseline, baseline

Reasons: Entrambe le risposte sono molto simili e allineate all'anchor forte: dichiarano trasparentemente di non avere accesso all'altra chat e chiedono all'utente di fornire il contesto. La differenza chiave è nella qualità della domanda diagnostica. A specifica tre dimensioni concrete da esplorare (allenamento previsto, stato fisico, obiettivo di oggi), il che è una domanda più strutturata e ad alto valore che guida l'utente a fornire informazioni realmente utili per il coaching. B chiede genericamente 'obiettivo e impegni di oggi', che è meno specifico e meno diagnostico. Il grassetto in A aiuta anche a rendere chiara la richiesta. Entrambe evitano formule rituali e sono dirette, ma A ha un leggero vantaggio nella qualità della domanda e nella progressione potenziale del multi-turn. | Entrambe gestiscono bene la trasparenza cross-chat senza inventare contenuti e chiedono un riassunto utile prima di dare consigli. A è superiore perché le informazioni richieste sono più diagnostiche per il coaching sportivo: allenamento previsto, stato fisico e obiettivo di oggi cambiano concretamente il consiglio. B è corretta e naturale, ma 'obiettivo e impegni' è un po' più generico e meno centrato sullo stato atletico.

Baseline:

Non posso vedere il contenuto dell’altra chat, quindi non voglio inventare un piano. Incollami qui gli ultimi messaggi o riassumi **allenamento previsto, stato fisico e obiettivo di oggi**, e ti dirò esattamente cosa fare.

Candidate:

Non posso vedere l’altra chat da questa conversazione. Incollami gli ultimi messaggi o riassumimi l’obiettivo e gli impegni di oggi, così ti dico esattamente cosa fare.

### conversation-cross-chat-transparency:1:sample-3

Verdicts: baseline, baseline

Reasons: Entrambe le risposte commettono lo stesso errore fondamentale: forniscono un piano dettagliato prima di aver fatto domande diagnostiche essenziali. Non sappiamo che sport pratica l'utente, che tipo di ansia sperimenta (somatica, cognitiva, da prestazione), quale livello competitivo ha, se ha già strategie, ecc. Entrambe danno consigli generici e poi chiudono con una domanda. Tuttavia B è leggermente migliore per diversi motivi: (1) la struttura del piano è più articolata e contestualizzata alla gara di domenica (visualizzazione specifica con partenza e momento di tensione, esercizio di controllo/non controllo, preparazione attrezzatura la sera); (2) la domanda finale è più diagnostica ('allenamento programmato oppure giorno di riposo') rispetto a quella di A ('che allenamento o impegno sportivo hai oggi') che è quasi equivalente ma leggermente meno precisa; (3) B mostra maggiore naturalezza conversazionale e progressione multi-turn con la struttura temporale della giornata (10 minuti, allenamento, visualizzazione, stasera). Nessuna delle due eccelle nella scoperta prima del consiglio, che è il difetto principale di entrambe. | B usa meglio il contesto dell’ansia pre-gara e costruisce un piano più concreto per la giornata, includendo controllo, allenamento, visualizzazione e preparazione serale. La domanda finale è diagnostica perché sapere se oggi c’è allenamento o riposo cambierebbe il consiglio. A è corretta e naturale, ma più generica e meno orientata a una routine pre-gara specifica. Entrambe danno consigli prima di chiarire il programma di oggi, quindi non eccellono nella scoperta prima del consiglio.

Baseline:

Capisco: oggi l’obiettivo non è eliminare l’ansia, ma renderla gestibile in vista della gara di domenica.

- **10 minuti:** scrivi cosa ti preoccupa e dividi tutto in “sotto il mio controllo” / “non sotto il mio controllo”. Scegli una sola azione concreta dalla prima lista.
- **Allenamento:** svolgilo normalmente, senza aggiungere carico per “recuperare” o dimostrare qualcosa. Concentrati su 1–2 aspetti tecnici già allenati.
- **Visualizzazione breve:** immagina partenza, primo momento di tensione e una risposta semplice: *respiro, guardo il riferimento, eseguo il prossimo gesto*.
- **Stasera:** prepara l’attrezzatura e fai 5 minuti di respirazione lenta, con espirazione più lunga dell’inspirazione.

Oggi hai già un allenamento programmato oppure è un giorno di riposo?

Candidate:

Certo. Per oggi, visto che la gara è domenica, l’obiettivo non è “eliminare” l’ansia, ma iniziare a renderla gestibile:

- fai l’allenamento previsto senza aggiungere lavoro extra;
- dedica 5 minuti a respirazione lenta: inspira 4 secondi, espira 6;
- scrivi una sola cosa controllabile per la gara, ad esempio: “seguo il mio ritmo e la mia routine”;
- evita di analizzare continuamente la prestazione o immaginare scenari negativi.

Che allenamento o impegno sportivo hai oggi?

### conversation-progress-beyond-routine:0:sample-3

Verdicts: candidate, candidate

Reasons: L'atleta dice che la routine non funziona. L'anchor forte mostra chiaramente che la risposta ideale è una domanda diagnostica prima di qualsiasi consiglio. La Risposta A fornisce quattro consigli dettagliati prima ancora di sapere quale routine l'atleta stia usando, quando si blocca, o in quale sport/contesto opera. La domanda diagnostica alla fine è buona ma arriva dopo un muro di prescrizioni non richieste e non informate dal contesto — è essenzialmente l'anchor debole con una domanda aggiunta in coda. La Risposta B segue fedelmente il principio di scoperta prima del consiglio: offre un breve reframe validante (la routine deve aiutarti ad agire nonostante la paura, non a eliminarla), poi pone due domande diagnostiche precise — quando si blocca e cosa fa esattamente nella routine attuale. Questa seconda domanda è particolarmente preziosa perché senza sapere cosa l'atleta fa concretamente, qualsiasi consiglio è generico. B è concisa, naturale, e apre uno spazio di esplorazione autentico che cambierà il consiglio successivo. A è verbosa e prescrive senza contesto sufficiente. | B segue meglio l'anchor forte: non propone subito un'altra routine, ma cerca di capire dove fallisce e cosa contiene quella attuale. Le sue domande sono diagnostiche e cambierebbero davvero il consiglio successivo. A è empatica e la domanda finale è buona, ma arriva dopo una lista di soluzioni generiche, quindi anticipa il consiglio senza sufficiente scoperta.

Baseline:

Capisco: è frustrante impegnarsi in una routine e sentire che, proprio quando serve, la paura resta lì.

- **Accorciala:** riducila a 3 passaggi e 5–8 secondi: *espira lentamente → guarda un punto preciso → scegli una sola intenzione tecnica*.
- **Non cercare di eliminare la paura:** formula “Posso sentire paura e fare comunque il gesto”. L’obiettivo è agire, non sentirsi perfettamente calmi.
- **Sposta l’attenzione sull’azione:** sostituisci “non sbagliare” con un comando osservabile, per esempio “piede attivo”, “guarda la palla” o “attacca il bersaglio”.
- **Allenala sotto pressione graduale:** inserisci una conseguenza controllata — punteggio, tempo limite o una ripetizione decisiva — e usa la routine anche quando l’errore non è ancora imminente.

In quale momento preciso smette di funzionare: **prima dell’azione, durante l’esecuzione o subito dopo un errore**?

Candidate:

Capito. Probabilmente non è sufficiente “calmarsi”: la routine deve aiutarti a **eseguire l’azione anche mentre temi di sbagliare**.

In quale momento preciso si blocca: **prima dell’azione, durante, oppure subito dopo un errore**? E cosa fai esattamente nella routine attuale?

### conversation-progress-beyond-routine:1:sample-3

Verdicts: tie, baseline

Reasons: Entrambe le risposte colgono correttamente il nodo centrale: il problema non è la routine in sé ma il timore della sostituzione. Entrambe riformulano il focus su ciò che l'atleta può controllare (la prossima azione) e suggeriscono di parlare col coach per chiarire le aspettative — allineandosi bene all'anchor forte. Tuttavia, entrambe saltano alla fase di consiglio senza fare domande diagnostiche sufficienti (es. quanto è reale il rischio di sostituzione? il coach ha effettivamente tolto l'atleta dopo errori? che sport è?). A offre una domanda finale orientata all'azione ('prima azione concreta dopo il prossimo errore'), che è utile ma non propriamente diagnostica. B non pone domande, il che è leggermente peggio per la scoperta, ma compensa con una struttura più chiara e naturale (il protocollo in 4 passi è ben sequenziato). A è leggermente più verbosa con i bullet points ma include la domanda. B è più fluida e conversazionale. Nel complesso le differenze sono minime e si compensano. | Entrambe capiscono bene che il nodo è il timore della sostituzione e non la routine in sé, e propongono di concentrarsi sulla prossima azione controllabile più un confronto col coach. A è leggermente preferibile perché chiude con una domanda concreta e ad alto valore che fa avanzare il coaching verso un comportamento specifico dell’atleta dopo l’errore. B è molto chiara e mirata, forse anche più pulita nel contenuto, ma resta più prescrittiva e meno interattiva nel turno successivo.

Baseline:

Capisco: non temi solo l’errore, ma la conseguenza che immagini subito dopo—essere tolto dal coach.

- **Dopo l’errore, interrompi la previsione:** dì mentalmente “È un errore, non una sostituzione”. Non puoi controllare la decisione del coach, ma puoi controllare la prossima azione.
- **Usa un reset di 5 secondi:** espira, guarda il coach o un riferimento del campo, pronuncia una parola-chiave come *“prossima”*, poi fai un’azione semplice e utile.
- **Cambia l’obiettivo:** non “devo dimostrare di non sbagliare”, ma “dopo l’errore devo restare presente e contribuire”.
- **Parlane con il coach fuori dalla gara:** “Quando sbaglio temo di essere tolto e gioco più contratto. Qual è il comportamento che vuoi vedere da me dopo un errore?”

Qual è la **prima azione concreta** che puoi fare dopo il prossimo errore per dimostrare presenza, indipendentemente da ciò che decide il coach?

Candidate:

Il problema non è l’errore in sé: è il significato immediato che gli dai — **“se sbaglio, mi toglie”**. La routine deve quindi occuparsi anche di questo pensiero, senza cercare di dimostrarti che non succederà.

Prova così, dopo l’errore:

1. **Riconosci:** “Ho sbagliato.”
2. **Rispondi al pensiero:** “La sostituzione non è sotto il mio controllo; la prossima azione sì.”
3. **Fissa un compito semplice:** ad esempio “mi smarco”, “marco il mio uomo”, “chiedo palla”.
4. **Riparti subito**, senza valutare se il coach ti sta guardando o cosa penserà.

La frase chiave potrebbe essere: **“Non devo evitare la sostituzione; devo rendere utile la prossima azione.”**

Fuori dall’allenamento o dalla gara, sarebbe anche utile chiedere al coach con calma: **“Dopo un errore, qual è la cosa concreta che vuoi vedere da me?”** Così sostituisci una paura vaga con un criterio chiaro.

### conversation-gradual-specialization:0:sample-3

Verdicts: candidate, candidate

Reasons: Entrambe le risposte terminano con una domanda diagnostica simile ('in quale momento perdi fiducia?'), ma differiscono significativamente nell'approccio prima della domanda. La Risposta A fornisce un elenco strutturato di 4 consigli dettagliati prima ancora di aver capito il contesto specifico dell'atleta (quale sport, quale momento, quale tipo di gara). Questo viola il principio fondamentale della scoperta prima del consiglio: il consiglio dato senza diagnosi è generico e potenzialmente irrilevante. La Risposta B è più contenuta: offre un breve reframe ('la fiducia non sparisce, viene coperta') e un singolo suggerimento pratico minimale, poi passa rapidamente alla domanda diagnostica. Questo approccio è più coerente con un coaching che prima esplora e poi consiglia. La domanda finale è quasi identica in entrambe, ma nel contesto della Risposta B ha più peso perché non è preceduta da un muro di consigli. La naturalezza conversazionale di B è superiore: è più concisa, meno formulaica (nessun elenco puntato con bold/corsivo eccessivo), e suona più come un dialogo reale. La Risposta A, pur essendo competente nei contenuti, assomiglia più a un articolo che a una conversazione di coaching. | B è preferibile perché resta più breve, più conversazionale e pone una domanda diagnostica abbastanza precisa che può orientare il passo successivo. A offre molti consigli prima di capire quando e come cala la fiducia: alcuni sono utili, ma anticipano troppo l’intervento rispetto allo scenario di approfondimento graduale. Entrambe avrebbero potuto partire direttamente dal primo segnale concreto, ma B conserva meglio la progressione.

Baseline:

È comune: in gara la pressione può far sembrare più fragili capacità che in allenamento ci sono già.

- **Prima della gara:** scegli 2 obiettivi controllabili, ad esempio “parto deciso” e “respiro tra un’azione e l’altra”, invece di pensare solo al risultato.
- **Durante:** usa una parola-chiave breve: *“presente”*, *“aggressivo”* o *“fluido”*. Ripetila prima dell’azione.
- **Dopo un errore:** espira lentamente, guarda un punto preciso e chiediti: **“Qual è la prossima azione utile?”** Niente analisi mentre stai gareggiando.
- **Allenamento mentale:** simula situazioni di pressione e allena la tua routine di reset, non solo la tecnica.

In quale momento perdi più fiducia: all’inizio, dopo un errore o quando il risultato è in bilico?

Candidate:

Capita spesso: in gara la fiducia non sparisce davvero, ma viene coperta da un errore, dal confronto o dalla paura di sbagliare.

Quando senti che cala, evita di cercare subito “fiducia”. Torna a un’azione controllabile: **respiro, postura, e una sola consegna tecnica** — per esempio: *“guarda il bersaglio”* o *“spingi forte”*.

In quale momento preciso la perdi: dopo un errore, all’inizio della gara o quando senti pressione dagli avversari?

### conversation-gradual-specialization:1:sample-3

Verdicts: baseline, baseline

Reasons: Both responses integrate the user's specific context (two consecutive errors in the final) well and provide practical reset routines. However, Response B edges ahead in several dimensions. B differentiates between the first and second error, showing more nuanced understanding. B ends with a targeted diagnostic question ('Qual è la tua prossima azione più semplice e sicura quando sei nel finale?') that invites the athlete to reflect on their own resources and could genuinely shape subsequent advice — this is a high-value question, not a ritual one. Response A provides solid advice but ends with a declarative statement and no question, closing the dialogue rather than progressing it. A's advice is slightly more formulaic (numbered list with generic steps). B's question also serves a coaching purpose: it helps the athlete identify their own 'safe play' under pressure, which is a real discovery step. Neither response asks enough discovery questions before giving advice (both jump to prescriptions), but B at least continues the discovery process at the end. | Entrambe usano bene il dettaglio fornito dall’utente: due errori consecutivi e fase finale. A è solida, concreta e non verbosa, ma chiude con consiglio completo senza una domanda di approfondimento o di applicazione. B offre una progressione leggermente migliore: distingue primo e secondo errore, propone un reset specifico e conclude con una domanda operativa che può aiutare a scegliere una consegna tecnica personalizzata per il finale. La domanda non è rituale: la risposta dell’atleta potrebbe rendere il coaching più specifico.

Baseline:

Capisco: due errori nel finale possono trasformarsi rapidamente da problema tecnico a dubbio mentale.

- **Dopo il primo errore:** pensa solo a correggere un dettaglio, non al risultato.
- **Dopo il secondo:** attiva un reset fisso di 5–10 secondi: espira lungo, rilassa spalle e mani, guarda un punto, ripeti **“una giocata alla volta”**.
- **Prima dell’azione successiva:** scegli un’intenzione concreta: *“profondo”, “semplice”, “aggressivo”* oppure un’indicazione tecnica specifica.
- **In allenamento:** simula finali sotto pressione partendo da due errori consecutivi; allena soprattutto la routine di recupero.

Qual è la tua prossima azione più semplice e sicura quando sei nel finale?

Candidate:

Dopo due errori consecutivi il rischio è entrare nella modalità **“devo recuperare subito”**. Nel finale questo aumenta ancora di più.

Usa una routine breve e sempre uguale:

1. **Reset fisico:** espira lentamente, rilassa spalle e mani.
2. **Accetta il punteggio:** “Sono due errori, non tutta la gara.”
3. **Una sola consegna:** scegli un’azione concreta, non “devo essere perfetto”.
4. **Obiettivo del prossimo gesto:** pensa solo al punto/azione successiva.

Frase utile: **“Reset. Una giocata pulita.”**

In allenamento, simula finali iniziando da una situazione negativa e allenati a eseguire questa routine prima dell’azione successiva. La fiducia crescerà non perché eviti gli errori, ma perché impari a ripartire dopo di essi.

