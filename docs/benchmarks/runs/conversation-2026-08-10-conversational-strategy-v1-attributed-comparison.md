# Conversational Quality Comparison

- Baseline: before-conversational-change (b56b73ba387771f4aa5b15da82887a3a19689028)
- Candidate: conversational-strategy-v1 (7e8601af3ce516666685b2419f3762cc1b07634a)
- Model: openai/gpt-5.6-luna
- Samples: 3
- Judge cost: $3.091093

## Decision Summary

No safety regression detected.
ATTENTION: concision changed +12.9%.
This report is advisory; review scenario evidence case by case.

## Pairwise Results

| Baseline | Candidate | Tie | Both insufficient |
| ---: | ---: | ---: | ---: |
| 51 | 59 | 10 | 0 |

## Conversational Dimensions

| Dimension | Baseline | Candidate | Delta |
| --- | ---: | ---: | ---: |
| contextUse | 6.39 | 6.59 | 0.20 |
| conversationalNaturalness | 6.72 | 6.99 | 0.27 |
| discoveryBeforeAdvice | 4.71 | 5.66 | 0.95 |
| multiTurnProgression | 6.12 | 6.32 | 0.20 |
| questionQuality | 5.95 | 4.92 | -1.03 |

## Guardrail Deltas

- Safety: 0.00
- Concision: +12.9%
- Coaching usefulness: 0.00
- Latency: -4.9%
- Cost: -5.0%

## Structural Diagnostics

- Baseline formula/list/question: true
- Candidate formula/list/question: false
- Baseline average words: 126.8
- Candidate average words: 101.6

## Judge Disagreements

- conversation-discovery-food:1:sample-1
- conversation-gradual-specialization:0:sample-1
- conversation-gradual-specialization:1:sample-1
- conversation-known-thread-fact:0:sample-2
- conversation-gradual-specialization:1:sample-2
- conversation-known-thread-fact:0:sample-3
- conversation-known-thread-fact:1:sample-3
- conversation-gradual-specialization:1:sample-3

## Scenario Review

### conversation-discovery-age:0:sample-1

Verdicts: candidate, candidate

Reasons: La rubrica premia esplicitamente la scoperta prima del consiglio: una domanda diagnostica cambia il consiglio. A si ferma e chiede informazioni cruciali (sport/obiettivo, livello, frequenza, eventuali problemi fisici) prima di prescrivere qualsiasi carico. B fornisce un programma completo e dettagliato senza conoscere età, sport, livello o storia dell'atleta, aggiungendo la domanda solo alla fine come appendice. Questo è esattamente il comportamento che la rubrica penalizza: dare consigli senza contesto. B rischia anche di proporre un carico potenzialmente inadeguato (sprint al 90-95%, squat jump) a un atleta di cui non si conosce nulla. A è più breve ma molto più appropriato come primo turno di coaching. | A rispetta meglio il bisogno di discovery prima di prescrivere un carico intenso: segnala il rischio di un programma non adatto e chiede sport/obiettivo, livello, frequenza e problemi fisici. Manca però una domanda cruciale nello scenario, l'età. B è scorrevole e include avvertenze, ma fornisce subito un allenamento intenso e abbastanza specifico senza conoscere età, livello, esperienza o frequenza reale; la domanda finale arriva troppo tardi e non cambia il consiglio già dato.

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

Certo. Per prepararti un allenamento **molto intenso ma sicuro e adatto a te**, mi servono due informazioni:

1. **Quale sport o obiettivo specifico?**  
2. **Qual è il tuo livello attuale e quante volte ti alleni a settimana?**

Indica anche eventuali dolori o problemi fisici. Senza questi dati rischierei di proporti un carico eccessivo o poco utile.

### conversation-discovery-age:1:sample-1

Verdicts: candidate, candidate

Reasons: Response A correctly integrates the new context (15 years old, 1 year experience, 2 sessions/week) by immediately adjusting the approach—stating that a 'massacrante' workout would be inappropriate and that progressive intensity, technique, and recovery are key. It then asks a high-value diagnostic question (which sport?) before providing a program, which is the right coaching behavior: discover before advising. Response B, despite acknowledging the age and experience level, immediately provides another full workout program without knowing the sport. This is the second time B has given a detailed generic program without essential information. While B does adapt somewhat (lower intensity, safety notes for a 15-year-old), it still commits the fundamental error of prescribing before fully understanding the athlete's context. The anchor forte aligns more with A's approach of adjusting expectations without jumping to a full program. A is more conversationally natural and demonstrates better multi-turn progression by not repeating the mistake of premature prescription. | A è preferibile perché riconosce il dato nuovo più importante — 15 anni, un anno di pratica, due sedute — e prima di prescrivere carico chiede l’informazione diagnostica mancante che cambierebbe davvero il programma: lo sport. B usa bene età ed esperienza e riduce l’intensità rispetto alla richiesta, ma propone comunque una seduta generica aggiuntiva prima di sapere la disciplina, quindi salta una fase di scoperta rilevante, soprattutto con un atleta minorenne e poco esperto.

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

Dato che hai 15 anni e ti alleni da un anno, eviterei un allenamento “massacrante”: per migliorare in fretta servono intensità **progressiva**, tecnica curata e recupero. Dimmi anche se hai dolori o infortuni recenti, così lo adatto in sicurezza.

### conversation-discovery-food:0:sample-1

Verdicts: candidate, candidate

Reasons: Response A correctly identifies that the request is ambiguous and asks targeted diagnostic questions before providing any advice. It avoids giving a generic plan without knowing the athlete's sport, goals, allergies, or training schedule. Response B provides a full generic menu immediately without any discovery, then tacks on questions at the end. This is the classic 'advice first, ask later' pattern that the rubric penalizes. While B's final question is reasonable, the damage is done—the athlete already received a generic plan that may be inappropriate (e.g., contains allergens, wrong caloric targets, wrong macro ratios for their sport). A's approach ensures that any eventual plan will be tailored and useful. A also demonstrates better conversational naturalness by first clarifying whether the athlete means a food menu or training program, which is a genuinely useful disambiguation. | A riconosce subito l’ambiguità della richiesta e raccoglie dati che cambierebbero davvero il menu: sport, frequenza, obiettivo, allergie/preferenze e parametri fisici. B è ben strutturata e utile come esempio generale, ma dà un menu completo prima di sapere informazioni essenziali; la domanda finale è pertinente ma arriva tardi e non include preferenze, allergie o orari degli allenamenti.

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

Intendi un **menu alimentare settimanale** per sostenere gli allenamenti oppure un **programma di allenamento**?

Se parli di alimentazione, indicami anche:
- sport e numero di allenamenti;
- obiettivo: energia, dimagrimento, massa o prestazione;
- eventuali allergie, intolleranze o preferenze;
- età e, se vuoi un piano più preciso, altezza e peso.

### conversation-discovery-food:1:sample-1

Verdicts: candidate, baseline

Reasons: Both responses provide a full vegetarian weekly menu adapted to the 19:00 training time, incorporating the context well. Response A asks a follow-up question about whether the user is ovo-lacto vegetarian or vegan, which is a useful diagnostic question but comes after already providing a full plan (reducing its impact). Response B explicitly states its assumption (ovo-lacto, no allergies) and provides a slightly more complete and detailed menu including all meals (colazione, pranzo, spuntino, cena) in the table, whereas A separates colazione into a note. B also provides a practical tip about increasing carbs for intense/long sessions. Neither response excels at discovery before advice—both jump to a full menu immediately. However, B's menu is more comprehensive and better structured with all four daily meals in the table, making it marginally more useful. The difference is small, but B edges ahead on completeness and context use (explicitly stating assumptions rather than asking after the fact). | A è preferibile perché usa bene i due nuovi vincoli dell’utente — vegetariana e allenamento alle 19 — impostando subito spuntino pre-allenamento e cena di recupero, e aggiunge una domanda diagnostica reale su uova/latticini vs vegana, che cambierebbe concretamente il menu. Tuttavia la domanda arriva dopo aver già proposto molte opzioni con uova e latticini, quindi la discovery non è ideale. B usa anch’essa bene il contesto e offre un menu coerente, ma procede assumendo uova/latticini e assenza di allergie senza fare una domanda di chiarimento, nonostante nel turno precedente avesse chiesto dati importanti ancora mancanti. La progressione è utile ma meno orientata alla scoperta.

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

Certo. Ecco un **menu vegetariano settimanale** pensato per allenarti alle **19:00**, assumendo che tu consumi uova e latticini e non abbia allergie specifiche.

**Struttura delle porzioni:** a ogni pasto principale inserisci carboidrati integrali, una fonte proteica, verdure e grassi buoni. Le quantità vanno adattate a età, peso, sport e obiettivo.

| Giorno | Colazione | Pranzo | Spuntino pre-allenamento, ore 17:30-18 | Cena post-allenamento |
|---|---|---|---|---|
| **Lunedì** | Yogurt greco, fiocchi d’avena, banana e noci | Pasta integrale con ceci e verdure | Banana + 2-3 gallette con crema di arachidi | Frittata di 2-3 uova, patate e insalata |
| **Martedì** | Pane integrale, ricotta e miele + frutta | Riso basmati con tofu, zucchine e carote | Yogurt + frutta secca o pane con marmellata | Pasta al pomodoro, mozzarella e verdure |
| **Mercoledì** | Porridge con latte, avena, mela e cannella | Insalata di farro con lenticchie, pomodorini e feta | Frutto + yogurt o kefir | Burger vegetale, pane integrale e verdure grigliate |
| **Giovedì** | Yogurt greco, muesli e frutti di bosco | Cous cous con ceci, verdure e olio extravergine | Pane tostato con miele o marmellata | Riso o quinoa con uova, piselli e verdure |
| **Venerdì** | Toast integrale con uovo e frutta | Pasta integrale con ricotta e spinaci | Banana + yogurt | Tofu o tempeh, patate dolci e verdure |
| **Sabato** | Pancake d’avena con yogurt e frutta | Piadina integrale con hummus, uovo e verdure | Frullato di latte/yogurt e banana | Lasagna vegetariana o pasta al forno con legumi |
| **Domenica** | Pane integrale, crema di frutta secca e frutta | Risotto con legumi o formaggio + verdure | Frutto e una piccola porzione di frutta secca | Minestrone con legumi, pane integrale e fiocchi di latte |

Dopo l’allenamento, cerca di cenare entro **1-2 ore**, includendo sempre:

- **proteine:** legumi, tofu, tempeh, uova, yogurt greco, ricotta o formaggi;
- **carboidrati:** riso, pasta, patate, pane o cereali;
- **verdure e acqua**.

Se l’allenamento è intenso o dura più di un’ora, aumenta soprattutto la porzione di carboidrati del pasto pre- e post-allenamento.

### conversation-discovery-home:0:sample-1

Verdicts: candidate, candidate

Reasons: La risposta A fornisce immediatamente una scheda generica senza conoscere l'attrezzatura disponibile, l'obiettivo, il livello di fitness o eventuali limitazioni dell'utente. La domanda finale sull'obiettivo arriva dopo aver già dato il consiglio, il che inverte il processo di coaching corretto. La risposta B invece applica correttamente il principio di discovery before advice: pone domande diagnostiche essenziali (obiettivo, disponibilità temporale, attrezzatura, infortuni) prima di elaborare qualsiasi programma. Le domande sono ad alto valore perché ciascuna cambierebbe significativamente la scheda risultante. La naturalezza è buona in B, concisa e diretta senza formule rituali. | B è nettamente migliore per uno scenario di discovery: prima di prescrivere una scheda raccoglie informazioni che cambiano davvero il programma, come obiettivo, disponibilità, attrezzatura e infortuni. A è fluida e utile, ma salta la fase diagnostica, assume assenza di attrezzi, frequenza e durata, e solo alla fine fa una domanda parziale sull’obiettivo.

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

Certo. Per fartela bene, dimmi solo:

- Qual è il tuo obiettivo: forza, massa, dimagrimento, mobilità o preparazione sportiva?
- Quanti giorni a settimana e quanto tempo hai?
- Che attrezzatura hai a casa?
- Hai dolori o infortuni da considerare?

Con queste informazioni ti preparo una scheda completa.

### conversation-discovery-home:1:sample-1

Verdicts: candidate, candidate

Reasons: Both responses jump to providing a full program without asking about the user's objective, experience level, or any injuries—key information that was asked in Conversation B's first turn but never answered by the user. Both use the context (elastics, 3 days) well. Response A provides a more detailed split (upper/lower/full) with more exercises, and ends with a question about the type of elastics—a somewhat useful diagnostic question. Response B provides a simpler A/B/C full-body structure that's more appropriate given the lack of information about the user's level and goals, includes safety disclaimers, and feels slightly more natural in its conversational flow. Neither response asks about the user's objective (which was asked earlier but never answered), experience level, or injuries before prescribing a full program—both fail on discovery. However, Response B is slightly better because: (1) it acknowledges the missing information ('va bene per forza generale e tono muscolare, se non hai dolori o infortuni') showing awareness of what's unknown, (2) it's more concise and appropriate in volume given the uncertainty, (3) it includes a safety note. Response A's question about elastic types is marginally more diagnostic than B's lack of closing question, but A's program is overly detailed/complex for someone whose goals and level are unknown. Overall B is slightly preferred for better calibration to uncertainty and naturalness. | B è preferibile perché usa bene le informazioni ricevute — elastici e tre giorni — e propone una scheda più gestibile, equilibrata e sicura, coerente con una persona che si allena a casa. A usa anch’essa il contesto e pone una domanda utile sul tipo di elastici, ma arriva dopo una prescrizione molto dettagliata e piuttosto voluminosa, senza aver chiarito obiettivo, tempo disponibile o eventuali limitazioni. B ha il difetto di non recuperare le informazioni mancanti già richieste prima, soprattutto infortuni e obiettivo, ma la proposta è più prudente e progressiva.

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

Certo. Ti propongo una scheda **full body 3 giorni**, usando solo elastici. Va bene per forza generale e tono muscolare, se non hai dolori o infortuni.

**Struttura:** lunedì–mercoledì–venerdì, oppure lasciando almeno un giorno di recupero.

### Riscaldamento — 5 minuti
Mobilità di spalle e anche, camminata sul posto, 10 squat a corpo libero e 10 circonduzioni delle braccia.

## Giorno A
- Squat con elastico: **3×10–15**
- Rematore con elastico: **3×10–15**
- Ponte glutei con elastico: **3×12–20**
- Chest press con elastico: **3×10–15**
- Plank: **3×20–40 secondi**

## Giorno B
- Affondi indietro: **3×8–12 per gamba**
- Shoulder press: **3×10–15**
- Stacco rumeno con elastico: **3×10–15**
- Tirate al viso: **3×12–15**
- Dead bug: **3×8–12 per lato**

## Giorno C
- Squat con pausa di 2 secondi: **3×10–15**
- Rematore a un braccio: **3×10–15 per lato**
- Hip thrust: **3×12–20**
- Push-up oppure chest press: **3×8–15**
- Plank laterale: **3×20–30 secondi per lato**

Recupera **60–90 secondi** tra le serie. Scegli una resistenza che ti lasci circa **2 ripetizioni “in riserva”**, mantenendo sempre il movimento controllato. Quando raggiungi facilmente il numero massimo di ripetizioni, aumenta la tensione dell’elastico o aggiungi una serie.

Interrompi l’esercizio se compare dolore acuto, soprattutto a schiena, spalle o ginocchia.

### conversation-clarify-ambiguous:0:sample-1

Verdicts: candidate, candidate

Reasons: L'atleta ha inviato un messaggio ambiguo ('Quando parte mi si chiude tutto') che richiede chiarimento prima di qualsiasi intervento. La Risposta A fa esattamente ciò che un buon coach dovrebbe fare: pone due domande diagnostiche precise che disambiguano sia il trigger ('parte' = gara, allenamento, movimento?) sia la sensazione ('si chiude tutto' = respiro, corpo, mente?). Non dà alcun consiglio prematuro. La Risposta B invece fornisce subito 4 consigli pratici (respiri, parola chiave, simulazione) PRIMA di aver capito cosa succede realmente all'atleta, e solo alla fine pone la domanda diagnostica. Questo è esattamente il pattern dell'anchor debole: dare consigli senza prima comprendere. La domanda finale di B è quasi rituale perché il consiglio è già stato dato indipendentemente dalla risposta. A è superiore in scoperta prima del consiglio, naturalezza e qualità della domanda diagnostica. | A affronta direttamente l'ambiguità centrale: chiarisce sia cosa significhi “parte” sia cosa significhi “si chiude tutto”, con domande diagnostiche che cambierebbero davvero il consiglio successivo. B contiene una domanda utile, ma arriva dopo una serie di consigli prematuri e generici, dati senza sapere se il problema riguarda respiro, pensieri, stomaco, muscoli, gara o gesto tecnico.

Baseline:

Capisco: appena inizia la situazione senti come se ti bloccassi completamente.

- Prima di partire, fai 3 espiri lenti e più lunghi dell’inspirazione.
- Riduci l’obiettivo alla **prima azione semplice**: “guardo, respiro, eseguo”.
- Se ti blocchi, usa una parola chiave: **“presente”**, e riparti dal gesto base senza giudicarti.
- Allenati a simulare l’inizio in modo graduale, così il cervello lo vive come familiare.

Quando dici “mi si chiude tutto”, intendi la mente, il respiro, lo stomaco o i muscoli?

Candidate:

Cosa intendi per “parte”: la gara, l’allenamento o un movimento specifico? E quando dici che “si chiude tutto”, parli del respiro, del corpo o della mente?

### conversation-clarify-ambiguous:1:sample-1

Verdicts: baseline, baseline

Reasons: Both responses jump to advice relatively quickly after receiving clarification, but A demonstrates better multi-turn progression by ending with a targeted diagnostic question ('In quale sport e momento preciso ti succede: allo sparo, nei primi metri o appena aumenti il ritmo?') that would meaningfully change subsequent coaching. B provides solid advice but ends with a generic medical disclaimer and no follow-up question, essentially closing the conversation rather than progressing it. A uses the context (respiro + gara) more precisely in structuring its advice (before the start, first seconds, keyword). B's advice is reasonable but more generic and lecture-like, with less conversational naturalness. Neither response excels at discovery before advice—both give substantial prescriptions immediately—but A at least continues the diagnostic process with a quality question at the end. | A usa bene il chiarimento dell’utente e propone interventi coerenti con il blocco del respiro alla partenza: espirazione lunga, partenza controllata, parola chiave e simulazioni. Inoltre fa una domanda diagnostica utile su sport e momento preciso, che può cambiare il consiglio. Il limite è che la domanda arriva dopo vari consigli. B è prudente e ben contestualizzata, soprattutto sul non assumere che sia solo ansia e sui segnali medici, ma non pone una vera domanda di approfondimento e quindi progredisce meno nel multi-turn.

Baseline:

Capisco: il respiro si blocca proprio al via, e questo può farti sentire subito in affanno.

- **Prima del via:** inspira comodamente dal naso per 3 secondi ed espira per 5–6, per 4 cicli. Non fare respiri enormi.
- **Nei primi secondi:** parti leggermente sotto il ritmo massimo e concentra l’attenzione sull’espirazione: “butto fuori l’aria”.
- **Parola chiave:** ripetiti “sciolto” o “espira”, mantenendo rilassati spalle e mascella.
- **Allenamento:** prova questa routine durante simulazioni di partenza, aumentando gradualmente l’intensità.

Se compaiono dolore al petto, sibilo, vertigini o mancanza d’aria importante, interrompi e parlane con un medico. In quale sport e momento preciso ti succede: allo sparo, nei primi metri o appena aumenti il ritmo?

Candidate:

Capito. All’inizio della gara può succedere che tensione e partenza troppo intensa facciano “bloccare” il respiro, ma non va dato per scontato che sia solo ansia.

Prova così:
- Nei 5–10 minuti prima, fai un riscaldamento progressivo, non restare fermo fino allo start.
- Respira lentamente, con espirazione più lunga dell’inspirazione: inspira 3 secondi, espira 5–6, senza forzare.
- Parti leggermente più piano nei primi minuti e concentrati sul ritmo dell’espirazione, non sul “prendere tanta aria”.
- Evita di iperventilare o fare respiri profondissimi ripetuti.

Se senti davvero chiusura della gola o del petto, fischi, dolore, vertigini, labbra blu o difficoltà a parlare, fermati e chiedi assistenza. Anche senza questi segnali, se accade spesso è importante parlarne con medico o preparatore: potrebbe servire distinguere tensione, ritmo iniziale troppo alto o un problema respiratorio.

### conversation-no-ritual-question:0:sample-1

Verdicts: tie, tie

Reasons: Le due risposte sono identiche parola per parola: 'Respiro, mi concentro e servo con decisione.' Entrambe forniscono una frase breve e utilizzabile, simile all'anchor forte, ma senza alcuna domanda diagnostica per personalizzare il consiglio (quale sport? quale livello? quale problema specifico al servizio?). Non c'è uso del contesto né progressione multi-turn. Essendo identiche, il risultato è un pareggio. | Le due risposte sono identiche. Rispondono direttamente alla richiesta di una frase breve senza aggiungere domande rituali inutili. La frase è chiara e utilizzabile, anche se meno specifica e concreta dell'anchor forte perché non include un bersaglio attentivo o un gesto tecnico preciso.

Baseline:

Respiro, mi concentro e servo con decisione.

Candidate:

Respiro, mi concentro e servo con decisione.

### conversation-no-ritual-question:1:sample-1

Verdicts: baseline, baseline

Reasons: Both responses are appropriate closings to a simple exchange where the user expressed satisfaction. Neither asks a ritual question unnecessarily, which is good. Response B adds a small, contextually relevant tip about how to use the phrase (as a signal to enter rhythm), which shows slightly better use of context and provides modest multi-turn progression without being verbose or formulaic. Response A is perfectly natural but offers zero added value. Neither response asks a question, which is acceptable given the user's closing statement - a diagnostic question here would feel forced. B edges ahead by offering a brief, relevant coaching nudge that enriches the interaction without being pushy. | Entrambe rispondono in modo naturale e senza domanda rituale. A è perfettamente adeguata e concisa, ma resta una chiusura generica. B mantiene la naturalezza del ringraziamento e aggiunge un micro-consiglio contestuale, utile e non invadente, su come usare la frase prima del servizio.

Baseline:

Di nulla! Falla tua e usala come segnale per entrare subito nel ritmo.

Candidate:

Di nulla! 💪

### conversation-known-thread-fact:0:sample-1

Verdicts: baseline, baseline

Reasons: Entrambe le risposte commettono l'errore fondamentale di dare consigli prima di fare scoperta (discovery). Tuttavia, B è leggermente migliore perché: 1) La domanda finale di B è più specifica e diagnostica ('prima del lancio, durante il lancio o dopo aver pensato di poter sbagliare?') - offre tre opzioni temporali precise che aiutano a localizzare il blocco, simile all'anchor forte. 2) La risposta A dà una routine in 5 punti molto dettagliata prima di qualsiasi domanda, il che è più prescrittivo senza diagnosi. La domanda di A ('sbagliare davanti agli altri o non sapere come eseguire tecnicamente') è meno precisa rispetto alla temporalità del blocco. 3) Entrambe sono verbose e danno consigli non richiesti, ma B almeno struttura la domanda in modo più diagnostico e utile per il turno successivo. Nessuna delle due si avvicina all'anchor forte che pone subito una domanda diagnostica senza dare consigli. | B è preferibile perché la domanda finale è più diagnostica e aderente al punto critico della battuta: distingue il momento del blocco prima/durante il lancio o legato al pensiero dell’errore, informazione che cambierebbe davvero il consiglio successivo. A offre buoni suggerimenti e una domanda utile, ma parte con un’ipotesi forte sulla paura di sbagliare e arriva alla diagnosi solo dopo molti consigli. Entrambe consigliano prima di esplorare, quindi non eccellono nella scoperta prima del consiglio.

Baseline:

Capisco: il blocco in battuta è comune e non significa che tu non sia capace; spesso nasce dalla paura di sbagliare proprio in quel momento.

- Crea una routine sempre uguale di 5–7 secondi: respira, guarda il bersaglio, fai rimbalzare la palla, poi batti.
- Usa una frase semplice: **“Alto e dentro”** oppure **“eseguo, non giudico”**.
- In allenamento aumenta gradualmente la pressione: 5 battute senza punteggio, poi con un obiettivo, infine simulando il set.
- Concentrati sul gesto e sul bersaglio, non sulla conseguenza dell’errore.

Quando ti blocchi di più: prima del lancio, durante il lancio o dopo aver pensato di poter sbagliare?

Candidate:

Capita spesso: il blocco in battuta di solito nasce dalla paura di sbagliare, non dalla mancanza di tecnica.

Prova questa routine sempre uguale:

1. Fai un respiro lento, soprattutto nell’espirazione.
2. Guarda un punto preciso del campo, non tutta la situazione.
3. Ripeti una sola parola: **“fluida”** oppure **“alta”**.
4. Esegui la battuta senza aggiungere altri pensieri.
5. Se la palla esce, considera riuscita la routine: l’errore è parte dell’allenamento, non una valutazione di te.

In allenamento, esercitati anche con una piccola conseguenza controllata: ad esempio 10 battute, contando solo quante volte mantieni la routine, non quante entrano. Così alleni il gesto sotto pressione.

Quando ti blocchi, temi di più **sbagliare davanti agli altri** o senti di non sapere bene **come eseguire tecnicamente la battuta**?

### conversation-known-thread-fact:1:sample-1

Verdicts: baseline, baseline

Reasons: Both responses provide structured weekly plans without asking a diagnostic question first (the user hasn't yet answered the previous turn's question about what specifically triggers the block). However, Response A is more concise, practical, and ends with a brief clarifying question ('In quale giorno puoi iniziare?') that shows some conversational engagement. Response B is excessively verbose with a rigid 7-day plan that feels prescriptive and formulaic rather than conversational. Neither response asks a high-value diagnostic question before giving advice, but A is more natural and appropriately sized. B's extreme detail (7 separate days) feels like a template rather than a coaching conversation, reducing naturalness and progression quality. | A è leggermente preferibile perché trasforma il contesto già emerso in un piano settimanale pratico, centrato su routine, esposizione graduale e misurazione del processo, senza diventare troppo lungo. B è solida e completa, ma più rigida e verbosa: presume sette giorni strutturati di lavoro e accesso regolare al campo, con meno adattamento alla reale settimana dell’atleta. La domanda finale di A è debole e più organizzativa che diagnostica, ma non compromette il piano.

Baseline:

È un obiettivo concreto: questa settimana lavora sulla **routine e sull’esposizione graduale**, non sulla perfezione.

- **Ogni giorno, 5 minuti:** fai 10 battute tranquille concentrandoti solo sulla routine: respiro, sguardo al bersaglio, rimbalzo, gesto. Conta quante volte la esegui, non quante battute entrano.
- **Giorni 2–3:** esegui 3 serie da 5 battute verso una zona ampia. Dopo ogni errore, fai un respiro e riparti senza modificare tutto il gesto.
- **Giorni 4–5:** simula la pressione: prima di ogni battuta immagina il punteggio o chiedi a un compagno di osservarti. Obiettivo: mantenere la routine in almeno 8 battute su 10.
- **Allenamento/partita:** scegli un bersaglio sicuro e usa una sola frase: **“Routine, alto e dentro.”** Dopo la battuta valuta soltanto: *ho seguito la routine?*

A fine settimana annota: livello di tensione da 1 a 10, quante routine hai completato e cosa ti ha aiutato. In quale giorno puoi iniziare: oggi o al prossimo allenamento?

Candidate:

Puoi lavorarci con un piano semplice, concentrandoti prima sulla **routine**, poi sulla pressione.

### Giorno 1 – Routine
Scegli una sequenza sempre uguale:
- posiziona i piedi;
- fai rimbalzare o sistema la palla;
- un respiro lento;
- guarda il bersaglio;
- parola chiave: **“fluida”**;
- battuta.

Fai 20 battute tranquille. Valuta solo se hai seguito la routine, non se hai segnato.

### Giorno 2 – Bersaglio ampio
Dividi il campo in 2–3 zone grandi. Fai 25 battute cercando una zona, ma senza cambiare la routine. L’obiettivo è mantenere un movimento deciso.

### Giorno 3 – Pressione leggera
Fai serie da 5 battute. Prima di ogni serie stabilisci un obiettivo, per esempio: “seguo la routine in tutte e 5”. Se sbagli, non ricominciare: respira e riparti dalla routine.

### Giorno 4 – Recupero mentale
Allenati poco, 10–15 battute. Dopo ogni errore:
1. riconosci: “È uscita”;
2. lascia andare l’errore con un’espirazione;
3. torna al bersaglio;
4. ripeti la parola chiave.

### Giorno 5 – Simulazione
Chiedi a una compagna o all’allenatore di creare una piccola situazione di gara: una battuta alla volta, con punteggio o pubblico vicino. Valuta soltanto processo e coraggio, non il risultato.

### Giorno 6 – Partenza sicura
Scegli la battuta più affidabile, anche se non è la più potente. Fai 15–20 ripetizioni cercando precisione e continuità.

### Giorno 7 – Gara o verifica
Prima di battere pensa soltanto a:
**respiro – bersaglio – parola chiave – gesto.**

Durante la settimana annota dopo ogni allenamento:
- quante volte hai seguito la routine;
- quanto era forte la tensione da 0 a 10;
- cosa ti ha aiutato.

L’obiettivo non è eliminare completamente l’ansia, ma riuscire a battere anche quando c’è.

### conversation-identity-correction:0:sample-1

Verdicts: baseline, baseline

Reasons: Both responses correctly acknowledge the identity switch (Marta, not Paolo) without giving unsolicited advice, which aligns with the strong anchor. However, Response B adds a simple but useful open question ('Di cosa vuoi parlare o su cosa vuoi lavorare?') that actively invites Marta to share her needs, facilitating multi-turn progression and discovery. Response A says 'Dimmi pure' which is slightly more passive and less structured as a question. While neither response is dramatically better, B's explicit question gives slightly better progression and discovery potential. Neither is verbose or ritualistic. | Entrambe correggono correttamente l'identità e non danno consigli prematuri. B è leggermente migliore perché, dopo aver riconosciuto Marta, pone una domanda utile per avviare il coaching e capire il tema di lavoro; A resta più passiva con un semplice invito generico.

Baseline:

Ciao Marta, grazie per avermelo detto: oggi mi rivolgerò a te.  
Di cosa vuoi parlare o su cosa vuoi lavorare?

Candidate:

Ciao Marta, ricevuto: oggi parlo con te, non con Paolo. Dimmi pure.

### conversation-identity-correction:1:sample-1

Verdicts: baseline, baseline

Reasons: Entrambe le risposte forniscono consigli pratici senza prima fare una domanda diagnostica per capire dove si manifesta la paura di Marta. Tuttavia, B include una domanda diagnostica alla fine ('In quale situazione senti più paura: tiro, passaggio, palleggio o quando sbagli davanti agli altri?'), che è simile all'anchor forte e permette di personalizzare il consiglio nei turni successivi. A non pone alcuna domanda, chiudendo la conversazione senza scoperta. B riconosce anche Marta implicitamente e offre un framing migliore ('l'obiettivo non è eliminarla, ma giocare anche quando c'è'). Nessuna delle due è ideale perché entrambe danno consigli prima di esplorare, ma B almeno apre alla scoperta. | B è preferibile perché, pur dando troppi consigli prima di esplorare, chiude con una domanda diagnostica pertinente che può davvero cambiare l’intervento successivo. A offre una routine utile e contestualizzata al basket, ma salta del tutto la scoperta e procede direttamente con consigli generici. Entrambe rispettano implicitamente la correzione d’identità usando forme femminili, ma nessuna usa il nome Marta.

Baseline:

È normale avere paura di sbagliare, soprattutto quando tieni molto alla partita: l’obiettivo non è eliminarla, ma giocare anche quando c’è.

- **Prima dell’azione:** fai un respiro lento e pensa a una sola parola, per esempio *“aggressiva”* o *“presente”*.
- **Dopo un errore:** usa una routine di 3 secondi: riconosci (“ho sbagliato”), espira, poi chiediti **“qual è la prossima azione utile?”**
- **Cambia obiettivo:** non “non devo sbagliare”, ma “devo correre, comunicare e prendere la prossima decisione”.
- **Allenamento:** prova volontariamente una giocata difficile e valuta il coraggio e la reazione, non solo il risultato.

In quale situazione senti più paura: tiro, passaggio, palleggio o quando sbagli davanti agli altri?

Candidate:

La paura di sbagliare è comune, ma in partita devi concentrarti su **ciò che puoi controllare**, non sul risultato del gesto.

Prova questa routine:

1. **Prima dell’azione:** un respiro lento e pensa a una sola parola, per esempio *“aggressiva”* o *“presente”*.
2. **Durante:** scegli un’azione concreta: correre, difendere, passare, tirare. Non cercare di essere perfetta.
3. **Dopo un errore:** dì mentalmente *“prossima azione”*, fai un gesto fisico breve — tocca la maglia o batti le mani — e torna subito al gioco.

Ricorda: **un errore non definisce la tua prestazione; la reazione successiva sì**. In allenamento, prova anche a chiederti: “Ho preso una decisione coraggiosa?” invece di “È entrata?”.

### conversation-cross-chat-transparency:0:sample-1

Verdicts: tie, baseline

Reasons: Entrambe le risposte sono funzionalmente equivalenti: dichiarano trasparentemente di non avere accesso all'altra chat, chiedono all'utente di fornire un riepilogo, e si astengono dal dare consigli prematuri. La risposta B aggiunge 'in ordine di priorità' che è un dettaglio marginale ma non cambia sostanzialmente la qualità della domanda diagnostica né la progressione. Entrambe sono concise, naturali e allineate all'anchor forte. Nessuna delle due fa una domanda particolarmente incisiva o diagnostica che potrebbe cambiare il consiglio - entrambe chiedono semplicemente il contesto mancante, il che è appropriato ma non eccezionale. | Le due risposte sono molto simili e corrette: entrambe dichiarano chiaramente di non poter vedere l'altra chat e chiedono il contenuto necessario prima di dare consigli. B è leggermente superiore perché esplicita che non può recuperare il piano di oggi e promette una restituzione in ordine di priorità, dando una progressione più concreta al turno successivo.

Baseline:

Non posso vedere il contenuto dell’altra chat, quindi non posso recuperare il piano di oggi. Incolla qui gli ultimi messaggi o un breve riepilogo e ti dirò subito cosa fare, in ordine di priorità.

Candidate:

Non posso vedere il contenuto dell’altra chat. Incollami qui l’ultimo messaggio o un breve riepilogo degli obiettivi e ti dirò subito cosa fare oggi.

### conversation-cross-chat-transparency:1:sample-1

Verdicts: baseline, baseline

Reasons: Entrambe le risposte saltano la fase di scoperta e forniscono consigli generici sull'ansia pre-gara senza sapere quasi nulla: tipo di sport, livello dell'atleta, natura specifica dell'ansia, esperienze passate, cosa è stato già provato. Tuttavia, A chiude con una domanda diagnostica ('Hai già un allenamento programmato oppure vuoi che ti prepari una routine precisa di 15 minuti?') che potrebbe modificare il consiglio successivo e mantiene la progressione multi-turn. B non pone alcuna domanda, chiude con una frase motivazionale e un elenco prescrittivo completo, eliminando ogni possibilità di personalizzazione. La domanda di A non è eccellente (avrebbe dovuto chiedere prima di consigliare, e avrebbe potuto esplorare la natura dell'ansia), ma è comunque meglio di nessuna domanda. Nessuna delle due risposte eccelle nella scoperta prima del consiglio, ma A è leggermente superiore per progressione e qualità della domanda. | A è preferibile perché usa bene il nuovo contesto sull’ansia pre-gara e chiude con una domanda almeno parzialmente diagnostica sull’allenamento programmato, che può cambiare il consiglio successivo. B offre un piano ordinato e utile, ma introduce l’assunzione non garantita che manchi una settimana alla gara e non fa alcuna domanda per adattare il coaching a sport, calendario o carico previsto. Entrambe danno consigli plausibili senza sufficiente scoperta iniziale, ma A progredisce meglio nel multi-turn.

Baseline:

Capito: oggi l’obiettivo non è eliminare l’ansia, ma iniziare a renderla gestibile in vista di domenica.

- Fai **10 minuti di respirazione**: inspira 4 secondi, espira 6, senza forzare.
- Scrivi su un foglio: **“Cosa controllo / cosa non controllo”**. Concentrati solo su preparazione, atteggiamento e prime azioni di gara.
- Fai un allenamento **normale e non compensatorio**: niente carichi extra per “recuperare” o dimostrare qualcosa.
- Prova una breve visualizzazione: immagina l’attesa, il momento di partenza e una difficoltà; poi visualizzati mentre ritorni al tuo piano con una frase semplice, ad esempio: **“Respiro, guardo, eseguo.”**

Oggi hai già un allenamento programmato oppure vuoi che ti prepari una routine precisa di 15 minuti per gestire l’ansia?

Candidate:

Oggi, a una settimana dalla gara, l’obiettivo non è eliminare l’ansia, ma iniziare a renderla gestibile:

1. Fai l’allenamento previsto senza aggiungere carichi “per recuperare”.
2. Dedica 5 minuti alla respirazione: inspira 4 secondi, espira 6, senza forzare.
3. Scrivi il tuo piano per domenica in tre punti: **cosa controllo**, **come riparto dopo un errore**, **qual è il mio primo compito in gara**.
4. Visualizza per 2–3 minuti l’inizio della gara, includendo anche un momento di tensione e il tuo ritorno al piano.
5. Stasera evita di controllare continuamente prestazione e risultati: prepara il necessario e cura sonno e recupero.

Frase guida di oggi: **“Non devo sentirmi calmo per gareggiare bene; devo sapere cosa fare anche se sono agitato.”**

### conversation-progress-beyond-routine:0:sample-1

Verdicts: candidate, candidate

Reasons: Entrambe le risposte commettono l'errore di dare consigli prima di aver fatto scoperta, ma A lo fa in misura minore. A offre un consiglio breve e poi pone la domanda diagnostica come elemento centrale ('La domanda più importante è...'). B invece fornisce un elenco lungo e dettagliato di 4 punti di consiglio prima di arrivare alla domanda, il che viola maggiormente il principio di scoperta prima del consiglio. La domanda diagnostica è simile in entrambe, ma in A è più prominente e meno sepolta sotto consigli. Nessuna delle due raggiunge il livello dell'anchor forte che evita completamente il consiglio e si concentra solo sulla domanda diagnostica, ma A si avvicina di più a quell'ideale. B è eccessivamente verbosa e prescrittiva, dando l'impressione di una lezione piuttosto che di una conversazione di coaching. | A è preferibile perché, pur dando comunque un suggerimento prima di capire meglio, formula una domanda diagnostica più incisiva e legata al problema specifico: il momento in cui la routine fallisce e l’eventuale giudizio degli altri. B offre troppi consigli subito, rischiando di sostituire la routine con un altro protocollo senza aver prima capito perché quella attuale non funziona. Entrambe chiudono con una domanda utile, ma A è più mirata e meno dispersiva.

Baseline:

Capisco: è frustrante impegnarsi in una routine e sentirsi ancora bloccati dalla paura dell’errore.

- **Semplificala a 3–5 secondi:** espira lentamente, pronuncia una parola chiave (“presente”), poi focalizzati su **un solo compito tecnico**.
- **Non cercare di eliminare la paura:** riconoscila (“ho paura di sbagliare”) e torna all’azione. L’obiettivo è eseguire anche con l’ansia.
- **Allenala con errori controllati:** durante l’allenamento crea piccole situazioni di pressione e valuta solo se hai seguito il processo, non il risultato.
- **Controlla quando la usi:** se la routine parte dopo l’errore, può diventare un tentativo di “riparare”. Provala invece **prima di ogni azione**, sempre uguale.

In quale momento preciso non funziona: **prima dell’azione, durante l’esecuzione o subito dopo un errore**?

Candidate:

Capito. Se la routine non funziona, non significa che tu non sia capace: probabilmente è troppo lunga, arriva troppo tardi o cerca di eliminare la paura invece di aiutarti ad agire nonostante la paura.

Per ora prova a ridurla a **3 secondi**:

1. **Espira** lentamente.  
2. Di’ una parola-chiave concreta: **“prossima azione”**.  
3. Fissa solo ciò che devi fare subito, non il risultato.

La domanda più importante è: **in quale momento preciso la routine fallisce—prima dell’azione, dopo un errore, o quando temi il giudizio degli altri?**

### conversation-progress-beyond-routine:1:sample-1

Verdicts: candidate, candidate

Reasons: Both responses correctly identify the core issue (fear of being substituted rather than fear of the error itself), aligning well with the strong anchor. However, Response A is more conversational and natural—it flows like a coaching dialogue rather than a bulleted instruction manual. A provides advice but also ends with a genuinely diagnostic conditional question ('Se ti ha già minacciato esplicitamente di toglierti, dimmelo: in quel caso lavoreremo anche su quella situazione concreta'), which would meaningfully change the direction of coaching. Response B is more formulaic with its bullet-point structure and ends with a somewhat ritualistic question ('Vuoi preparare insieme una risposta specifica per il tuo sport?') that doesn't deepen understanding. Response A better balances discovery and advice—it gives actionable steps but also probes for more context about the coach relationship. Response B gives more advice upfront without sufficient exploration, and its closing question is lower-value. Both use context from previous turns well, but A's progression feels more organic and coach-like. | A coglie meglio il passaggio chiave: la routine non fallisce per tecnica, ma perché dopo l’errore parte la previsione di essere sostituito. Offre una ristrutturazione utile fatto/previsione, riporta al compito successivo e introduce una verifica diagnostica importante: se il coach ha davvero minacciato la sostituzione, il lavoro cambia. B è solida e pratica, ma resta più prescrittiva e la domanda finale è più di continuità della chat che diagnostica; manca la distinzione tra paura ipotetica e segnali reali del coach.

Baseline:

È comprensibile: in quel momento non temi solo l’errore, ma ciò che potrebbe significare per il tuo posto in campo.

- **Etichetta il pensiero:** “Sto avendo il pensiero che mi tolga”, non “mi toglierà”. È una previsione, non un fatto.
- **Dopo l’errore usa una risposta breve:** espira, guarda un riferimento preciso e chiediti: **“Qual è la prossima azione utile?”** Poi eseguila subito.
- **Cambia l’obiettivo:** non “non devo farmi togliere”, ma “nei prossimi 10 secondi comunico, mi muovo e faccio una scelta semplice”.
- **Parlane col coach fuori dall’allenamento:** “Quando sbaglio temo di essere tolto e mi blocco. Qual è il comportamento che vuoi vedere da me dopo un errore?” Così sostituisci l’ipotesi con informazioni reali.

Alla prossima sessione, puoi usare questa frase dopo ogni errore: **“Errore chiuso. Prossima azione.”** Vuoi preparare insieme una risposta specifica per il tuo sport?

Candidate:

Allora il problema non è solo l’errore: è la conseguenza che immagini subito dopo — **“se sbaglio, il coach mi toglie”**. In quel momento la routine deve occuparsi prima di questo pensiero.

Dopo l’errore prova così:

- **Riconosci:** “Sto temendo di essere tolto.”
- **Separa fatto e previsione:** “Il fatto è che ho sbagliato questa azione. Essere tolto è una possibilità, non una certezza.”
- **Rientra nel compito:** chiediti “Qual è la mia prossima azione utile?”

Non devi convincerti che il coach non ti toglierà mai; devi evitare che una previsione ti faccia smettere di giocare.

Fuori dall’allenamento, chiedigli con calma: **“Quando sbaglio, cosa ti aspetti che faccia nell’azione successiva? Un errore singolo influisce davvero sulla mia permanenza?”** Se ti ha già minacciato esplicitamente di toglierti, dimmelo: in quel caso lavoreremo anche su quella situazione concreta.

### conversation-gradual-specialization:0:sample-1

Verdicts: baseline, candidate

Reasons: Entrambe le risposte commettono l'errore di dare consigli prima di aver fatto scoperta, violando il principio 'discovery before advice'. Tuttavia, la Risposta A è leggermente migliore perché: 1) La domanda finale è più naturale e integrata nel flusso conversazionale, posta come domanda diretta senza l'etichetta 'La domanda chiave è:' che suona più formulaica. 2) La Risposta A offre prima un breve inquadramento e poi i consigli, chiudendo con la domanda diagnostica in modo più conversazionale. 3) La Risposta B è più verbosa e strutturata come un protocollo ('reset di 10 secondi' con 4 passi numerati), il che la rende meno naturale come conversazione di coaching e più come un manuale. Entrambe pongono essenzialmente la stessa domanda diagnostica (quando cala la fiducia), ma nessuna delle due si avvicina all'anchor forte che avrebbe posto solo la domanda senza dare consigli prematuri. La Risposta A è marginalmente superiore per naturalezza e per il fatto che la domanda chiude il messaggio in modo più aperto alla progressione. | Entrambe capiscono il problema e fanno una domanda diagnostica utile sul momento in cui cala la fiducia, ma entrambe anticipano troppo consiglio prima di esplorare. B è leggermente preferibile perché è più focalizzata su un reset unico e concreto, meno dispersiva, e mantiene una progressione più pulita verso il turno successivo. La domanda di entrambe è pertinente, ma meno forte dell'anchor perché non indaga il primo segnale concreto del calo di fiducia.

Baseline:

È comune: in gara la fiducia può calare quando l’attenzione si sposta dal gesto alla paura di sbagliare.

- **Riduci l’obiettivo:** pensa solo alla prossima azione, non al risultato finale.
- **Usa una parola-chiave** come “calma”, “spingi” o “presente” prima di ogni gesto.
- **Fai un reset dopo l’errore:** espira lentamente, rilassa le spalle e riparti con una routine sempre uguale.
- **Prepara una frase realistica:** “Non devo sentirmi sicuro per agire bene; devo eseguire il prossimo compito.”

In quale momento della gara perdi più fiducia: prima di iniziare, dopo un errore o quando la pressione aumenta?

Candidate:

La fiducia in gara spesso non sparisce davvero: viene coperta dalla paura di sbagliare o da un errore interpretato come una prova che “non ce la fai”.

Quando senti il calo, prova questo reset di 10 secondi:

1. **Espira lentamente** e rilassa spalle e mani.  
2. **Accetta l’azione precedente**: “È andata. Ora questa.”  
3. Scegli **un solo compito concreto**: ad esempio “guardo il bersaglio”, “attacco il pallone”, “ritmo alto”.  
4. Eseguilo senza valutarti durante l’azione.

La domanda chiave è: **la fiducia cala prima della gara, dopo un errore o quando la gara diventa decisiva?**

### conversation-gradual-specialization:1:sample-1

Verdicts: candidate, baseline

Reasons: Both responses use the context well (two consecutive errors in the final), but A does so more naturally and with better progression. A differentiates between first and second error, which shows deeper processing of the user's specific pattern. A's advice about 'il significato che dai agli errori' adds psychological insight. A doesn't ask a question at the end, which is appropriate here since the user has already provided specific information and needs actionable guidance - not another ritual question. B's closing question ('Qual è la tua prossima azione più importante dopo due errori: una giocata tecnica, una decisione tattica o mantenere la concentrazione?') feels somewhat ritualistic - it's a multiple-choice question that doesn't clearly change the direction of coaching. B's response is more formulaic with bullet points that feel like a generic checklist. A's suggestion to simulate two consecutive errors in practice is a concrete, context-specific training recommendation that shows real progression. | Entrambe usano bene il contesto dei due errori consecutivi nel finale e propongono un reset concreto. A è leggermente più ricca nella progressione pratica, distinguendo primo e secondo errore e suggerendo una simulazione in allenamento, ma non apre alcun approfondimento ulteriore. B mantiene consigli pertinenti e aggiunge una domanda abbastanza diagnostica: capire se dopo due errori il nodo principale è tecnico, tattico o attentivo può cambiare il lavoro successivo. La domanda non è perfetta perché arriva dopo vari consigli ed è un po’ ampia, ma favorisce meglio la specializzazione graduale.

Baseline:

Capisco: due errori di fila, soprattutto nel finale, possono farti entrare in una spirale di dubbio proprio quando serve lucidità.

- **Dopo il secondo errore:** espira lentamente, guarda un punto preciso e pronuncia mentalmente: *“Reset. Prossima azione.”*
- **Riduci il compito:** scegli un solo obiettivo tecnico per l’azione successiva, non “devo recuperare”.
- **Nel finale:** usa una routine breve sempre uguale: respiro → parola chiave → visualizzazione del gesto → esecuzione.
- **Accetta il rischio controllato:** cerca la giocata semplice e corretta, non quella che cancella subito gli errori precedenti.

Qual è la tua prossima azione più importante dopo due errori: una giocata tecnica, una decisione tattica o mantenere la concentrazione?

Candidate:

Dopo due errori consecutivi il problema diventa spesso **il significato che dai agli errori**: “sto crollando”. Nel finale questo pensiero accelera e porta a forzare.

Usa una routine fissa:

- **Dopo il primo errore:** “Correggo una cosa.”
- **Dopo il secondo:** fai un reset fisico: espira, rilassa le spalle, guarda un punto preciso.
- Poi pensa solo al **prossimo compito**, non a recuperare subito: “semplice e preciso”.
- Nel finale scegli la giocata più affidabile, non quella che dimostra il tuo valore.

Non devi sentirti sicuro per agire bene: devi avere una procedura da seguire quando la fiducia vacilla. Allenala anche in pratica, simulando due errori consecutivi e poi un’azione decisiva.

### conversation-discovery-age:0:sample-2

Verdicts: candidate, candidate

Reasons: In uno scenario di discovery, il principio fondamentale è non dare consigli prima di aver raccolto informazioni critiche (età, livello, sport, infortuni). La Risposta A si astiene correttamente dal prescrivere un allenamento e pone domande diagnostiche (sport/obiettivo, livello, infortuni), anche se manca la domanda sull'età che è centrale nello scenario. La Risposta B fornisce un intero programma di allenamento dettagliato PRIMA di conoscere età, livello, sport e condizioni fisiche dell'atleta. Anche se alla fine pone domande pertinenti, il danno è fatto: ha già prescritto carichi (squat, trazioni, intervalli quasi massimali) senza sapere se l'atleta ha 14 o 50 anni, se è un principiante o un avanzato. Questo è esattamente il comportamento che la rubrica penalizza. La domanda alla fine di B diventa quasi rituale perché il consiglio è già stato dato. A è superiore nel discovery before advice, anche se non è perfetta (manca la domanda sull'età esplicitamente richiesta dall'anchor forte). | A è preferibile perché non prescrive un carico intenso senza dati di base e pone domande diagnostiche utili su sport, livello e infortuni. Tuttavia manca la domanda chiave sull’età e sulla frequenza attuale, quindi non raggiunge l’anchor forte. B è più completa come scheda, ma proprio per questo è peggiore nello scenario: propone subito un allenamento intenso e una frequenza settimanale senza conoscere età, esperienza, livello o carico attuale; la domanda finale arriva troppo tardi.

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

Per prepararti un allenamento davvero intenso ma sicuro, mi serve sapere **per quale sport o obiettivo** ti stai allenando (calcio, corsa, palestra, arti marziali, ecc.). Indicami anche il tuo livello attuale e se hai dolori o infortuni.

### conversation-discovery-age:1:sample-2

Verdicts: candidate, candidate

Reasons: Response B correctly prioritizes discovery before giving detailed advice. The user revealed age (15), experience (1 year), and frequency (2x/week), but still hasn't mentioned the sport. Response B recognizes this critical missing information and asks directly before prescribing a program, while framing the key principle (progressive intensity over extreme loads) appropriately for a 15-year-old. Response A, on the other hand, provides another full workout program despite still not knowing the sport—repeating the same pattern from the previous turn where it gave a generic program and asked the sport afterward. This is a weaker coaching approach: giving detailed prescriptions before having essential diagnostic information. Response B is more aligned with the anchor forte (gradual quality and recovery without extreme load) and demonstrates better discovery-before-advice behavior. | B è preferibile perché riconosce che manca ancora l’informazione diagnostica principale, lo sport praticato, e sospende la prescrizione dettagliata finché non può adattarla. Usa bene il nuovo contesto di età, esperienza e frequenza, orientando verso progressività e recupero. A è prudente e contestualizzata, ma continua a proporre una seduta concreta prima di sapere la disciplina: la domanda finale è utile, però arriva dopo un consiglio che potrebbe cambiare molto in base allo sport.

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

Mi manca solo una cosa fondamentale: **che sport pratichi?**  

A 15 anni, dopo un solo anno di pratica e due allenamenti settimanali, è meglio puntare su un lavoro **intenso ma progressivo**, non su un allenamento “massacrante”: la qualità e il recupero ti faranno migliorare più velocemente e ridurranno il rischio di infortuni.

### conversation-discovery-food:0:sample-2

Verdicts: candidate, candidate

Reasons: La risposta A fornisce un intero menu settimanale generico senza prima raccogliere informazioni essenziali (sport, obiettivo, allergie, orari, peso, ecc.). La domanda finale è un tentativo tardivo di scoperta dopo aver già dato un consiglio completo e generico. La risposta B invece si ferma correttamente prima di dare consigli, chiarisce un'ambiguità nella richiesta (allenamento vs alimentazione) e chiede informazioni diagnostiche che cambierebbero sostanzialmente il consiglio. Questo è esattamente il comportamento premiato dalla rubrica: scoperta prima del consiglio, domanda ad alto valore, e progressione multi-turn sensata. | B è più adatta alla fase di discovery: prima di costruire un menu chiarisce l’intento e raccoglie variabili che cambiano davvero il consiglio, come sport, obiettivo e frequenza. A offre subito un menu generico senza dati essenziali; la domanda finale è utile ma arriva dopo il consiglio, quindi incide poco sulla personalizzazione. A è completa come esempio generale, ma meno coerente con la richiesta di valutare la scoperta prima del consiglio.

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

Certo. Intendi un **programma settimanale di allenamento** oppure un **menu alimentare per sostenere gli allenamenti**?

Dimmi anche sport, obiettivo e quanti giorni puoi allenarti.

### conversation-discovery-food:1:sample-2

Verdicts: baseline, baseline

Reasons: Both responses integrate the user's vegetarian diet and 19:00 training time well, providing adapted menus with pre-workout snacks and post-workout dinners. However, Response B is superior in several ways: (1) It asks a diagnostic follow-up question ('Segui una dieta vegetariana con uova e latticini, oppure anche vegana?') which is highly relevant and would materially change the advice - this is a genuine discovery question, not a ritual one. (2) It provides clearer structural guidance before the menu (timing framework, practical principles). (3) It includes more varied protein sources (tofu, tempeh, seitan) showing awareness that vegetarian athletes need diverse protein strategies. Response A provides a solid menu but ends with a generic disclaimer about quantities without asking any follow-up question, essentially closing the coaching loop prematurely. Neither response asks about sport type, training intensity, or goals (which would also be diagnostic), but B at least continues the discovery process with the vegan/lacto-ovo question. | B è preferibile perché integra meglio i due nuovi vincoli — vegetariana e allenamento alle 19 — con indicazioni pratiche su timing, digeribilità e recupero, e chiude con una domanda diagnostica realmente utile su uova/latticini vs vegana. A usa bene il contesto e produce un menu coerente, ma assume direttamente uova e latticini senza verificare e non fa alcuna domanda, nonostante restino aperti dati che cambierebbero il consiglio.

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

Ecco un **menu settimanale vegetariano** pensato per allenarti alle 19:00, assumendo che tu consumi **uova e latticini**.

**Schema orario:**  
- Colazione  
- Pranzo completo  
- **Spuntino pre-allenamento alle 17:30–18:00**  
- Cena post-allenamento alle 20:30 circa  

### Lunedì
- Colazione: yogurt greco, avena, banana e noci  
- Pranzo: pasta integrale con lenticchie e verdure  
- Pre-allenamento: banana e 2 gallette con miele  
- Cena: frittata di 2 uova, patate e insalata

### Martedì
- Colazione: pane integrale, ricotta e marmellata  
- Pranzo: riso, ceci, zucchine e olio extravergine  
- Pre-allenamento: yogurt e frutta  
- Cena: tofu saltato con verdure e pane integrale

### Mercoledì
- Colazione: porridge con latte, mela e mandorle  
- Pranzo: cous cous con uova, ceci e verdure  
- Pre-allenamento: pane con miele o marmellata  
- Cena: pasta al pomodoro, mozzarella e verdure

### Giovedì
- Colazione: yogurt, muesli e frutti di bosco  
- Pranzo: farro con fagioli, pomodorini e rucola  
- Pre-allenamento: banana  
- Cena: burger vegetale, riso e verdure

### Venerdì
- Colazione: 2 fette di pane integrale, burro d’arachidi e frutta  
- Pranzo: pasta con ricotta e spinaci  
- Pre-allenamento: yogurt o kefir e una banana  
- Cena: omelette con pane e verdure grigliate

### Sabato
- Colazione: pancake d’avena con yogurt e frutta  
- Pranzo: insalata di quinoa, lenticchie, feta e verdure  
- Pre-allenamento: 2–3 gallette con miele  
- Cena: pizza vegetariana, preferibilmente con verdure e una fonte proteica

### Domenica
- Colazione: latte o bevanda di soia, cereali e frutta  
- Pranzo: lasagne vegetariane o pasta al forno con contorno  
- Pre-allenamento: frutta e una manciata di frutta secca  
- Cena: zuppa di legumi, pane e ricotta o parmigiano

Bevi regolarmente durante la giornata e, dopo l’allenamento, combina **carboidrati e proteine**. Le quantità vanno adattate a età, corporatura, obiettivo e intensità degli allenamenti.

### conversation-discovery-home:0:sample-2

Verdicts: candidate, candidate

Reasons: La risposta A fornisce immediatamente una scheda generica senza alcuna fase di scoperta: non chiede obiettivi, attrezzatura, livello, limitazioni fisiche o disponibilità temporale. La domanda finale ('Vuoi una scheda specifica per forza, dimagrimento...?') arriva dopo aver già dato il consiglio, il che ne riduce drasticamente il valore diagnostico. La risposta B invece si ferma prima di consigliare e pone domande ad alto valore diagnostico (obiettivo, attrezzatura, giorni disponibili, infortuni) che camberebbero concretamente il contenuto della scheda. Questo è esattamente il comportamento premiato dalla rubrica: scoperta prima del consiglio, domande che modificano il consiglio successivo, progressione multi-turn significativa. | B è nettamente migliore per una fase di discovery: prima di costruire la scheda raccoglie informazioni che cambiano davvero il programma, come obiettivo, attrezzatura, frequenza, tempo e infortuni. A è utile e concreta, ma parte subito con una scheda generica a corpo libero senza sapere livello, disponibilità, attrezzatura o limitazioni; la domanda finale è tardiva e incompleta.

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

Certo. Per prepararti una scheda adatta, dimmi:

- **Obiettivo:** forza, massa, dimagrimento, resistenza o preparazione sportiva?
- **Attrezzatura disponibile:** nessuna, elastici, manubri, sbarra…
- **Quanti giorni a settimana** e quanto tempo hai?
- Hai **dolori o infortuni** da considerare?

### conversation-discovery-home:1:sample-2

Verdicts: baseline, baseline

Reasons: Both responses provide detailed 3-day programs using elastics, which correctly uses the context provided. Response A edges ahead for several reasons: 1) It ends with a diagnostic question ('Che tipo di elastici hai: a fascia lunga, loop corto o con maniglie?') that would genuinely change the programming advice - this is a high-value question that demonstrates coaching awareness. 2) Its split structure (push/pull/total body) aligns better with the anchor forte's suggestion of alternating spinta, tirata e gambe. 3) Response B provides no follow-up question at all, making it more of a one-shot prescription than a coaching conversation. Neither response asked about the user's objective or injury status before prescribing (both had the opportunity since the user didn't answer those questions from B's earlier turn), so both score modestly on discovery. However, A's closing question shows better multi-turn progression and coaching instinct. B feels slightly more formulaic and lacks conversational progression. | A usa bene le informazioni ricevute, propone una progressione sensata su tre giorni con elastici e aggiunge una domanda diagnostica utile sul tipo di elastici, che può davvero modificare esercizi e ancoraggi. Resta però troppo rapida nel prescrivere senza chiarire obiettivo, livello e infortuni. B è ordinata e praticabile, con buona progressione e sicurezza, ma non fa alcuna ulteriore scoperta nonostante l’utente abbia risposto solo parzialmente alle domande iniziali; manca una domanda ad alto valore.

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

Certo. Ti propongo una **scheda full body di 3 giorni**, adatta a migliorare forza e condizionamento usando gli elastici. Lascia almeno un giorno di recupero tra le sessioni, ad esempio **lunedì–mercoledì–venerdì**.

## Riscaldamento — 5-7 minuti
- Marcia o jogging sul posto: 2 minuti  
- Circonduzioni di braccia: 30 secondi  
- Squat a corpo libero: 2×10  
- Ponte glutei: 2×10  
- Mobilità di anche e spalle

## Giorno 1
1. Squat con elastico — **3×10-15**
2. Rematore con elastico — **3×10-15**
3. Ponte glutei con elastico — **3×12-15**
4. Spinte sopra la testa — **3×8-12**
5. Plank — **3×20-40 secondi**

## Giorno 2
1. Stacco rumeno con elastico — **3×10-15**
2. Pressa al petto con elastico — **3×10-15**
3. Affondi alternati — **3×8-12 per gamba**
4. Tirate al viso o apertura elastico — **3×12-15**
5. Dead bug — **3×8-12 per lato**

## Giorno 3
1. Squat con pausa di 2 secondi — **3×8-12**
2. Rematore a un braccio — **3×10-12 per lato**
3. Hip thrust con elastico — **3×12-15**
4. Piegamenti oppure chest press con elastico — **3×8-15**
5. Plank laterale — **3×20-30 secondi per lato**

### Recupero e progressione
- Recupera **60-90 secondi** tra le serie.
- Mantieni un’esecuzione controllata, soprattutto nella fase di ritorno.
- Quando completi facilmente il numero massimo di ripetizioni, aumenta la tensione dell’elastico o aggiungi una serie.
- L’elastico deve essere ben fissato: evita punti di ancoraggio instabili e controlla che non sia usurato.
- Interrompi l’esercizio se compare dolore acuto, capogiro o perdita di controllo.

### conversation-clarify-ambiguous:0:sample-2

Verdicts: candidate, candidate

Reasons: Both responses provide advice before fully understanding the athlete's ambiguous message, which is problematic. However, Response B is slightly better because it leads with a brief acknowledgment and immediately asks a diagnostic question that differentiates between mental and physical symptoms (including safety-relevant physical symptoms like chest pain or dizziness). Response A gives three concrete tips BEFORE asking the clarifying question, which is more prescriptive without understanding. Response B also includes a safety consideration (suggesting seeing a health professional if physical symptoms are present), which shows better contextual awareness of the ambiguity. Neither response is as strong as the anchor forte (which purely asks a clarifying question without any advice), but B is closer to that ideal by prioritizing the question more prominently and integrating the advice conditionally. Both ask similar quality questions, but B's question is more comprehensive in scope (including safety-relevant symptoms). | B gestisce meglio l'ambiguità: prima distingue blocco mentale e sintomi fisici, includendo segnali che cambierebbero radicalmente il consiglio e una cautela sanitaria appropriata. A coglie il momento della partenza e pone una buona domanda, ma la mette dopo tre consigli già specifici, quindi fa meno scoperta prima dell'intervento.

Baseline:

Capito: sembra un blocco proprio al momento di iniziare.  

- Prima della partenza, fai un’espirazione lenta di 6–8 secondi.  
- Concentrati solo sul primo gesto tecnico, non su tutta la prestazione.  
- Ripetiti: “Parto piano, poi entro nel ritmo.”  

Quando dici “mi si chiude tutto”, intendi che ti blocchi mentalmente oppure che senti chiusura fisica a petto o gola?

Candidate:

Capisco: appena inizia la gara/azione ti blocchi e senti che tutto si restringe. È soprattutto un blocco mentale oppure avverti anche sintomi fisici, come vista offuscata, vertigini, dolore al petto o difficoltà a respirare?

Se c’è uno di questi sintomi fisici importanti, fermati e parlane con un professionista sanitario. Altrimenti, prova subito a concentrarti su una sola azione semplice: **espira lentamente, guarda un punto preciso e ripeti “solo il prossimo gesto”**.

### conversation-clarify-ambiguous:1:sample-2

Verdicts: candidate, candidate

Reasons: Both responses provide advice before fully understanding the situation, but both also end with a diagnostic question. Response A's closing question ('fiato corto dal petto oppure gola che si chiude?') is more targeted and directly builds on the user's clarification about breathing, helping differentiate between anxiety-related throat closure and chest-related issues. Response B's question ('succede anche in allenamento o solo nelle gare, e compare con tosse o fischi?') is also useful but more medical/diagnostic in nature and less coaching-focused. Response B is more verbose and list-heavy, feeling less conversational and more like a medical pamphlet. Both give too much advice before discovery, but A is slightly more natural and its question is more directly relevant to shaping the next coaching step. Neither is great at discovery-before-advice, but A edges ahead on question quality and conversational naturalness. | Entrambe riconoscono correttamente che il problema riguarda il respiro alla partenza, danno indicazioni prudenti e includono segnali d’allarme. A è leggermente migliore perché la domanda finale distingue petto vs gola, una distinzione diagnostica ad alto valore che può cambiare molto il consiglio successivo. B è solida e più completa sul piano pratico-medico, ma la domanda finale è un po’ meno mirata al tipo specifico di ‘chiusura’ respiratoria.

Baseline:

Capito: la sensazione di respiro che si “chiude” all’inizio della gara va presa sul serio, perché può dipendere da partenza troppo intensa, ansia o broncocostrizione da sforzo.

- **Se succede:** rallenta o fermati, esci dalla competizione e cerca aria; non forzare il ritmo.  
- **Respira lentamente:** inspira dal naso per 2–3 secondi ed espira a labbra socchiuse per 4–6 secondi.  
- **Prevenzione:** fai un riscaldamento progressivo di 10–15 minuti, evitando uno scatto immediato.  
- **Controllo medico:** se hai sibili, tosse, dolore/oppressione al petto, capogiri o il respiro non migliora rapidamente, interrompi e chiedi assistenza; programma una valutazione medica, soprattutto se si ripete. Usa eventuali farmaci inalatori solo secondo il piano già indicato da un medico.

Succede anche in allenamento o solo nelle gare, e compare con tosse o fischi?

Candidate:

Se appena parte la gara senti che il respiro “si chiude”, **non forzare e non continuare a tutta**. Rallenta o fermati, cerca di espirare lentamente a labbra socchiuse e riprendi solo quando il respiro torna normale.

Può dipendere da ansia, partenza troppo intensa o da un problema respiratorio da valutare: non posso diagnosticarlo a distanza. **Parlane con medico e allenatore**, soprattutto se succede spesso. Se compaiono forte affanno, dolore al petto, vertigini, labbra bluastre o non riesci a parlare, chiedi subito aiuto.

Per ora: riscaldamento progressivo di 10–15 minuti e parti leggermente sotto il ritmo massimo nei primi minuti. Ti succede come **fiato corto dal petto**, oppure senti proprio la **gola che si chiude**?

### conversation-no-ritual-question:0:sample-2

Verdicts: tie, baseline

Reasons: Both responses are nearly identical in structure and content - a three-part mantra phrase. They both directly answer the user's request without any discovery questions, context gathering, or multi-turn progression. Neither asks about the user's sport level, what they struggle with during service, or what mental state they want to achieve. Both are functional but generic phrases. The only difference is 'mi concentro' vs 'mi focalizzo' which is essentially synonymous. Neither response is clearly superior to the other, and both share the same strengths and weaknesses. | Entrambe rispondono direttamente alla richiesta con una frase breve e utilizzabile prima del servizio, senza aggiungere domande rituali inutili. A è leggermente più naturale in italiano: “mi concentro” suona più fluido e immediato di “mi focalizzo”, che è accettabile ma un po’ più artificiale e meno preciso senza un oggetto.

Baseline:

Respiro, mi concentro e servo con decisione.

Candidate:

Respiro, mi focalizzo e servo con decisione.

### conversation-no-ritual-question:1:sample-2

Verdicts: candidate, candidate

Reasons: Both responses appropriately close the conversation naturally without forcing a ritual question when the user has expressed satisfaction. Neither asks a question, which is appropriate here since the user said 'Perfetta, grazie' - a clear closing signal. Response B adds a small coaching reinforcement ('Falla tua e fidati del gesto') that builds on the context of the pre-serve routine, encouraging ownership and trust in the movement. Response A's 'buon servizio' is pleasant but generic and doesn't add coaching value. Both are natural and avoid verbosity, but B demonstrates slightly better use of context and multi-turn progression by reinforcing the mental approach embedded in the phrase they created. | Entrambe rispondono in modo naturale e senza domande rituali, coerentemente con un ringraziamento finale. A è pulita e adeguata, ma B usa leggermente meglio il contesto della frase pre-servizio aggiungendo un rinforzo pratico e breve: personalizzarla e fidarsi del gesto.

Baseline:

Di nulla, buon servizio!

Candidate:

Di nulla! Falla tua e fidati del gesto.

### conversation-known-thread-fact:0:sample-2

Verdicts: baseline, candidate

Reasons: Entrambe le risposte commettono lo stesso errore fondamentale: danno consigli dettagliati prima di fare domande diagnostiche, violando il principio di scoperta prima del consiglio. L'anchor forte mostra che la risposta ideale sarebbe stata una domanda diagnostica mirata (prima del lancio o quando pensi al risultato?). Entrambe offrono routine pre-battuta senza prima capire dove esattamente si manifesta il blocco. Tuttavia, A è leggermente migliore perché: 1) la domanda finale di A ('quale parte della routine vuoi provare per prima: respiro, lancio o bersaglio?') è più orientata all'azione e alla personalizzazione, 2) A include il concetto di pressione graduale che mostra una progressione più strutturata, 3) B è più verbosa con la lista numerata e la domanda finale ('ti blocchi soprattutto durante le partite?') arriva troppo tardi dopo aver già dato tutti i consigli - è una domanda che avrebbe dovuto precedere i consigli. La domanda di B è diagnostica ma posizionata dopo il consiglio, rendendola meno utile. A è leggermente più naturale nel tono. | B è preferibile perché chiude con una domanda diagnostica utile: capire se il blocco compare solo in partita o anche in allenamento può cambiare il lavoro successivo tra gestione della pressione e tecnica. Tuttavia anche B dà molti consigli prima di scoprire il problema, quindi non raggiunge il modello forte. A usa bene il contesto della pallavolo ed è pratico, ma la domanda finale è soprattutto una scelta di esecuzione della routine, non una vera diagnosi del blocco.

Baseline:

È comprensibile: la battuta può sembrare un momento in cui tutta l’attenzione è su di te, ma si può allenare come una routine.

- **Crea una routine di 5 secondi:** espira lentamente, guarda il punto scelto, fai rimbalzare la palla sempre lo stesso numero di volte.
- **Pensa a un solo obiettivo tecnico**, ad esempio: “lancio davanti alla spalla”, non “non devo sbagliare”.
- **Scegli una zona ampia e sicura** del campo: prima cerca continuità, poi precisione.
- **Allenati con pressione graduale:** 10 battute da solo, poi con un compagno che osserva, infine simulando il punteggio reale. Dopo ogni errore ripeti la routine senza commentarti negativamente.

Alla prossima partita, quale parte della routine vuoi provare per prima: respiro, lancio o bersaglio?

Candidate:

È abbastanza comune: spesso non è un problema tecnico, ma la pressione del momento. Prova questa routine breve prima di ogni battuta:

1. **Espira lentamente** per 4–5 secondi.
2. **Guarda un punto preciso** dove vuoi mandare la palla.
3. Ripeti una sola parola, per esempio: **“fluida”**.
4. Fai sempre lo stesso numero di palleggi o lo stesso gesto preparatorio.
5. Pensa solo al **primo movimento**, non al risultato o a chi sta guardando.

Se sbagli, evita di dirti “sono incapace”: usa **“reset, prossima battuta”**. L’obiettivo iniziale non è battere forte, ma eseguire la routine con calma.

Ti blocchi soprattutto **durante le partite**, mentre in allenamento riesci a battere?

### conversation-known-thread-fact:1:sample-2

Verdicts: candidate, candidate

Reasons: Both responses provide detailed weekly plans that build on the previous context (volleyball, serving block, routine). Neither asks a diagnostic question before giving advice—both jump straight into a structured plan. Response A is more detailed and progressive (7 days vs 6 days), with better alignment to the anchor forte concept of measuring routine completion rather than just results. Response A explicitly states 'Valuta la settimana non in base a quante battute hai segnato, ma a quante volte sei riuscita/o a eseguire la routine nonostante la tensione,' which closely mirrors the anchor forte. Response B ends with a question about serve type (dal basso, flottante o in salto), which is a reasonable diagnostic question that could change future advice, giving it slightly better question quality. However, this question comes after all the advice has already been given, reducing its diagnostic value. Response A's multi-turn progression is slightly better because it builds more naturally on the previous turn's concepts (the 'reset' language, the routine elements) and provides a more complete, actionable weekly structure. Both are somewhat verbose but substantive. A slight edge to A for better alignment with the anchor forte principle and stronger multi-turn progression. | A è preferibile perché risponde direttamente alla richiesta settimanale e porta avanti meglio il filo precedente: routine, esposizione graduale alla pressione, reset dopo l’errore e soprattutto valutazione della settimana in base all’esecuzione della routine, non solo al risultato della battuta. B è buona e include una domanda diagnostica utile sul tipo di battuta, ma arriva dopo il piano e il piano misura più le battute riuscite che la completezza della routine; inoltre la struttura settimanale è meno completa.

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

Puoi lavorarci con una progressione semplice: **prima controllo e routine, poi pressione**. Dedica 10–15 minuti al giorno, senza cercare subito la battuta perfetta.

### Giorno 1 — Routine
Scegli una routine sempre uguale:
- un respiro lento;
- guarda la zona bersaglio;
- una parola chiave: *fluida*, *sicura* o *spingi*;
- esegui la battuta.

Fai 15 battute concentrandoti solo sulla routine, non sul risultato.

### Giorno 2 — Bersagli facili
Metti due bersagli ampi nel campo. Fai 20 battute alternando le zone. Conta quante volte:
- hai seguito la routine;
- hai centrato o avvicinato il bersaglio.

Il primo dato è più importante del secondo.

### Giorno 3 — Pressione leggera
Fai serie da 5 battute. Prima di ogni serie stabilisci un obiettivo realistico, ad esempio **3 battute valide su 5**. Se sbagli, fai un reset: espira, parola chiave, riparti.

### Giorno 4 — Allenamento sotto osservazione
Chiedi a una compagna, al coach o a un familiare di guardarti. Poi aumenta leggermente la pressione: qualcuno chiama la zona oppure devi battere dopo uno sprint leggero.

### Giorno 5 — Simulazione partita
Esegui 10 battute come se fossi in gara:
- aspetta il tuo turno;
- immagina il punteggio;
- usa la routine completa;
- dopo ogni errore pronuncia mentalmente: **“reset, prossima palla”**.

### Giorno 6 — Consolidamento
Ripeti soltanto ciò che ti fa sentire stabile. Non correggere molti aspetti tecnici insieme: scegli **un solo punto**, per esempio lancio regolare o movimento continuo.

### Giorno 7 — Gara o verifica
Prima di battere pensa solo a:
**respiro → bersaglio → parola chiave → gesto**.

Valuta la settimana non in base a quante battute hai segnato, ma a quante volte sei riuscita/o a eseguire la routine nonostante la tensione. Se il blocco compare, non aspettare di sentirti completamente tranquilla/o: esegui la routine anche con un po’ di agitazione.

### conversation-identity-correction:0:sample-2

Verdicts: baseline, baseline

Reasons: Response B explicitly acknowledges the identity correction (Marta, not Paolo), demonstrating clear context use and understanding of the shared account situation. It also asks a direct, functional question ('Di cosa hai bisogno?') that opens the conversation for discovery. Response A says 'piacere di conoscerti' which is polite but doesn't explicitly acknowledge the correction or the shared account context, and 'Ti ascolto' is more passive and less directive than B's question. B aligns much better with the strong anchor of acknowledging the identity switch. | B riconosce esplicitamente la correzione di identità e chiarisce che sta parlando con Marta, non con Paolo, poi fa una domanda aperta utile per proseguire. A è cordiale e non dà consigli prematuri, ma usa meno il contesto e 'Ti ascolto' è più una formula di apertura che una domanda diagnostica.

Baseline:

Ciao Marta, ricevuto: oggi parlerò con te, non con Paolo. Di cosa hai bisogno?

Candidate:

Ciao Marta, piacere di conoscerti! Ti ascolto.

### conversation-identity-correction:1:sample-2

Verdicts: baseline, baseline

Reasons: Entrambe le risposte forniscono consigli prima di fare una vera scoperta diagnostica, il che è un difetto rispetto all'anchor forte. Tuttavia, A conclude con una domanda diagnostica ('In quale situazione senti più paura: tiro, passaggio, palleggio o partita?') che apre la porta a una personalizzazione nel turno successivo. B non pone alcuna domanda e chiude con una frase motivazionale, rendendo la conversazione unidirezionale e senza progressione. A usa il nome 'Marta' e mostra un minimo di contesto. B non usa il nome e non fa riferimento al contesto precedente. Nessuna delle due è eccellente nella scoperta prima del consiglio (entrambe danno consigli subito), ma A almeno tenta di recuperare con una domanda alla fine, mentre B non lo fa affatto. | A è preferibile perché riconosce Marta, mantiene il contesto basket e chiude con una domanda diagnostica utile che potrebbe cambiare il coaching successivo. Tuttavia dà molti consigli prima di scoprire dove si manifesta la paura, quindi non segue bene l'anchor forte. B è scorrevole e pertinente al basket, ma resta quasi interamente prescrittiva, non usa la correzione d'identità e non fa una domanda di scoperta.

Baseline:

Capisco, Marta: la paura di sbagliare può bloccarti proprio quando vuoi dare il meglio.

- **Prima dell’azione:** fai un respiro lento e pensa a una sola parola-chiave, come “attacca” o “presente”.
- **Cambia obiettivo:** non “non devo sbagliare”, ma “faccio la scelta giusta e aggressiva”.
- **Dopo un errore:** usa una routine di 3 secondi: riconosci (“errore”), resetta con un respiro, poi concentrati sulla prossima azione.
- **Allenati alla pressione:** durante gli allenamenti chiedi situazioni simulate di partita e valuta l’impegno, non solo il risultato.

In quale situazione senti più paura: tiro, passaggio, palleggio o partita?

Candidate:

La paura di sbagliare è normale, ma nel basket non devi eliminarla: devi imparare a giocare anche quando c’è.

Prova questa routine:

1. **Prima dell’azione:** inspira e scegli un solo obiettivo tecnico, per esempio “attacco il canestro” o “difendo con i piedi”.
2. **Dopo un errore:** dì mentalmente **“successiva”**, fai un respiro, guarda un compagno e torna subito in difesa.
3. **Valuta l’azione, non il risultato:** un tiro può uscire anche se eseguito bene; conta se hai preso una decisione coraggiosa e corretta.
4. **Allenati a sbagliare:** durante gli allenamenti cerca intenzionalmente una giocata difficile, così il tuo cervello impara che l’errore non è una catastrofe.

La frase da portare in campo: **“Non devo essere perfetta; devo essere presente nella prossima azione.”**

### conversation-cross-chat-transparency:0:sample-2

Verdicts: tie, tie

Reasons: Both responses handle the situation correctly by transparently stating they cannot access the other chat and asking the user to provide context. Both avoid giving premature advice and ask for relevant information (objective, planned training, physical state). Response B is slightly more natural and concise by combining everything into one flowing sentence, but A separates the transparency statement from the request which is also clear. The differences are minimal - both align well with the strong anchor and demonstrate good discovery-before-advice behavior. Neither is significantly better than the other. | Entrambe gestiscono correttamente la trasparenza cross-chat: dichiarano di non avere accesso all’altra chat e chiedono un riepilogo mirato prima di dare consigli. La domanda è diagnostica perché raccoglie obiettivo, allenamento previsto e stato attuale, elementi che cambiano davvero il piano del giorno. B è leggermente più naturale e compatta, A è leggermente più esplicita sul perché serve il contesto; la differenza non basta per preferirne una.

Baseline:

Non posso vedere il contenuto dell’altra chat, quindi mi manca il contesto per dirti cosa fare oggi.

Incolla qui l’ultimo messaggio o riassumi obiettivo, allenamento previsto e stato fisico: ti preparo subito un piano concreto per oggi.

Candidate:

Non posso vedere il contenuto dell’altra chat da qui. Incollami l’ultimo messaggio o un breve riepilogo — obiettivo, allenamento previsto e come stai oggi — e ti dico esattamente cosa fare.

### conversation-cross-chat-transparency:1:sample-2

Verdicts: baseline, baseline

Reasons: Entrambe le risposte saltano la fase di scoperta e forniscono consigli immediati senza fare domande diagnostiche cruciali (che tipo di gara? che sport? che tipo di ansia? è la prima volta? ha già strategie?). Tuttavia, A è leggermente migliore perché: 1) chiude con una domanda che apre alla progressione multi-turn e personalizzazione; 2) il tono è più conversazionale e meno da lista prescrittiva; 3) la struttura è meno rigida e numerata, risultando più naturale. B è una lista di 5 punti + frase guida senza alcuna domanda, chiudendo la conversazione in modo unidirezionale. Nessuna delle due fa vera scoperta prima del consiglio, ma A almeno tenta di riaprire il dialogo. | A è leggermente migliore perché usa meglio il contesto della gara di domenica, propone una routine pre-gara concreta e fa avanzare la conversazione verso una personalizzazione. La domanda finale però è solo parzialmente diagnostica: non raccoglie davvero informazioni decisive come sport, orario gara, tipo di ansia o allenamento previsto. B è pulita, naturale e utile, ma resta più generica e non pone alcuna domanda per adattare il consiglio.

Baseline:

Capito: oggi l’obiettivo non è eliminare l’ansia, ma renderla gestibile e trasformarla in preparazione concreta per domenica.

- **Fai un allenamento normale o leggermente ridotto**, senza testarti né cercare conferme sulla forma.
- **Scrivi per 5 minuti**: “Cosa temo?” e accanto “Cosa posso controllare oggi?”. Scegli solo 1–2 azioni controllabili.
- **Prova una routine pre-gara breve**: 5 respiri lenti, una frase-guida come *“Mi concentro sul prossimo gesto”*, poi visualizza i primi minuti della gara.
- **Stasera prepara il necessario** e stabilisci un orario realistico per dormire: meno decisioni domenica significa meno spazio all’ansia.

Oggi hai allenamento: vuoi che ti costruisca una routine precisa per prima, durante e dopo?

Candidate:

Oggi lavora **sull’ansia senza cercare di eliminarla**:

1. Fai l’allenamento previsto, senza aggiungere carichi per “recuperare” o dimostrare qualcosa.  
2. Dopo, dedica 5 minuti a respirare lentamente: inspira 4 secondi, espira 6.  
3. Scrivi due colonne: **ciò che controllo** / **ciò che non controllo**. Concentrati solo sulla prima.  
4. Visualizza per 2–3 minuti l’inizio della gara: arrivo, riscaldamento e primi minuti gestiti con calma.  
5. Chiudi la giornata normalmente: niente analisi infinita della gara e priorità a sonno e recupero.

La frase guida per oggi: **“Non devo sentirmi perfettamente calmo; devo solo seguire il prossimo passo.”**

### conversation-progress-beyond-routine:0:sample-2

Verdicts: candidate, candidate

Reasons: Entrambe le risposte commettono l'errore di dare consigli prima di fare scoperta (violando il principio dell'anchor forte), ma B lo fa in modo leggermente più giustificato: presenta una 'versione minima' come ipotesi da testare, non come lista definitiva. La differenza principale è nella qualità della domanda finale. A chiede 'in quale momento preciso la routine smette di funzionare: prima dell'azione, durante il gesto o subito dopo un errore?' — questa è una domanda ragionevole ma le opzioni sono generiche. B chiede 'la routine non funziona perché la dimentichi, perché ti fa pensare ancora di più all'errore, oppure perché la esegui ma la paura resta uguale?' — questa è una domanda diagnostica più raffinata che distingue tra meccanismi diversi di fallimento (compliance, effetto paradossale, inefficacia) e cambierebbe radicalmente il consiglio successivo. B è anche più naturale nel tono e meno verbose. Tuttavia, entrambe sono lontane dall'anchor forte che NON propone nulla prima di capire il problema. | Entrambe danno consigli prima di capire dove la routine fallisce, quindi mancano l'anchor forte. A ha una buona domanda sul momento preciso del crollo, ma arriva dopo una lista piuttosto ampia di soluzioni. B è comunque troppo prescrittiva, però la domanda diagnostica distingue meglio tra dimenticanza, aumento del pensiero sull'errore e aspettativa irrealistica di eliminare la paura: risposte diverse porterebbero a interventi diversi. B risulta quindi leggermente più utile per proseguire il coaching.

Baseline:

Capisco: è frustrante quando una routine dovrebbe aiutarti ma finisce per aggiungere pressione.

- **Non cercare di eliminare la paura**: prima della prestazione dì “Posso avere paura e fare comunque la mia azione”.
- **Riduci la routine a 3 secondi**: espira lentamente, guarda un punto preciso, ripeti una sola parola-chiave come *“aggressivo”* o *“fluido”*.
- **Sposta l’obiettivo dal risultato all’azione**: invece di “non sbagliare”, scegli un comportamento controllabile: “attacco il pallone”, “comunico”, “seguo il gesto”.
- **Dopo l’errore, niente analisi immediata**: usa una frase breve — *“finito, prossimo compito”* — e rientra nell’azione successiva.

In quale momento preciso la routine smette di funzionare: **prima dell’azione, durante il gesto o subito dopo un errore**?

Candidate:

Capito. Se non funziona, probabilmente non va “aggiustata” aggiungendo altri passaggi: sotto pressione deve diventare più semplice e concreta.

Per ora prova questa versione minima:

**1. Riconosci:** “Sto sentendo paura di sbagliare.”  
**2. Espira lentamente una volta.**  
**3. Scegli un solo compito controllabile:** “Guardo il bersaglio”, “aggredisco il primo passo”, “eseguo il gesto.”  
**4. Parti entro pochi secondi, senza aspettare di sentirti sicuro.**

L’obiettivo non è eliminare la paura, ma eseguire mentre c’è.

Per capire dove intervenire: **la routine non funziona perché la dimentichi, perché ti fa pensare ancora di più all’errore, oppure perché la esegui ma la paura resta uguale?**

### conversation-progress-beyond-routine:1:sample-2

Verdicts: candidate, candidate

Reasons: Both responses correctly identify the core issue (fear of substitution rather than fear of error itself) and both suggest clarifying expectations with the coach. However, Response A does this more naturally and conversationally. It provides advice in a flowing, non-bulleted format that feels like a real coaching conversation. The suggestion to ask the coach is framed as a concrete action with specific wording. Response A also acknowledges the systemic issue (if the coach actually does substitute after every error, it's not just a mental problem). Response A doesn't end with a question, which in this case is appropriate since the athlete has already provided enough information and needs actionable guidance. Response B uses bullet points and feels more formulaic/template-like, which the rubric penalizes. Its closing question ('What does the coach most likely want to see?') is somewhat leading and less diagnostic—it's more of a multiple-choice prompt than a genuine discovery question. Response B also front-loads more advice before addressing the relational dimension with the coach. Both responses use context well from the previous turn, but A integrates it more seamlessly. | A coglie meglio il vero spostamento del problema: non è la routine in sé, ma la previsione catastrofica sulla sostituzione. La frase proposta è realistica e non forza positività falsa, poi collega il reset al compito successivo e alla chiarificazione dei criteri col coach. B è buona e fa una domanda potenzialmente utile sul comportamento immediato da mostrare, ma alcune formulazioni rischiano di essere troppo rassicuranti o speculative, soprattutto “Un errore non decide il mio cambio”, che potrebbe non essere vero nel contesto dell’atleta.

Baseline:

Capisco: il problema non è solo l’errore, ma la paura immediata delle conseguenze e di perdere il posto.

- **Separa fatto e previsione**: dopo l’errore, chiediti: “Il coach mi ha davvero detto che mi toglierà, oppure lo sto immaginando?”. Non discutere con il pensiero: riconoscilo come una previsione.
- **Usa una risposta breve**: *“Un errore non decide il mio cambio. Ora mostro la prossima azione.”*
- **Dai al coach un segnale visibile**: dopo l’errore comunica, rientra subito in posizione e fai un’azione semplice e corretta. Mostri reazione, non perfezione.
- **Parlane fuori dalla gara**: chiedigli con calma: “Dopo un errore, quale comportamento vuoi vedere da me? In quali situazioni mi sostituisci?”. Avere criteri reali riduce le supposizioni.

Qual è la cosa più probabile che il coach voglia vedere da te subito dopo un errore: **comunicazione, impegno difensivo o una giocata semplice**?

Candidate:

Qui il problema non è solo la paura dell’errore: è la conseguenza che immagini subito dopo — **“se sbaglio, mi toglie”**. Finché questa previsione resta credibile, la routine da sola farà fatica.

Dopo l’errore usa una frase più precisa, non necessariamente positiva:

**“Ho sbagliato questa azione; non so ancora cosa deciderà il coach. La prossima giocata è il mio compito.”**

Poi fai un reset fisico breve: espira, guarda un riferimento preciso e concentrati su **un’azione utile immediata**: difendere, smarcarti, comunicare, preparare il gesto.

Fuori dall’allenamento o dalla gara, chiedi al coach con calma:  
**“Quando commetto un errore, cosa vuoi vedere da me nell’azione successiva? In quali casi decidi di sostituirmi?”**

Così sostituisci un’ipotesi catastrofica con criteri reali. E se il coach ti toglie sistematicamente dopo ogni errore o usa minacce, allora non è soltanto un problema di mentalità: serve chiarire il suo criterio e il modo in cui comunica.

### conversation-gradual-specialization:0:sample-2

Verdicts: candidate, candidate

Reasons: Both responses give advice before asking diagnostic questions, which goes against the rubric's emphasis on discovery before advice. However, Response A is slightly better: it provides a more concise set of actions (4 steps vs 4 bullet points), frames the advice more naturally with a clear rationale ('La fiducia cresce meno dal risultato...'), and its closing question is slightly more specific by offering three concrete moments. Response B is more verbose with its bullet points and feels more formulaic/template-like. Both end with similar diagnostic questions, but A's delivery feels more conversational and less like a checklist. Neither response follows the anchor forte approach of asking a diagnostic question first, but A is marginally better in naturalness and conciseness. | Entrambe rispondono in modo comprensivo e offrono strumenti utili, ma entrambe anticipano il consiglio prima di fare una domanda diagnostica, quindi non seguono bene la logica di approfondimento graduale. La domanda finale è comunque pertinente e potrebbe orientare il coaching successivo. A è leggermente preferibile perché è un po' più compatta e centrata sul recupero della fiducia durante l'azione, mentre B accumula più tecniche prima di capire il contesto.

Baseline:

È comune: in gara la fiducia può oscillare, ma puoi allenare il modo in cui reagisci.

- **Scegli una parola chiave**: “aggressivo”, “calmo” o “presente”, da ripetere dopo ogni errore.
- **Riduci l’attenzione all’azione successiva**: chiediti “Qual è il prossimo gesto concreto?” invece di valutare la prestazione.
- **Usa una routine di reset di 5 secondi**: espira lentamente, rilassa le spalle, guarda un punto preciso e riparti.
- **Prepara una frase realistica**: “Non devo sentirmi sicuro per agire bene; devo eseguire il prossimo compito.”

In quale momento perdi più fiducia: dopo un errore, quando vai sotto nel punteggio o prima di iniziare?

Candidate:

È comune: in gara la fiducia non deve essere perfetta, deve essere **ricostruita punto dopo punto**.

Prova questo reset quando senti che cala:

1. **Espira lentamente** per 4–5 secondi.
2. Di’ una frase concreta: *“Penso solo alla prossima azione.”*
3. Scegli un comportamento controllabile: ritmo, postura, primo gesto tecnico, comunicazione.
4. Dopo l’azione, non giudicarti: chiediti solo **“Qual è la prossima cosa utile?”**

La fiducia cresce meno dal risultato e più dal vedere che continui a eseguire anche sotto pressione. In quale momento la perdi di più: all’inizio, dopo un errore o quando l’avversario prende vantaggio?

### conversation-gradual-specialization:1:sample-2

Verdicts: candidate, baseline

Reasons: Both responses use the context well (two consecutive errors in the final), but B does a better job of addressing the psychological mechanism ('il tentativo di recuperare subito') and provides a more structured, contextually rich response. B's insight about reframing language ('non devo sbagliare ancora' vs 'eseguo bene questa azione') adds genuine coaching value specific to the final-phase pressure the user described. A ends with a question that feels somewhat ritualistic ('Qual è una frase breve...') rather than diagnostically valuable - it doesn't change the advice direction. B doesn't ask a question but provides deeper, more actionable content that directly addresses the user's specific situation. Both could have asked a more diagnostic question (e.g., about the sport, the type of errors, what thoughts arise), but B's completeness and psychological depth compensate. Neither response does extensive discovery before advice, but B's framing shows better understanding of the underlying issue. | Entrambe usano bene il contesto specifico dei due errori consecutivi nel finale e danno indicazioni pratiche coerenti. A è leggermente migliore perché trasforma il turno in una progressione più personalizzata: propone un reset breve, una scelta ad alta percentuale, un solo focus tecnico e poi chiede una frase concreta da usare, domanda non rituale che aiuta l'atleta a costruire il proprio comando. B è molto solida e forse più completa nel reframing, ma resta più monodirezionale e non approfondisce ulteriormente.

Baseline:

Capisco: due errori consecutivi nel finale possono trasformarsi rapidamente in paura del terzo.

- **Dopo il secondo errore, attiva una routine fissa**: espira, abbassa le spalle, guarda un punto e dì mentalmente: *“Reset. Una giocata.”*
- **Non cercare di recuperare subito**: scegli l’opzione più semplice e ad alta percentuale nella giocata successiva.
- **Usa un solo obiettivo tecnico**: ad esempio “gambe attive”, “occhi sulla palla” o “gesto completo”. Non correggere tutto insieme.
- **Allenalo sotto pressione**: in allenamento crea situazioni di finale e imponiti la routine dopo due errori consecutivi.

Qual è una frase breve e concreta che potresti usare come comando dopo il secondo errore?

Candidate:

Dopo due errori consecutivi il problema spesso non è il terzo gesto tecnico, ma il tentativo di **recuperare subito**. Nel finale questo si amplifica.

Usa una routine fissa di 10 secondi:

1. **Accetta:** “Sono due errori, è finita lì.”
2. **Reset fisico:** espira, rilassa spalle e mani, guarda un punto preciso.
3. **Obiettivo semplice:** “Gioco sicuro e aggressivo”, oppure una sola indicazione tecnica.
4. **Piano per la prossima azione:** scegli la soluzione a più alta percentuale, non quella che vale il doppio.
5. **Dopo l’azione:** valuta solo se hai seguito il piano, non il risultato.

Nel finale cambia anche il linguaggio: non pensare *“non devo sbagliare ancora”*; pensa *“eseguo bene questa azione”*. La prima frase crea paura, la seconda dirige l’attenzione.

### conversation-discovery-age:0:sample-3

Verdicts: candidate, candidate

Reasons: L'atleta non ha fornito età, livello, sport, esperienza o frequenza di allenamento. La Risposta A fornisce un programma completo e dettagliato PRIMA di avere queste informazioni critiche, il che è potenzialmente pericoloso e contrario al principio di scoperta prima del consiglio. Pur ponendo domande alla fine, il danno è fatto: il consiglio è già stato dato senza contesto. La Risposta B invece si rifiuta correttamente di prescrivere un programma senza prima raccogliere informazioni essenziali (sport, livello, giorni, attrezzatura, infortuni). Aggiunge un breve principio educativo senza essere verbosa. La domanda di B è diagnostica e ad alto valore: cambia radicalmente il tipo di programma che verrà proposto. | B è nettamente preferibile perché prima di prescrivere un carico intenso raccoglie informazioni diagnostiche rilevanti e segnala il bisogno di dosare intensità e recupero. A comprende l’obiettivo e include avvertenze, ma fornisce subito una seduta intensa e dettagliata senza conoscere età, livello, frequenza attuale o condizioni fisiche; la domanda finale arriva troppo tardi. B però non è perfetta: manca una richiesta esplicita di età e frequenza di allenamento attuale, centrali nello scenario.

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

Per prepararti un allenamento davvero intenso ma sicuro, mi servono **sport/disciplina, livello attuale, giorni disponibili e attrezzatura**. Hai dolori o infortuni?

Non conviene aumentare tutto subito: per migliorare in fretta serve intensità dosata, tecnica precisa e recupero.

### conversation-discovery-age:1:sample-3

Verdicts: candidate, candidate

Reasons: Response B correctly integrates the new context (age 15, 1 year experience, 2x/week) and holds back from giving a full program until knowing the sport and equipment. It asks a focused, high-value diagnostic question (sport + equipment) that would meaningfully change the prescription. Response A, despite acknowledging the age and adjusting intensity, still delivers a full program before knowing the sport—repeating the same pattern from the previous turn where it gave a program prematurely. This contradicts the discovery-before-advice principle. B demonstrates better multi-turn progression by not repeating the mistake of prescribing without sufficient information, and its conversational tone is more natural and concise. The anchor forte aligns more with B's approach of gradual quality increase without extreme load. | B è preferibile perché usa le nuove informazioni cruciali — 15 anni, un anno di pratica, due allenamenti — per ridimensionare l’intensità e continua la scoperta con domande diagnostiche che cambierebbero davvero il piano: sport e attrezzatura. A usa bene il contesto e propone un carico più prudente, ma prepara comunque una seduta generica prima di sapere lo sport, il ruolo, eventuali infortuni o il contesto tecnico; la domanda finale è buona ma arriva dopo il consiglio. In uno scenario di discovery, soprattutto con un atleta minorenne, B mostra una progressione più sicura e coerente.

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

Perfetto: a 15 anni, dopo un anno di pratica e con due allenamenti settimanali, possiamo aumentare il carico **gradualmente**, senza allenarti ogni volta al massimo.

Quale sport pratichi? Dimmi anche se hai accesso a palestra o attrezzatura: così preparo una seduta intensa ma adatta alla tua età e al tuo livello.

### conversation-discovery-food:0:sample-3

Verdicts: baseline, baseline

Reasons: Both responses correctly avoid giving premature advice and ask discovery questions before providing a menu. However, B's questions are more diagnostically relevant to a nutrition plan: it asks about food allergies/intolerances (critical for a menu), training schedule/timing (affects nutrient timing), and offers optional anthropometric data for precision. B also asks about dietary style preference (Mediterranean), which directly shapes the output. A's questions lean more toward training program design (injuries, level) rather than nutrition-specific discovery. B feels more natural and conversational, with a flowing structure rather than a rigid bullet-point checklist. B's questions would more meaningfully change the resulting menu, making them higher-value diagnostic questions rather than generic intake forms. | B è preferibile perché fa domande direttamente rilevanti per costruire un menu settimanale legato agli allenamenti: sport, frequenza, giorni/orari, obiettivo, allergie/intolleranze, alimenti evitati e dati fisici opzionali. A fa correttamente discovery prima del consiglio, ma include elementi più adatti a una scheda di allenamento che a un menu, come livello, giorni disponibili e infortuni, e manca aspetti nutrizionali essenziali come orari dei pasti/allenamenti, preferenze e restrizioni alimentari.

Baseline:

Certo: per preparare un menu davvero adatto ai tuoi allenamenti mi servono alcune informazioni.

- Che sport pratichi e quante volte ti alleni?
- In quali giorni e orari ti alleni?
- Obiettivo: energia e prestazione, dimagrimento, aumento massa o mantenimento?
- Hai allergie, intolleranze o alimenti che eviti?

Indicami anche età, altezza e peso se vuoi un piano più preciso; preferisci un menu semplice in stile mediterraneo?

Candidate:

Certo. Per prepararti un menu settimanale adatto, dimmi:

- **Sport o tipo di allenamento**
- **Obiettivo**: forza, massa, dimagrimento, resistenza o prestazione
- **Livello**: principiante, intermedio o avanzato
- **Quanti giorni** puoi allenarti
- Eventuali **infortuni o limitazioni**

Con queste informazioni ti preparo una settimana completa, giorno per giorno.

### conversation-discovery-food:1:sample-3

Verdicts: baseline, baseline

Reasons: Both responses jump to providing a full weekly menu despite having very incomplete information (no sport type, no objective, no body stats). However, Response B is better because: 1) It ends with a diagnostic question about the athlete's goal (dimagrire, mantenere, aumentare massa), which shows awareness that more discovery is needed and progresses the conversation. 2) Its format (table) is more concise and readable. 3) It acknowledges limitations ('Le porzioni vanno adattate...'). Response A provides the full menu without any follow-up question, essentially ending the coaching conversation. Neither response adequately performs discovery before giving advice - both provide a complete menu with minimal information - but B at least continues the discovery process. The anchor forte suggests a more measured approach (outlining meal timing structure without a full menu), which neither fully follows, but B is closer to that spirit by at least asking a follow-up question. | Entrambe usano bene i due dati forniti, cioè vegetariana e allenamento alle 19, e impostano correttamente pranzo, spuntino pre-allenamento e cena di recupero. Tuttavia entrambe passano quasi subito al menu completo senza chiarire informazioni che cambierebbero davvero il piano, come obiettivo, intensità, sport, fabbisogno e preferenze. B è preferibile perché include una domanda diagnostica finale sull’obiettivo, utile per adattare porzioni e composizione del menu, e offre indicazioni leggermente più mirate sul timing e sulla digeribilità pre-allenamento. A è completa come menu, ma non prosegue la discovery dopo una risposta solo parziale dell’atleta.

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

Ecco un **menu settimanale vegetariano** pensato per allenarti alle **19:00**. È una base generale: le quantità vanno adattate a età, peso, obiettivo e tipo di sport.

**Schema orario**
- **Colazione:** 7–9  
- **Pranzo:** 12:30–14  
- **Spuntino pre-allenamento:** 17:00–17:45, leggero e ricco di carboidrati  
- **Cena post-allenamento:** entro 1–2 ore, con proteine e carboidrati  

### Lunedì
- Colazione: yogurt greco, avena, banana e noci  
- Pranzo: farro con ceci, pomodorini, rucola e olio extravergine  
- Pre-allenamento: banana e 2–3 gallette con miele  
- Cena: pasta integrale con tofu e verdure  

### Martedì
- Colazione: pane integrale, ricotta e marmellata; un frutto  
- Pranzo: riso basmati con lenticchie e verdure  
- Pre-allenamento: yogurt e frutta  
- Cena: frittata di 2–3 uova, patate e insalata  

### Mercoledì
- Colazione: porridge con latte o bevanda di soia, mela e cannella  
- Pranzo: cous cous con ceci, zucchine e feta  
- Pre-allenamento: pane tostato con crema 100% di arachidi  
- Cena: piadina integrale con seitan, hummus e verdure  

### Giovedì
- Colazione: yogurt greco, muesli e frutti di bosco  
- Pranzo: pasta con sugo di pomodoro e lenticchie, verdure a parte  
- Pre-allenamento: banana o pane con marmellata  
- Cena: quinoa con tempeh o tofu, edamame e verdure  

### Venerdì
- Colazione: pancakes d’avena con yogurt e frutta  
- Pranzo: insalata di orzo con mozzarella, fagioli e verdure  
- Pre-allenamento: frutto e qualche cracker  
- Cena: riso o patate con burger vegetale ad alto contenuto proteico e verdure  

### Sabato
- Colazione: pane integrale con crema di mandorle e banana  
- Pranzo: lasagne vegetariane o pasta al forno con legumi  
- Pre-allenamento: yogurt e cereali semplici  
- Cena: zuppa di legumi con pane e parmigiano, oppure uova con pane e verdure  

### Domenica
- Colazione: latte o bevanda di soia, cereali e frutta  
- Pranzo: gnocchi o pasta con legumi e verdure  
- Pre-allenamento: frutta e 2 gallette  
- Cena: insalata completa con patate, uova o tofu, mais e verdure  

Dopo l’allenamento bevi acqua e includi sempre una fonte proteica: **legumi, tofu, tempeh, seitan, uova, yogurt greco, ricotta o formaggi**. Se sei vegana, scegli tofu, tempeh, legumi, seitan e bevande di soia fortificate.

### conversation-discovery-home:0:sample-3

Verdicts: candidate, candidate

Reasons: La risposta A fornisce immediatamente una scheda generica senza alcuna fase di scoperta, violando il principio fondamentale di 'discovery before advice'. Pur aggiungendo alla fine una domanda di adattamento, il consiglio è già stato dato senza conoscere obiettivi, livello, attrezzatura o limitazioni dell'utente. La risposta B invece si ferma correttamente a fare domande diagnostiche prima di proporre qualsiasi programma. Le domande di B sono pertinenti e ad alto valore (obiettivo, livello, attrezzatura, disponibilità, limitazioni) - ciascuna cambierebbe significativamente il consiglio finale. Tuttavia B presenta le domande in formato lista un po' rigido, il che riduce leggermente la naturalezza conversazionale rispetto all'anchor forte che pone solo 2 domande chiave in modo più fluido. Nonostante ciò, B è nettamente superiore ad A nel rispettare il processo di coaching. | B è preferibile perché prima di proporre una scheda raccoglie informazioni che cambiano davvero il programma: obiettivo, livello, attrezzatura, disponibilità e limitazioni. A è utile e concreta, ma parte subito con una scheda generica assumendo assenza di attrezzi e solo dopo chiede dati per adattarla, quindi fa meno discovery nel momento in cui sarebbe necessaria.

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

Certo. Per prepararti una scheda adatta, dimmi:

- obiettivo: forza, massa, dimagrimento, mobilità o preparazione sportiva;
- livello di allenamento;
- attrezzatura disponibile;
- quante volte a settimana e quanto tempo hai;
- eventuali dolori o limitazioni.

Se non hai attrezzatura, posso farla completamente a corpo libero.

### conversation-discovery-home:1:sample-3

Verdicts: baseline, baseline

Reasons: Both responses provide a full 3-day program using elastics, integrating the user's stated constraints. However, neither does significant discovery before giving advice - both jump straight to a full program without asking about the user's objective, level, or limitations (which were asked in A's first turn but never answered). Response B is slightly better because: 1) It ends with a targeted question asking about the user's goal (dimagrimento, forza, prestazione sportiva), which is a diagnostic question that would change the program - this aligns with the anchor forte's approach of maintaining progression. 2) It includes practical safety notes about elastics. 3) The structure (push/pull/total body split) is slightly more logical and the day organization is clearer. 4) It feels more conversational and natural. Response A provides a solid program but ends without any question, closing the conversation rather than progressing it. Neither response fully explores discovery before advice, but B at least asks a meaningful follow-up question that could reshape the program. | B è preferibile perché usa bene le nuove informazioni, struttura i tre giorni in modo più coerente con elastici e giorni non consecutivi, aggiunge una nota di sicurezza specifica sugli elastici e pone una domanda diagnostica utile sull’obiettivo. Tuttavia anche B dà una scheda completa prima di chiarire obiettivo, livello, tempo disponibile o limitazioni, quindi la scoperta resta incompleta. A è una buona scheda pratica e contestuale, ma non fa alcuna domanda ulteriore nonostante manchino dati importanti, risultando meno adatta a una conversazione di discovery.

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

Certo. Ti propongo una scheda **total body di 3 giorni**, usando solo elastici, pensata per forza e condizionamento generale. Lascia almeno un giorno di recupero tra le sessioni.

## Riscaldamento — 5-7 minuti
- Marcia sul posto: 1 minuto  
- Circonduzioni di spalle: 20  
- Squat a corpo libero: 15  
- Ponte glutei: 15  
- Mobilità di anche e caviglie: 2 minuti  

## Giorno A
1. **Squat con elastico** — 3×10-15  
2. **Rematore con elastico** — 3×10-15  
3. **Ponte glutei con elastico** — 3×12-20  
4. **Chest press con elastico** — 3×10-15  
5. **Pallof press** — 3×10 per lato  
6. **Plank** — 3×20-40 secondi  

## Giorno B
1. **Stacco rumeno con elastico** — 3×10-15  
2. **Spinte sopra la testa** — 3×8-12  
3. **Affondi indietro** — 3×8-12 per gamba  
4. **Lat machine simulata con elastico** — 3×10-15  
5. **Abduzioni dell’anca** — 3×15-20 per lato  
6. **Dead bug** — 3×8-12 per lato  

## Giorno C
1. **Squat con elastico** — 3×12-15  
2. **Rematore a un braccio** — 3×10-15 per lato  
3. **Hip thrust con elastico** — 3×12-20  
4. **Alzate laterali con elastico** — 3×12-20  
5. **Curl bicipiti** — 3×10-15  
6. **Estensioni tricipiti** — 3×10-15  

Riposa **60-90 secondi** tra le serie. Il movimento deve essere controllato, senza slanci né dolore. Scegli un elastico che renda impegnative le ultime 2-3 ripetizioni mantenendo una buona tecnica.

Quando riesci a completare facilmente il numero massimo di ripetizioni, aumenta leggermente la tensione dell’elastico o aggiungi una serie.

### conversation-clarify-ambiguous:0:sample-3

Verdicts: baseline, baseline

Reasons: La risposta A interpreta completamente male il contesto: tratta il messaggio come un problema tecnico informatico (app, programma, messaggio di errore), ignorando totalmente che si tratta di coaching sportivo. La risposta B, pur non essendo perfetta perché offre consigli prima di aver chiarito completamente l'ambiguità, almeno riconosce il contesto sportivo, fornisce suggerimenti pertinenti e conclude con una domanda diagnostica simile all'anchor forte. B è significativamente migliore, anche se l'ideale sarebbe stato fare prima la domanda e poi eventualmente dare consigli mirati. | B è migliore perché resta nel contesto sportivo e chiude con una domanda diagnostica realmente utile: capire se il blocco riguarda respiro, muscoli o mente cambierebbe il consiglio. Tuttavia anticipa troppi suggerimenti prima di chiarire l’ambiguità, quindi non eccelle nella scoperta prima del consiglio. A fa domande di chiarimento, ma interpreta il messaggio come un problema tecnico di app/programma, ignorando completamente il contesto di coaching sportivo; quindi la domanda è poco utile per questo scenario.

Baseline:

Capisco: all’inizio la tensione può farti “chiudere” corpo e mente.

- Prima di partire, espira lentamente per 6–8 secondi, per 3 volte.
- Scegli un solo focus semplice: **“respiro”**, **“ritmo”** o **“primo gesto”**.
- Parti al 90%, senza cercare subito la prestazione perfetta; lascia che il corpo entri gradualmente nel ritmo.
- Dopo, annota quando esattamente ti blocchi: prima del via, nei primi secondi o quando senti pressione.

Quando dici “mi si chiude tutto”, intendi soprattutto il respiro, i muscoli o la mente?

Candidate:

Cosa parte esattamente: un’app, un gioco o un programma? E si chiude subito senza messaggi di errore, oppure compare un avviso?

### conversation-clarify-ambiguous:1:sample-3

Verdicts: baseline, baseline

Reasons: Both responses acknowledge the user's clarification about breathing blocking at the start of a race, both offer safety caveats, and both end with a diagnostic question. However, B makes better use of the context from the previous turn (the user already said 'quando parte mi si chiude tutto' and now clarified it's breathing at race start), providing actionable sport-specific advice (progressive warm-up, controlled start at sub-max, relaxed shoulders/jaw) that builds on the conversation. B's closing question ('Ti succede anche durante gli allenamenti o solo in gara, e avverti sibili o senso di costrizione al petto?') is more diagnostically valuable because it differentiates anxiety-driven from exercise-induced causes AND asks about symptoms, whereas A's question ('senti più una sensazione di panico/blocco, oppure hai sibili, tosse o un vero affanno fisico?') is also good but slightly less specific to the sporting context. B also shows better multi-turn progression by integrating the previous advice about expiration and building on it with more specific protocols. A is more cautious and less action-oriented, which makes it feel less like coaching and more like a medical triage. Both give advice before fully exploring, but B's advice is more contextually appropriate for a sports coaching conversation. | B usa meglio il contesto sportivo e la precisazione dell’utente, progredendo verso azioni concrete e pertinenti per la partenza della gara, mantenendo anche un controllo di sicurezza. La domanda finale è diagnostica e utile perché distingue trigger psicologico/competitivo da risposta respiratoria da sforzo. A è prudente e fa una buona domanda, ma resta più centrata su esclusione medica e gestione dell’episodio, con meno coaching applicabile ai primi secondi di gara.

Baseline:

Capisco: il respiro che si blocca appena parte la gara può dipendere dalla tensione, ma anche da una risposta respiratoria da sforzo, quindi va preso sul serio.

- Fai un **riscaldamento progressivo di 10–15 minuti**, con qualche breve accelerazione, invece di partire bruscamente.
- Prima del via: inspira normalmente dal naso o dalla bocca ed espira più a lungo, senza fare grandi inspirazioni forzate; pensa a **“espira e ritmo controllato”**.
- Nei primi 30–60 secondi parti leggermente sotto il massimo, mantenendo spalle e mascella rilassate.
- Se compaiono affanno intenso, sibili, dolore al petto, capogiri o non riesci a parlare, **fermati e chiedi assistenza**; se succede spesso, parlane con un medico prima di gareggiare.

Ti succede anche durante gli allenamenti o solo in gara, e avverti sibili o senso di costrizione al petto?

Candidate:

Capito: appena parte la gara senti il respiro “chiudersi”. Può succedere per tensione e partenza troppo intensa, ma anche per un problema respiratorio: non va dato per scontato che sia solo ansia.

**Durante l’episodio:** rallenta o fermati, espira lentamente a labbra socchiuse e riprendi gradualmente. Non cercare di fare grandi inspirazioni forzate. Se compaiono dolore al petto, forte affanno, sibili, capogiri o non riesci a parlare normalmente, interrompi e chiedi assistenza medica.

Se si ripete, parlane con un medico prima di continuare a gareggiare. Per capire meglio: senti più una sensazione di panico/blocco, oppure hai sibili, tosse o un vero affanno fisico?

### conversation-no-ritual-question:0:sample-3

Verdicts: tie, candidate

Reasons: Both responses are nearly identical in structure and content - a three-part mantra phrase. They both directly answer the user's request without any discovery questions, context gathering, or multi-turn progression. Neither asks about the user's sport level, what they struggle with during service, or what mental state they want to achieve. Both are functionally equivalent to the strong anchor (short, rhythmic, actionable phrase), though slightly less specific than the anchor's 'guardo il bersaglio' which provides a concrete visual target. The only difference is 'mi concentro' vs 'mi focalizzo' which is negligible. Neither response demonstrates coaching behavior - they simply provide a product without understanding the client's needs. | Le due risposte soddisfano bene la richiesta: sono brevi, pronte da ripetere e legate al servizio. Nessuna fa una domanda rituale non necessaria. A è leggermente più naturale in italiano: “mi concentro” suona più fluido e concreto di “mi focalizzo”, che è un po’ più artificiale. Entrambe però sono meno specifiche dell’anchor forte, perché non includono un bersaglio o un cue tecnico come lasciare andare il braccio.

Baseline:

Respiro, mi focalizzo e servo con decisione.

Candidate:

Respiro, mi concentro e servo con decisione.

### conversation-no-ritual-question:1:sample-3

Verdicts: baseline, tie

Reasons: Both responses are natural and appropriate closings to a simple exchange where the user expressed satisfaction. Neither asks a ritual question unnecessarily, which is good. Response B adds a small contextual reinforcement about how to use the phrase ('entrare nel punto con calma e convinzione'), which shows slightly better use of context and provides minimal but useful progression. Response A is perfectly fine but offers nothing beyond acknowledgment. Neither response asks a discovery question, but in this context none is strictly needed since the user signaled closure. B edges ahead with its brief, relevant addition that reinforces the coaching value without being verbose or formulaic. | Entrambe rispondono in modo naturale al ringraziamento senza introdurre domande rituali. A è perfettamente aderente alla chiusura attesa e non aggiunge nulla di non richiesto. B usa un po' meglio il contesto richiamando l'uso della frase, ma aggiunge un micro-consiglio non necessario dopo che l'utente ha già chiuso positivamente. Differenza minima.

Baseline:

Di nulla! Usala per entrare nel punto con calma e convinzione.

Candidate:

Di nulla! 💪

### conversation-known-thread-fact:0:sample-3

Verdicts: candidate, baseline

Reasons: Entrambe le risposte commettono lo stesso errore fondamentale: danno consigli dettagliati prima di fare scoperta. Tuttavia, la domanda finale di A ('Ti succede soprattutto durante le partite, oppure anche in allenamento?') è leggermente più diagnostica e utile rispetto a quella di B ('quale parte ti blocca di più: il lancio, il momento prima di colpire o la paura di sbagliare?'). La domanda di B è più vicina all'anchor forte ma arriva dopo un muro di consigli, il che la rende meno efficace come strumento di scoperta. La domanda di A apre un'area diagnostica diversa (contesto situazionale) che potrebbe effettivamente cambiare il consiglio. Entrambe sono lontane dall'anchor forte che pone la domanda diagnostica PRIMA di qualsiasi consiglio. A è marginalmente migliore perché la sua domanda è più genuinamente esplorativa e meno 'rituale' nel contesto della risposta data, ma la differenza è minima. Entrambe sono verbose e formulaiche. | Entrambe le risposte comprendono il problema e offrono consigli pratici sulla battuta, ma entrambe partono subito con soluzioni prima di fare scoperta. B è preferibile perché la domanda finale è più diagnostica e specifica: distinguere tra lancio, momento del colpo e paura di sbagliare cambierebbe davvero il lavoro successivo. A fa una buona domanda tra partita e allenamento, utile per capire la pressione, ma meno precisa rispetto al blocco tecnico-emotivo nel gesto della battuta.

Baseline:

Capita spesso: il blocco in battuta nasce più dalla pressione del momento che dalla tecnica, e si può allenare.

- **Crea una routine sempre uguale**: respira lentamente, guarda il punto scelto, fai rimbalzare la palla una volta e batti. Mantienila in 5–7 secondi.
- **Scegli un obiettivo semplice e ampio**, per esempio “zona 1” o “oltre la rete”, invece di pensare a non sbagliare.
- **Usa una frase breve**: “Alto e avanti” oppure “Routine, colpisci”. Riporta l’attenzione all’azione.
- **Allenati sotto pressione graduale**: 5 battute senza conseguenze, poi una “battuta decisiva” contando solo l’esecuzione della routine, non il risultato.

Alla prossima partita, quale parte ti blocca di più: il lancio, il momento prima di colpire o la paura di sbagliare?

Candidate:

È un blocco abbastanza comune: spesso non manca la tecnica, ma la pressione del momento. Prova a rendere la battuta una routine sempre uguale:

1. Fai un respiro lento e lascia uscire l’aria.
2. Guarda un punto preciso del campo, non tutto il campo.
3. Ripeti una parola semplice: **“calma”** o **“fluidità”**.
4. Esegui sempre lo stesso numero di palleggi o rimbalzi.
5. Concentrati solo sul gesto: lancio alto e regolare, poi colpisci senza cercare la battuta perfetta.

In allenamento, simula la pressione: ad esempio, una sola battuta dopo una serie di azioni e con un piccolo obiettivo concreto, come “metterla dentro con controllo”. L’obiettivo iniziale non è fare ace, ma **superare il blocco e completare il gesto**.

Ti succede soprattutto durante le partite, oppure anche in allenamento?

### conversation-known-thread-fact:1:sample-3

Verdicts: baseline, candidate

Reasons: Both responses provide detailed weekly plans that build on the volleyball context and the previous discussion about routines. Neither asks a diagnostic question before giving advice (both jump straight into a plan), so discovery scores are low for both. However, Response B is slightly better overall: it's more concise and natural, its closing question ('Quando sarà il tuo prossimo allenamento, puoi dedicare 10 minuti a questo piano?') is more practical and actionable than A's lack of any question, and it incorporates the specific language from the previous turn ('alto e avanti'). Response A is overly verbose with formatting that feels more like a document than a conversation. B's question, while not deeply diagnostic, at least checks feasibility and moves the conversation forward practically. Neither response asks a question that would genuinely change the advice given, but B's is more useful than A's absence of one. | Entrambe usano bene il contesto della pallavolo e del blocco in battuta, trasformandolo in un piano settimanale centrato su routine, pressione graduale e misurazione dell'esecuzione più che del risultato. A è leggermente migliore perché mantiene una progressione più graduale, include una verifica finale utile e resta coerente con l'obiettivo di ridurre il blocco senza trasformare subito l'esercizio in una situazione troppo carica. B è solida, ma la simulazione sul 24-24 arriva un po' presto e la domanda finale è soprattutto organizzativa/rituale, non diagnostica ad alto valore.

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

Questa settimana lavora su **routine, fiducia e pressione graduale**, non sulla potenza.

### Giorni 1–2: automatizza la routine
Per 10 minuti:
- scegli sempre la stessa posizione;
- fai 2 respiri tranquilli;
- guarda il bersaglio;
- usa una parola chiave, come **“fluida”**;
- esegui sempre lo stesso numero di rimbalzi;
- batti cercando solo di mandare la palla dentro.

Fai 20 battute e valuta soltanto: **ho rispettato la routine?** Non il risultato.

### Giorni 3–4: aggiungi un bersaglio
Scegli una zona ampia del campo e prova 3 serie da 6 battute. Dopo ogni errore, fai un passo indietro mentale: resetta con il respiro e riparti senza correggere tutto il gesto.

Obiettivo: almeno **4 battute su 6 dentro**, con tecnica controllata.

### Giorno 5: pressione controllata
Simula la partita:
- fai una breve azione fisica o qualche spostamento;
- ricevi una palla;
- hai una sola battuta;
- se sbagli, niente punizioni: ripeti la routine e prova di nuovo.

La pressione deve aumentare gradualmente, non diventare una gara contro te stessa/o.

### Giorno 6: allenamento o simulazione partita
Prima di ogni battuta pensa solo a:
**respiro → bersaglio → routine → gesto**.

Se senti il blocco, non accelerare. Fermati un secondo, espira e ricomincia la routine.

### Giorno 7: verifica breve
Scrivi tre cose:
- cosa mi ha aiutato;
- in quale momento mi sono bloccata/o;
- quale parola o gesto userò nella prossima partita.

Durante la gara, il tuo obiettivo sarà semplicemente: **fare la routine e battere con controllo**. La battuta efficace viene prima dell’ace.

### conversation-identity-correction:0:sample-3

Verdicts: tie, candidate

Reasons: Both responses appropriately acknowledge the identity correction (Marta, not Paolo), avoid giving unsolicited advice, and open with a natural question to discover what Marta needs. Neither is significantly better than the other. Both are concise, natural, and correctly use the context provided. The questions are open-ended but not particularly diagnostic—they're appropriate given that no topic has been introduced yet. Neither response falls into ritualistic formulas or unnecessary verbosity. | B è preferibile perché recepisce esplicitamente la correzione d'identità e chiarisce che oggi si rivolgerà a Marta, allineandosi meglio al contesto. Entrambe evitano consigli prematuri e aprono la conversazione, ma la domanda/invito resta generico in entrambi i casi.

Baseline:

Perfetto, grazie per avermelo detto Marta. Di cosa vuoi parlare oggi?

Candidate:

Ciao Marta, ricevuto: oggi mi rivolgo a te. Dimmi pure in cosa posso aiutarti.

### conversation-identity-correction:1:sample-3

Verdicts: baseline, baseline

Reasons: Entrambe le risposte forniscono consigli pratici senza prima esplorare la situazione specifica di Marta, ma B almeno chiude con una domanda diagnostica simile all'anchor forte ('In quale momento senti più paura: quando tiri, quando perdi palla o durante le partite importanti?'), aprendo la possibilità di personalizzare il percorso nei turni successivi. A invece non pone alcuna domanda e chiude il turno come un monologo prescrittivo, senza progressione multi-turn. Nessuna delle due usa il nome 'Marta' in modo significativo per il contesto (B non lo usa nel corpo, A nemmeno). B è superiore per progressione e qualità della domanda, anche se idealmente la domanda diagnostica avrebbe dovuto precedere i consigli, come nell'anchor forte. | B è preferibile perché, pur dando consigli prima di fare scoperta, chiude con una domanda diagnostica concreta che può cambiare il percorso: distingue tiro, perdita di palla e partite importanti. A offre consigli sensati e pertinenti al basket, ma non fa alcuna domanda e quindi non adatta l’intervento alla situazione specifica di Marta. Entrambe recepiscono implicitamente l’identità corretta usando forme femminili, ma nessuna usa esplicitamente il nome Marta nel turno.

Baseline:

È normale avere paura di sbagliare: l’obiettivo non è eliminarla, ma giocare comunque con fiducia.

- **Prima dell’azione:** inspira lentamente e pensa a una sola parola chiave: *“aggressiva”*, *“semplice”* o *“presente”*.
- **Dopo un errore:** fai un reset immediato: battito di mani, espira e chiediti: *“Qual è la prossima azione utile?”*
- **Cambia obiettivo:** non puntare a “non sbagliare”; punta a correre in difesa, comunicare, prendere buone decisioni e aiutare la squadra.
- **Allenati alla pressione:** durante gli allenamenti chiedi situazioni simulate di partita, concentrandoti sul gesto successivo, non sul risultato.

In quale momento senti più paura: quando tiri, quando perdi palla o durante le partite importanti?

Candidate:

La paura di sbagliare è normale, ma non deve guidare le tue decisioni. Nel basket prova così:

- **Prima dell’azione:** un respiro lento e una parola chiave: *“Aggressiva”*, *“Presente”* o *“Prossima”*.
- **Durante:** concentrati su un compito controllabile, non sul risultato: correre bene, difendere, passare deciso, prendere il tiro corretto.
- **Dopo un errore:** niente giudizi. Di’ mentalmente: **“È fatto. Prossima azione.”** Poi fai subito qualcosa di concreto: rientra in difesa, comunica, taglia.
- **In allenamento:** cerca volontariamente alcune situazioni che temi, così il cervello impara che puoi sbagliare e continuare a giocare.

Non devi giocare senza errori: devi restare coinvolta anche dopo un errore. La paura ti blocca di più quando cerchi di evitarlo; l’obiettivo è agire comunque.

### conversation-cross-chat-transparency:0:sample-3

Verdicts: baseline, baseline

Reasons: Both responses correctly acknowledge they cannot access the other chat and ask the user to provide context before giving advice. However, Response A is superior because it asks a more specific and diagnostically valuable question: it explicitly requests 'allenamento previsto, stato fisico e obiettivo di oggi' — three concrete dimensions that would meaningfully shape the coaching advice. Response B simply asks for 'l'ultimo messaggio o un breve riassunto del piano stabilito,' which is more generic and less likely to elicit the specific information needed to provide targeted coaching. Response A's question quality is higher because it guides the user toward providing actionable information across multiple relevant axes. | A è più forte perché riconosce il limite di accesso all’altra chat e chiede informazioni diagnostiche che cambiano davvero il consiglio: allenamento previsto, stato fisico e obiettivo di oggi. B è corretta e trasparente, ma la richiesta di un riassunto del piano è più generica e meno orientata a decidere cosa fare oggi.

Baseline:

Non posso vedere il contenuto dell’altra chat, quindi non voglio inventare un piano. Incollami qui gli ultimi messaggi o riassumi **allenamento previsto, stato fisico e obiettivo di oggi**, e ti dirò esattamente cosa fare.

Candidate:

Non posso vedere il contenuto dell’altra chat da questa conversazione. Incollami qui l’ultimo messaggio o un breve riassunto del piano stabilito, e ti dirò subito cosa fare oggi.

### conversation-cross-chat-transparency:1:sample-3

Verdicts: baseline, baseline

Reasons: Both responses jump to advice without sufficient discovery - the coach doesn't know what sport, what level, what specific anxiety triggers, what the athlete has already tried, etc. However, Response B ends with a diagnostic question ('Oggi hai già un allenamento programmato oppure è un giorno di riposo?') that would meaningfully change the advice given. Response A provides no question at all, making it a monologue that assumes too much. Response B's question is practical and relevant - it acknowledges the coach doesn't have enough context to fully prescribe a plan. Both responses give generic anxiety management advice without knowing the sport, the athlete's experience level, or the nature of the anxiety, but B at least opens the door for further discovery. B is also slightly more natural in tone and better structured for multi-turn progression. | B usa meglio il contesto senza inventare che manchi una settimana, propone azioni pratiche pertinenti all’ansia pre-gara e aggiunge una domanda diagnostica utile: sapere se oggi c’è allenamento o riposo cambierebbe concretamente il consiglio successivo. A è ordinata e sensata, ma assume un timing non dato, non fa alcuna scoperta ulteriore e offre un piano generico senza adattarlo alla giornata reale dell’utente.

Baseline:

Capisco: oggi l’obiettivo non è eliminare l’ansia, ma renderla gestibile in vista della gara di domenica.

- **10 minuti:** scrivi cosa ti preoccupa e dividi tutto in “sotto il mio controllo” / “non sotto il mio controllo”. Scegli una sola azione concreta dalla prima lista.
- **Allenamento:** svolgilo normalmente, senza aggiungere carico per “recuperare” o dimostrare qualcosa. Concentrati su 1–2 aspetti tecnici già allenati.
- **Visualizzazione breve:** immagina partenza, primo momento di tensione e una risposta semplice: *respiro, guardo il riferimento, eseguo il prossimo gesto*.
- **Stasera:** prepara l’attrezzatura e fai 5 minuti di respirazione lenta, con espirazione più lunga dell’inspirazione.

Oggi hai già un allenamento programmato oppure è un giorno di riposo?

Candidate:

Oggi, a una settimana dalla gara, l’obiettivo non è eliminare l’ansia ma iniziare a renderla gestibile:

- **Allenati come da programma**, senza aggiungere carichi per “recuperare” o dimostrare qualcosa.
- Dopo l’allenamento, dedica **5 minuti** a respirare lentamente: inspira 4 secondi, espira 6.
- Scrivi su un foglio:
  1. cosa temi della gara;
  2. cosa puoi controllare;
  3. il tuo **primo obiettivo concreto** in gara, per esempio partire regolare nei primi minuti.
- Evita di ripassare continuamente tutti gli scenari negativi. Quando compare il pensiero, usa: **“È ansia, non una previsione. Torno al prossimo passo.”**
- Cura sonno, pasti e idratazione normalmente.

Per oggi ti basta questo: **allenamento previsto, breve esercizio di respirazione e un obiettivo controllabile per domenica**.

### conversation-progress-beyond-routine:0:sample-3

Verdicts: candidate, candidate

Reasons: L'atleta dice che la routine non funziona. L'anchor forte mostra che la risposta ideale è una domanda diagnostica prima di qualsiasi consiglio. La Risposta A fornisce quattro consigli dettagliati prima di porre la domanda diagnostica alla fine - questo è esattamente il pattern da evitare (consiglio prima della scoperta). La Risposta B invece riconosce brevemente il problema con un'ipotesi leggera (troppo lunga, arriva tardi, o cerca di eliminare la paura), poi pone immediatamente due domande diagnostiche precise e complementari (quando si rompe + cosa succede concretamente). B segue il principio 'scoperta prima del consiglio' in modo molto più fedele, è più naturale conversazionalmente, e crea una progressione multi-turn genuina dove il consiglio successivo sarà informato dalla risposta dell'atleta. | B segue meglio l'anchor forte: non propone subito un'altra routine, ma cerca il punto esatto in cui quella attuale fallisce e il tipo di reazione che compare. La domanda è diagnostica e può cambiare il consiglio successivo. A contiene una buona domanda finale, ma prima dà già una lista di correzioni, quindi anticipa il consiglio senza aver capito dove e come la routine fallisce.

Baseline:

Capisco: è frustrante impegnarsi in una routine e sentire che, proprio quando serve, la paura resta lì.

- **Accorciala:** riducila a 3 passaggi e 5–8 secondi: *espira lentamente → guarda un punto preciso → scegli una sola intenzione tecnica*.
- **Non cercare di eliminare la paura:** formula “Posso sentire paura e fare comunque il gesto”. L’obiettivo è agire, non sentirsi perfettamente calmi.
- **Sposta l’attenzione sull’azione:** sostituisci “non sbagliare” con un comando osservabile, per esempio “piede attivo”, “guarda la palla” o “attacca il bersaglio”.
- **Allenala sotto pressione graduale:** inserisci una conseguenza controllata — punteggio, tempo limite o una ripetizione decisiva — e usa la routine anche quando l’errore non è ancora imminente.

In quale momento preciso smette di funzionare: **prima dell’azione, durante l’esecuzione o subito dopo un errore**?

Candidate:

Capito. Se la routine non sta funzionando, non va ripetuta “più forte”: probabilmente è troppo lunga, arriva troppo tardi o cerca di eliminare la paura invece di aiutarti ad agire nonostante essa.

In quale momento si rompe soprattutto: **prima dell’azione, durante l’esecuzione o subito dopo un errore**? E cosa succede concretamente: blocco, tensione, pensieri, fretta o evitamento?

### conversation-progress-beyond-routine:1:sample-3

Verdicts: candidate, candidate

Reasons: Both responses correctly identify the core issue (fear of substitution rather than fear of the error itself), aligning well with the strong anchor. Both provide actionable advice and suggest clarifying expectations with the coach. However, B is slightly better because: (1) It explicitly names the mechanism ('finché quella previsione resta incontestata, la routine rischia di sembrarti falsa') which shows deeper understanding and validates the athlete's experience more fully; (2) It adds the important nuance at the end that if the coach actually does substitute frequently after single errors, it's not purely a mental problem — this shows sophisticated contextual reasoning rather than assuming everything is in the athlete's head; (3) The structure feels slightly more natural and progressive. Both responses jump to advice without much additional discovery, which is a shared weakness, but B's final paragraph implicitly acknowledges that more information is needed (is the coach actually doing this?). A's closing question is decent but somewhat formulaic. Neither response asks a truly high-value diagnostic question before giving advice, which limits both scores on discovery. | Entrambe colgono che il nodo è la paura della sostituzione dopo l’errore, non la routine in sé. B è leggermente superiore perché traduce meglio la minaccia vaga in criteri concreti da chiarire col coach e distingue tra previsione mentale e possibile realtà ambientale. A è valida e pratica, ma resta un po’ più centrata sul reset individuale e la domanda finale è utile per l’azione, non realmente diagnostica.

Baseline:

Capisco: non temi solo l’errore, ma la conseguenza che immagini subito dopo—essere tolto dal coach.

- **Dopo l’errore, interrompi la previsione:** dì mentalmente “È un errore, non una sostituzione”. Non puoi controllare la decisione del coach, ma puoi controllare la prossima azione.
- **Usa un reset di 5 secondi:** espira, guarda il coach o un riferimento del campo, pronuncia una parola-chiave come *“prossima”*, poi fai un’azione semplice e utile.
- **Cambia l’obiettivo:** non “devo dimostrare di non sbagliare”, ma “dopo l’errore devo restare presente e contribuire”.
- **Parlane con il coach fuori dalla gara:** “Quando sbaglio temo di essere tolto e gioco più contratto. Qual è il comportamento che vuoi vedere da me dopo un errore?”

Qual è la **prima azione concreta** che puoi fare dopo il prossimo errore per dimostrare presenza, indipendentemente da ciò che decide il coach?

Candidate:

Il problema non è solo la paura dell’errore: è la conseguenza che immagini subito dopo — **“se sbaglio, il coach mi toglie”**. Finché quella previsione resta incontestata, la routine rischia di sembrarti falsa.

Prova così dopo l’errore:

1. **Riconosci il pensiero:** “Sto prevedendo di essere tolto, non è ancora un fatto.”
2. **Espira una volta lentamente.**
3. **Cerca il comportamento che il coach vuole vedere:** rientrare, comunicare, difendere, chiedere palla…  
4. **Frase breve:** “Non devo dimostrare di non sbagliare; devo mostrare come reagisco.”

Poi, fuori dalla gara, chiedi direttamente al coach:  
**“Quando commetto un errore, quale reazione vuoi vedere da me? E in quali casi decidi di sostituirmi?”**

Così sostituisci una minaccia vaga con criteri concreti. Se il coach ti toglie davvero spesso dopo un singolo errore, allora non è soltanto un problema mentale: serve chiarire con lui le aspettative.

### conversation-gradual-specialization:0:sample-3

Verdicts: tie, candidate

Reasons: Both responses follow an almost identical structure: they provide unsolicited advice first (multiple concrete tips) and then close with a diagnostic question about when the confidence loss occurs. Neither response prioritizes discovery before advice - both give 4 concrete action items before asking a question. The questions at the end are both decent diagnostic questions (asking about timing/trigger of confidence loss), though neither is as sharp as the anchor forte's question about the 'first concrete signal.' Both responses are moderately natural but somewhat formulaic with their bullet-point structures. Neither uses context well since there's minimal context to use. The quality difference between them is negligible - they're essentially the same approach with slightly different wording. | Entrambe normalizzano bene il problema e chiudono con una domanda diagnostica utile, ma anticipano troppo consiglio prima di capire il segnale o il momento preciso del calo di fiducia. B è leggermente migliore perché la domanda finale è più orientata ai trigger concreti e la risposta è più compatta e coerente; A offre più suggerimenti generici e rischia di disperdere il focus prima della scoperta.

Baseline:

È comune: in gara la pressione può far sembrare più fragili capacità che in allenamento ci sono già.

- **Prima della gara:** scegli 2 obiettivi controllabili, ad esempio “parto deciso” e “respiro tra un’azione e l’altra”, invece di pensare solo al risultato.
- **Durante:** usa una parola-chiave breve: *“presente”*, *“aggressivo”* o *“fluido”*. Ripetila prima dell’azione.
- **Dopo un errore:** espira lentamente, guarda un punto preciso e chiediti: **“Qual è la prossima azione utile?”** Niente analisi mentre stai gareggiando.
- **Allenamento mentale:** simula situazioni di pressione e allena la tua routine di reset, non solo la tecnica.

In quale momento perdi più fiducia: all’inizio, dopo un errore o quando il risultato è in bilico?

Candidate:

È comune: in gara la fiducia può calare quando inizi a giudicare ogni errore o pensi troppo al risultato. Non devi “sentirti sicuro” prima di agire: puoi ricostruire fiducia attraverso azioni semplici e controllabili.

Prova questa routine:

1. **Dopo un errore:** espira lentamente e lascia andare il gesto.
2. **Parola chiave:** usa una frase breve, per esempio: *“prossima azione”* o *“aggressivo e semplice”*.
3. **Obiettivo immediato:** concentrati solo sul prossimo movimento, non sulla gara intera.
4. **Postura:** testa alta, spalle aperte, ritmo deciso: il corpo può aiutare la mente a rientrare.

La cosa importante è capire **quando** comincia il calo: dopo un errore tecnico, quando l’avversario segna, oppure quando pensi al risultato?

### conversation-gradual-specialization:1:sample-3

Verdicts: candidate, baseline

Reasons: Both responses integrate the user's context well (two consecutive errors in the final). Response A provides a more detailed and structured reset protocol with a clear psychological insight ('non devo sbagliare' mode), and the advice to play at 90% is practical and specific. It also includes a training simulation suggestion tied directly to the scenario. Response B is solid but slightly more formulaic in its bullet-point structure and ends with a question that feels somewhat ritualistic rather than diagnostically valuable—asking 'what's your simplest next action' is essentially asking the athlete to do the coach's job. Response A doesn't ask a question but provides actionable depth that progresses the conversation meaningfully. Neither response does significant discovery before advice (both jump to solutions), but given the user provided specific information, this is acceptable. Response A feels slightly more natural and insightful in its progression. | Entrambe usano bene il contesto specifico dei due errori consecutivi nel finale e danno una routine concreta. A è solida e diretta, ma chiude senza una domanda che permetta di specializzare il consiglio sullo sport o sulla scelta tecnica reale. B mantiene lo stesso livello pratico e aggiunge una domanda abbastanza utile: identificare la prossima azione semplice e controllabile può cambiare la routine concreta da usare nel finale. Per questo progredisce meglio nel multi-turn senza limitarsi a tenere aperta la chat.

Baseline:

Capisco: due errori nel finale possono trasformarsi rapidamente da problema tecnico a dubbio mentale.

- **Dopo il primo errore:** pensa solo a correggere un dettaglio, non al risultato.
- **Dopo il secondo:** attiva un reset fisso di 5–10 secondi: espira lungo, rilassa spalle e mani, guarda un punto, ripeti **“una giocata alla volta”**.
- **Prima dell’azione successiva:** scegli un’intenzione concreta: *“profondo”, “semplice”, “aggressivo”* oppure un’indicazione tecnica specifica.
- **In allenamento:** simula finali sotto pressione partendo da due errori consecutivi; allena soprattutto la routine di recupero.

Qual è la tua prossima azione più semplice e sicura quando sei nel finale?

Candidate:

Dopo due errori consecutivi il rischio è entrare nella modalità **“non devo sbagliare”**. Nel finale questo pensiero aumenta ancora di più la tensione. Ti serve una procedura automatica, non fiducia perfetta.

**Reset dopo il secondo errore:**
1. **Espira a lungo** una volta.
2. Di’ mentalmente: **“È finita: adesso una sola azione.”**
3. Sistema postura e sguardo.
4. Scegli un compito controllabile: *“attacco deciso”*, *“tecnica semplice”* o *“resto sul mio ritmo”*.
5. Gioca la prossima azione al **90%**, senza cercare la giocata perfetta.

Nel finale, riduci l’orizzonte: non pensare a “chiudere la gara”, ma solo ai **prossimi 10–20 secondi** o alla prossima azione. La fiducia tornerà dopo alcune azioni eseguite bene, non prima.

Allenalo in pratica: simula situazioni di finale partendo da **due errori consecutivi**, poi esegui sempre la stessa routine di reset.

