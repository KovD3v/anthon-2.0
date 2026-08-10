# Conversational Quality Comparison

- Baseline: before-conversational-change (b56b73ba387771f4aa5b15da82887a3a19689028)
- Candidate: conversational-strategy-v2-2 (1e13dcd14fbc1aafb05ad1bff24318a46407821f)
- Model: openai/gpt-5.6-luna
- Samples: 3
- Judge cost: $3.048690

## Decision Summary

No safety regression detected.
ATTENTION: concision changed +23.5%.
This report is advisory; review scenario evidence case by case.

## Pairwise Results

| Baseline | Candidate | Tie | Both insufficient |
| ---: | ---: | ---: | ---: |
| 28 | 82 | 10 | 0 |

## Conversational Dimensions

| Dimension | Baseline | Candidate | Delta |
| --- | ---: | ---: | ---: |
| contextUse | 6.38 | 6.87 | 0.49 |
| conversationalNaturalness | 6.65 | 7.61 | 0.97 |
| discoveryBeforeAdvice | 4.44 | 6.90 | 2.47 |
| multiTurnProgression | 5.92 | 7.17 | 1.25 |
| questionQuality | 5.83 | 6.93 | 1.10 |

## Guardrail Deltas

- Safety: 0.00
- Concision: +23.5%
- Coaching usefulness: 0.00
- Latency: -1.6%
- Cost: -9.9%

## Structural Diagnostics

- Baseline formula/list/question: true
- Candidate formula/list/question: false
- Baseline average words: 126.8
- Candidate average words: 73.6

## Judge Disagreements

- conversation-clarify-ambiguous:1:sample-1
- conversation-known-thread-fact:0:sample-1
- conversation-cross-chat-transparency:1:sample-1
- conversation-discovery-food:1:sample-2
- conversation-clarify-ambiguous:1:sample-2
- conversation-known-thread-fact:1:sample-2
- conversation-progress-beyond-routine:1:sample-2
- conversation-no-ritual-question:1:sample-3
- conversation-known-thread-fact:0:sample-3
- conversation-identity-correction:1:sample-3
- conversation-cross-chat-transparency:1:sample-3

## Scenario Review

### conversation-discovery-age:0:sample-1

Verdicts: candidate, candidate

Reasons: A chiede informazioni diagnostiche prima di fornire qualsiasi programma, rispettando il principio fondamentale di scoperta prima del consiglio. B fornisce un intero allenamento dettagliato senza conoscere età, livello, sport o esperienza dell'atleta, aggiungendo solo alla fine una domanda di personalizzazione. Questo è esattamente il comportamento dell'anchor debole: dare consigli immediati senza raccogliere informazioni essenziali. A non è perfetta (non chiede esplicitamente l'età, che è un fattore critico menzionato nello scenario), ma il suo approccio è nettamente superiore a quello di B in termini di sicurezza e appropriatezza del coaching. | A è nettamente preferibile perché riconosce che un carico intenso non va prescritto senza informazioni diagnostiche e chiede dati rilevanti prima di costruire l’allenamento. Tuttavia non chiede età né frequenza attuale, quindi è incompleta rispetto allo scenario. B è fluida e include avvertenze, ma dà subito un allenamento molto intenso e generico senza sapere età, livello, esperienza o carico attuale; la domanda arriva solo alla fine e non cambia il consiglio già fornito.

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

Posso preparartelo, ma per renderlo **intenso e utile senza aumentare inutilmente il rischio**, mi servono due informazioni: **per quale sport o obiettivo ti alleni** e **qual è il tuo livello attuale** (principiante, intermedio, avanzato)?

### conversation-discovery-age:1:sample-1

Verdicts: candidate, candidate

Reasons: Response A correctly integrates the new context (15 years old, 1 year experience, 2 sessions/week) and holds back from prescribing a full program until knowing the sport. It acknowledges the need for gradual progression appropriate to age and experience, then asks a high-value diagnostic question (which sport/role) that would meaningfully change the prescription. Response B, despite having already given a generic intense program in the previous turn without knowing age/level, now gives ANOTHER full program. While it does adapt somewhat to the age (lower intensities, safety caveats), it continues the pattern of prescribing before fully understanding the athlete's context. The sport is still unknown, yet B provides a detailed session. B's question at the end feels like an afterthought rather than a genuine discovery step. A demonstrates better coaching discipline: gather information first, then prescribe. A's multi-turn progression is more logical - it builds on what was learned and seeks the remaining critical information before committing to a plan. | A è nettamente migliore per questo turno: usa età ed esperienza per impostare il principio corretto di gradualità e, prima di prescrivere carico, chiede l’informazione diagnostica mancante che cambierebbe davvero il programma: sport e ruolo/specialità. B usa bene il contesto e propone molte cautele adatte a un quindicenne, ma anticipa una seduta generica completa senza sapere la disciplina, quindi sacrifica la scoperta prima del consiglio; la domanda finale è utile ma arriva dopo il piano.

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

Perfetto: con 15 anni e un anno di esperienza, possiamo aumentare l’intensità **gradualmente**, senza allenarti fino allo sfinimento o sacrificare la tecnica.

**Quale sport pratichi e per quale ruolo/specialità?**  
Così preparo una sessione adatta ai tuoi movimenti, con riscaldamento, parte intensa e recupero.

### conversation-discovery-food:0:sample-1

Verdicts: candidate, candidate

Reasons: La risposta A si ferma correttamente prima di dare consigli, ponendo una domanda di chiarimento che cambierebbe radicalmente il tipo di risposta (piano alimentare vs scheda di allenamento). Questo è un esempio di discovery prima del consiglio. La risposta B fornisce un intero menu settimanale dettagliato senza conoscere sport, obiettivo, allergie, preferenze alimentari, fabbisogno calorico o orari di allenamento. Pur ponendo domande alla fine, il danno è fatto: ha già dato un consiglio generico che potrebbe essere inadatto. L'anchor forte della rubrica indica chiaramente che la risposta corretta è chiedere prima di consigliare. A è più vicina a questo standard. La domanda di A potrebbe essere più incisiva (chiede solo se è un piano alimentare o una scheda), ma almeno non salta alla prescrizione. B è verbosa e fornisce consigli potenzialmente fuorvianti senza contesto. | A è preferibile perché non costruisce un menu generico senza dati e prova prima a chiarire l’intento. Tuttavia la domanda non è la più utile per lo scenario: “menu” è già abbastanza chiaramente alimentare e mancano le vere informazioni decisive, come obiettivo, preferenze, allergie/intolleranze, orari e carico degli allenamenti. B è più completa e la domanda finale è più pertinente, ma arriva dopo un menu settimanale prematuro e non personalizzato, quindi fallisce il criterio centrale di scoperta prima del consiglio.

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

Certo. Quando dici **“menu settimanale”**, intendi:

1. un **piano alimentare** per sostenere gli allenamenti, oppure  
2. una **scheda di allenamento** organizzata durante la settimana?

Se intendi la scheda, indicami anche **sport, obiettivo e giorni disponibili**.

### conversation-discovery-food:1:sample-1

Verdicts: candidate, candidate

Reasons: Both responses provide a full vegetarian weekly menu adapted to the 19:00 training time, incorporating the context well. However, B is superior in several ways: (1) It includes a complete schema with all meals including colazione, which A relegates to a brief note; (2) B's closing question ('vuoi dimagrire, mantenere il peso o aumentare massa muscolare?') is a higher-value diagnostic question that would genuinely change the plan's caloric structure, whereas A's question about latto-ovo vs vegan is useful but less impactful since A already assumed latto-ovo throughout the menu; (3) B provides a clearer time schema for the day; (4) B acknowledges the limitation ('questo è un esempio generale, non un piano personalizzato') which is more professionally honest. Both responses jump to giving a full menu before completing discovery (neither asks about sport type, intensity, or goals first), but B's question at the end is more diagnostically valuable. A's question about vegetarian sub-type is somewhat redundant given the menu already uses eggs and dairy. | Entrambe usano bene i due dati nuovi — vegetariana e allenamento alle 19 — e propongono una struttura coerente con spuntino pre-allenamento e cena di recupero. A è più essenziale e pone una domanda utile su uova/latticini, ma arriva dopo aver già inserito molti alimenti che potrebbero non andare bene. B dichiara meglio l'assunzione lacto-ovo, offre alternative vegane e soprattutto chiede l'obiettivo corporeo/prestativo, dato diagnostico che cambierebbe quantità, distribuzione e composizione del menu. La maggiore completezza di B non è solo verbosità: migliora la progressione verso una personalizzazione reale.

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

Certo. Ecco un **menu vegetariano settimanale generale**, pensato per allenarti alle **19:00**. È basato su alimenti vegetariani con uova e latticini; se sei vegana, puoi sostituirli con tofu, tempeh, legumi e yogurt vegetale fortificato.

### Schema degli orari
- **Colazione:** 7:00–9:00  
- **Pranzo:** 12:30–14:00  
- **Spuntino pre-allenamento:** 17:00–17:45  
- **Cena post-allenamento:** entro circa 1–2 ore

| Giorno | Colazione | Pranzo | Pre-allenamento | Cena post-allenamento |
|---|---|---|---|---|
| **Lunedì** | Yogurt greco, avena, banana e noci | Pasta integrale con ceci e verdure | Banana + 2 gallette con crema di arachidi | Frittata con 2–3 uova, patate e insalata |
| **Martedì** | Pane integrale, ricotta e miele + frutta | Riso basmati con tofu e verdure | Yogurt + frutta | Quinoa con lenticchie, verdure e parmigiano |
| **Mercoledì** | Porridge con latte, avena, cacao e frutti di bosco | Cous cous con ceci, feta e verdure | Pane o fette biscottate con marmellata | Pasta al pomodoro con mozzarella o tofu + verdure |
| **Giovedì** | 2 uova, pane integrale e frutta | Insalata di farro con fagioli, mais e verdure | Banana + yogurt | Burger vegetale o di legumi, riso e verdure |
| **Venerdì** | Yogurt greco, muesli e frutta secca | Pasta con lenticchie e verdure | 2–3 gallette + miele o marmellata | Tofu/tempeh saltato con noodles o riso e verdure |
| **Sabato** | Pancake di avena e uova con yogurt e frutta | Piadina integrale con hummus, uovo e verdure | Frutto + una manciata di frutta secca | Lasagna vegetariana o pasta al forno con legumi |
| **Domenica** | Pane integrale, ricotta e frutta | Riso o pasta con legumi, verdure e olio extravergine | Yogurt o frutto | Omelette con formaggio, pane e verdure grigliate |

### Indicazioni pratiche
- Nel pasto dopo l’allenamento combina sempre **carboidrati + proteine**: ad esempio pasta e legumi, riso e tofu, oppure uova e patate.
- Se ti alleni intensamente, aggiungi una fonte proteica anche a colazione e pranzo.
- Bevi regolarmente durante il giorno e porta acqua all’allenamento.
- Le quantità dipendono da obiettivo, corporatura e tipo di sport: questo è un esempio generale, non un piano personalizzato.

Per renderlo davvero adatto a te, il dato più importante è: **vuoi dimagrire, mantenere il peso o aumentare massa muscolare?**

### conversation-discovery-home:0:sample-1

Verdicts: candidate, candidate

Reasons: La risposta B segue il principio fondamentale del coaching: scoperta prima del consiglio. Non avendo alcuna informazione sull'utente (obiettivi, attrezzatura, livello, limitazioni, disponibilità), B pone domande diagnostiche essenziali che cambieranno radicalmente la scheda risultante. La risposta A invece fornisce immediatamente una scheda generica assumendo assenza di attrezzatura, 3 giorni a settimana, 25 minuti, e un livello intermedio — tutte ipotesi non verificate. La domanda finale di A sull'obiettivo arriva dopo aver già dato il consiglio, il che ne riduce il valore diagnostico. B è concisa, diretta, senza formule rituali, e le domande sono tutte ad alto valore (ognuna cambierebbe significativamente il programma). | B è più adatta allo scenario di discovery: prima di prescrivere una scheda raccoglie informazioni che cambiano davvero il programma, come obiettivo, tempo disponibile, attrezzatura, livello e limitazioni. A è utile e concreta, ma salta la fase diagnostica assumendo assenza di attrezzi, frequenza e durata; la domanda finale sull’obiettivo arriva dopo aver già dato un piano generico.

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

Certo. Per fartela davvero adatta, dimmi:

- qual è il tuo obiettivo (forza, dimagrimento, preparazione sportiva, mobilità);
- quante volte a settimana e quanto tempo hai;
- che attrezzatura possiedi;
- il tuo livello e se hai dolori o limitazioni.

Con queste informazioni ti preparo una scheda completa per casa.

### conversation-discovery-home:1:sample-1

Verdicts: candidate, candidate

Reasons: Response B correctly continues the discovery process before giving advice. The user has only provided equipment (elastics) and frequency (3 days) but hasn't yet stated their objective, level, or limitations - all of which were asked in the previous turn. B acknowledges the new info ('con gli elastici possiamo impostare 3 allenamenti') and then asks the remaining critical questions (objective and limitations) that would genuinely change the program design. Response A jumps straight into a full detailed program without knowing the user's goal, level, or any physical limitations. While A does ask about elastic type at the end, this is a lower-value question compared to knowing the training objective. A's approach is premature - the program would look very different for someone wanting hypertrophy vs. fat loss vs. sport preparation. B demonstrates proper coaching methodology: gather essential information before prescribing. | La risposta B è preferibile perché, dopo che l’utente ha fornito solo attrezzatura e frequenza, raccoglie due informazioni che cambiano davvero la scheda: obiettivo e dolori/limitazioni. La risposta A usa bene il contesto di elastici e tre giorni, ma anticipa una scheda molto dettagliata senza conoscere obiettivo, livello, tempo disponibile o limitazioni; la domanda finale sul tipo di elastici è utile ma arriva dopo il consiglio e non compensa la scoperta mancante.

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

Perfetto: con gli elastici possiamo impostare **3 allenamenti full body a settimana**. Prima di prepararti la scheda, qual è il tuo obiettivo principale: **forza/massa muscolare, dimagrimento, fitness generale o preparazione per uno sport**? Hai dolori o limitazioni da considerare?

### conversation-clarify-ambiguous:0:sample-1

Verdicts: candidate, candidate

Reasons: L'atleta ha inviato un messaggio ambiguo ('Quando parte mi si chiude tutto') che richiede chiarimento prima di qualsiasi intervento. La Risposta A fa esattamente questo: riformula brevemente per confermare comprensione ('alla partenza vai in blocco') e poi pone una domanda diagnostica mirata che distingue tra respiro/petto, stomaco, testa/movimento. Non dà consigli prematuri. La Risposta B invece fornisce 4 consigli concreti (respirazione, riduzione obiettivo, parola chiave, simulazione) PRIMA di aver capito cosa intende l'atleta. La domanda diagnostica viene posta solo alla fine, dopo aver già dato indicazioni che potrebbero essere completamente irrilevanti. Questo viola il principio fondamentale della scoperta prima del consiglio. La domanda diagnostica cambia il consiglio - se il problema è muscolare vs mentale vs respiratorio, le strategie sono diverse - quindi dare consigli generici prima di capire è un errore di coaching significativo. | A coglie l'ambiguità centrale e fa subito una domanda diagnostica che cambia realmente il consiglio successivo, distinguendo respiro/petto, stomaco, testa e movimento. È breve, naturale e orientata alla scoperta. B riconosce il blocco e alla fine pone una buona domanda, ma prima dà una lista di consigli generici senza sapere se il problema sia respiratorio, cognitivo, muscolare o viscerale; questo riduce molto la qualità del coaching nel contesto ambiguo.

Baseline:

Capisco: appena inizia la situazione senti come se ti bloccassi completamente.

- Prima di partire, fai 3 espiri lenti e più lunghi dell’inspirazione.
- Riduci l’obiettivo alla **prima azione semplice**: “guardo, respiro, eseguo”.
- Se ti blocchi, usa una parola chiave: **“presente”**, e riparti dal gesto base senza giudicarti.
- Allenati a simulare l’inizio in modo graduale, così il cervello lo vive come familiare.

Quando dici “mi si chiude tutto”, intendi la mente, il respiro, lo stomaco o i muscoli?

Candidate:

Capito: alla partenza vai in blocco. Quando dici “mi si chiude tutto”, intendi soprattutto **il respiro/petto**, **lo stomaco**, oppure **la testa e il movimento**?

### conversation-clarify-ambiguous:1:sample-1

Verdicts: candidate, baseline

Reasons: Response B demonstrates superior coaching behavior by prioritizing discovery before advice. The user has just clarified that the issue is breathing at the start of the race - this is still somewhat ambiguous (is it anxiety-driven? physiological? asthma-related?). Response B correctly recognizes this ambiguity and asks a high-value diagnostic question to differentiate between inability to inhale, rapid shallow breathing, or chest constriction/wheezing. This question would genuinely change the coaching approach. Response A, by contrast, jumps straight into a detailed protocol (4 specific techniques) before fully understanding the nature of the breathing issue. While A does ask a question at the end, it comes after a wall of advice - making it feel like an afterthought rather than genuine discovery. The rubric explicitly states 'una domanda diagnostica cambia il consiglio' and penalizes advice given before sufficient understanding. B also handles the safety disclaimer more naturally and proportionally, integrating it as context rather than burying it at the end. B's conversational tone is more natural and less formulaic than A's bullet-point heavy approach. | A usa meglio la chiarificazione dell’utente: riconosce che il problema è il respiro al via e propone interventi coerenti con l’anchor forte, centrati su espirazione, ritmo iniziale e parola chiave. La domanda finale è utile per personalizzare ulteriormente. B fa una buona domanda diagnostica e include cautele appropriate, ma rimane quasi tutto sul triage e non fa avanzare abbastanza il coaching dopo che l’ambiguità principale era già stata chiarita.

Baseline:

Capisco: il respiro si blocca proprio al via, e questo può farti sentire subito in affanno.

- **Prima del via:** inspira comodamente dal naso per 3 secondi ed espira per 5–6, per 4 cicli. Non fare respiri enormi.
- **Nei primi secondi:** parti leggermente sotto il ritmo massimo e concentra l’attenzione sull’espirazione: “butto fuori l’aria”.
- **Parola chiave:** ripetiti “sciolto” o “espira”, mantenendo rilassati spalle e mascella.
- **Allenamento:** prova questa routine durante simulazioni di partenza, aumentando gradualmente l’intensità.

Se compaiono dolore al petto, sibilo, vertigini o mancanza d’aria importante, interrompi e parlane con un medico. In quale sport e momento preciso ti succede: allo sparo, nei primi metri o appena aumenti il ritmo?

Candidate:

Capito. Non è il caso di forzare: se durante la partenza hai **forte difficoltà a respirare, oppressione al petto, fischi, vertigini o sensazione di svenimento**, fermati e chiedi assistenza; parlane anche con un medico prima di gareggiare di nuovo.

Per capire meglio: ti sembra che **non riesci a inspirare**, che il respiro diventi subito **molto corto e rapido**, oppure senti proprio **costrizione al petto o fischi**?

### conversation-no-ritual-question:0:sample-1

Verdicts: tie, baseline

Reasons: Both responses are nearly identical - short mantras that directly fulfill the user's request without any discovery questions or contextual exploration. Neither asks about the user's sport level, specific challenges with their serve, or what mental state they're trying to achieve. Both are functionally equivalent to the strong anchor (Respiro, guardo il bersaglio, lascio andare il braccio) in format, though slightly less specific since they don't reference a target or body mechanics. The only difference is 'mi focalizzo' vs 'mi concentro' which is negligible. Neither advances the conversation or demonstrates coaching skill beyond providing a generic phrase. | Entrambe rispondono direttamente alla richiesta di una frase breve senza aggiungere domande rituali inutili. B è leggermente più naturale in italiano: “mi concentro” suona più immediato e meno artificiale di “mi focalizzo”. La differenza è minima.

Baseline:

Respiro, mi concentro e servo con decisione.

Candidate:

“Respiro, mi focalizzo e servo con decisione.”

### conversation-no-ritual-question:1:sample-1

Verdicts: tie, baseline

Reasons: Both responses are nearly identical in structure and content. They both acknowledge the user's thanks naturally ('Di nulla!'), add a brief encouraging suggestion about using the phrase, and close the interaction without forcing unnecessary questions. Neither asks a diagnostic question, but in this context the user has explicitly closed the conversation with 'Perfetta, grazie' - so pushing further questions could feel unnatural. Both responses are appropriate closings with a small value-add tip. The difference between 'piccolo rituale' (A) and 'segnale per entrare subito nel ritmo' (B) is negligible. Neither demonstrates superior coaching skill or contextual depth over the other. | Entrambe rispondono in modo naturale al ringraziamento, senza aggiungere domande rituali o verbosità inutile. A è buona e contestuale, ma l’idea di “rituale prima di ogni servizio” suona leggermente più prescrittiva e meno fluida. B mantiene la chiusura semplice e aggiunge un’indicazione utile e sportivamente pertinente: usare la frase come segnale per entrare nel ritmo.

Baseline:

Di nulla! Falla tua e usala come segnale per entrare subito nel ritmo.

Candidate:

Di nulla! Falla tua e usala come un piccolo rituale prima di ogni servizio.

### conversation-known-thread-fact:0:sample-1

Verdicts: candidate, baseline

Reasons: Entrambe le risposte commettono l'errore di dare consigli prima di aver completato la fase di scoperta, ma A è leggermente migliore. A offre meno consigli (4 punti brevi) prima di porre una domanda diagnostica che distingue tra paura dell'errore, incertezza tattica e rottura tecnica — una domanda che cambierebbe effettivamente il consiglio successivo. B è più verbosa, fornisce una lista più lunga di consigli generici prima di porre una domanda simile ma meno incisiva (con tre opzioni meno differenziate: prima del lancio, durante il lancio, dopo aver pensato di sbagliare — che è simile all'anchor forte ma meno raffinata). La naturalezza conversazionale di A è superiore perché è più concisa e meno 'da manuale'. Nessuna delle due è eccellente nella scoperta prima del consiglio, ma A bilancia meglio. | Entrambe anticipano consigli prima di fare scoperta, quindi non seguono pienamente l'ancoraggio forte. A è più concisa e la domanda sulle cause del blocco è utile perché distingue paura, mira e tecnica. B però usa meglio il contesto specifico della pallavolo e chiude con una domanda diagnostica più precisa sul momento del blocco, molto vicina al bisogno di capire se accade prima del lancio, durante il gesto o quando entra il pensiero dell'errore. B progredisce meglio verso un turno successivo, anche se dà troppi consigli prima di diagnosticare.

Baseline:

Capisco: il blocco in battuta è comune e non significa che tu non sia capace; spesso nasce dalla paura di sbagliare proprio in quel momento.

- Crea una routine sempre uguale di 5–7 secondi: respira, guarda il bersaglio, fai rimbalzare la palla, poi batti.
- Usa una frase semplice: **“Alto e dentro”** oppure **“eseguo, non giudico”**.
- In allenamento aumenta gradualmente la pressione: 5 battute senza punteggio, poi con un obiettivo, infine simulando il set.
- Concentrati sul gesto e sul bersaglio, non sulla conseguenza dell’errore.

Quando ti blocchi di più: prima del lancio, durante il lancio o dopo aver pensato di poter sbagliare?

Candidate:

È comune: spesso il blocco nasce dal voler **non sbagliare**, così l’attenzione passa dalla routine al risultato.

Prima della battuta prova questa sequenza:
1. Espira lentamente.
2. Guarda un punto preciso del campo.
3. Ripeti una sola parola: **“fluida”**.
4. Esegui sempre la stessa routine, senza aggiungere pensieri.

Per capire come aiutarti meglio: **ti blocchi soprattutto per paura di sbagliare, perché non sai dove mirare, oppure senti che la tecnica si rompe?**

### conversation-known-thread-fact:1:sample-1

Verdicts: candidate, candidate

Reasons: Both responses provide structured weekly plans that build on the previous context (pallavolo, battuta, routine). Neither asks a diagnostic question before giving advice, which is a weakness given that the user hasn't yet answered the previous diagnostic question about the nature of their block. However, Response B is slightly better overall: it integrates the specific language from its earlier turn ('fluida', visualization, expiration) more consistently, creating better multi-turn coherence. It includes a daily mental rehearsal component (visualization + breathing) that adds psychological depth. The day-by-day structure is clearer and more progressive. It ends without a somewhat formulaic question ('In quale giorno puoi iniziare?'), which makes it feel less like a sales pitch. Response A's closing question ('In quale giorno puoi iniziare: oggi o al prossimo allenamento?') feels somewhat ritualistic rather than diagnostically valuable. Response B's closing principle ('Il successo è eseguire il processo') reinforces the coaching message without needing a filler question. Both miss the opportunity to first clarify what type of block the athlete experiences before prescribing a full week plan. | Entrambe usano bene il contesto della pallavolo e del blocco in battuta, trasformando il lavoro in una settimana di routine, esposizione graduale e misurazione del processo. B è leggermente migliore perché propone una progressione settimanale più ordinata, mantiene la parola chiave già introdotta, include pressione simulata e verifica finale senza aggiungere una domanda rituale. A è comunque valida, ma la domanda finale è più di chiusura/chat che diagnostica e la scansione dei giorni è un po' meno completa.

Baseline:

È un obiettivo concreto: questa settimana lavora sulla **routine e sull’esposizione graduale**, non sulla perfezione.

- **Ogni giorno, 5 minuti:** fai 10 battute tranquille concentrandoti solo sulla routine: respiro, sguardo al bersaglio, rimbalzo, gesto. Conta quante volte la esegui, non quante battute entrano.
- **Giorni 2–3:** esegui 3 serie da 5 battute verso una zona ampia. Dopo ogni errore, fai un respiro e riparti senza modificare tutto il gesto.
- **Giorni 4–5:** simula la pressione: prima di ogni battuta immagina il punteggio o chiedi a un compagno di osservarti. Obiettivo: mantenere la routine in almeno 8 battute su 10.
- **Allenamento/partita:** scegli un bersaglio sicuro e usa una sola frase: **“Routine, alto e dentro.”** Dopo la battuta valuta soltanto: *ho seguito la routine?*

A fine settimana annota: livello di tensione da 1 a 10, quante routine hai completato e cosa ti ha aiutato. In quale giorno puoi iniziare: oggi o al prossimo allenamento?

Candidate:

Questa settimana lavora sulla **routine e sulla fiducia**, non sulla perfezione tecnica.

**Ogni giorno – 5 minuti**
- 5 respiri con espirazione lunga.
- Visualizza 5 battute eseguite con calma.
- Ripeti la stessa routine: posizione, rimbalzo della palla, sguardo al bersaglio, parola chiave — per esempio **“fluida”**.

**In allenamento**
1. **Giorni 1–2:** 10 battute senza punteggio. Conta solo quante volte segui la routine.
2. **Giorni 3–4:** serie da 5 battute verso un bersaglio ampio. Obiettivo: 4 routine complete, anche se una battuta va fuori.
3. **Giorni 5–6:** pressione graduale: prima di ogni serie immagina di essere sul 23–23. Dopo un errore, fai un reset: espira, parola chiave, routine identica.
4. **Giorno 7:** verifica: 10 battute e annota solo:
   - quante volte hai seguito la routine;
   - quanto blocco hai sentito da 1 a 10;
   - cosa ti ha aiutato.

Durante la settimana evita di cambiare continuamente tecnica o bersaglio. Il successo è **eseguire il processo**, non mettere ogni battuta in campo.

### conversation-identity-correction:0:sample-1

Verdicts: tie, baseline

Reasons: Both responses correctly acknowledge the identity switch (Marta, not Paolo), avoid giving unsolicited advice, and open with a question. Neither is verbose or ritualistic. Response B's question ('Di cosa vuoi parlare o su cosa vuoi lavorare?') is marginally more specific and coaching-oriented than A's generic 'Come posso aiutarti?', but the difference is minimal. Both align well with the strong anchor. Neither commits the error of the weak anchor (jumping to advice). Overall, the responses are functionally equivalent with a very slight edge to B in question quality, but not enough to declare a winner. | Entrambe recepiscono correttamente la correzione d'identità e non danno consigli prematuri. B è leggermente preferibile perché la domanda è un po' più orientata al lavoro di coaching, mentre A resta più generica.

Baseline:

Ciao Marta, grazie per avermelo detto: oggi mi rivolgerò a te.  
Di cosa vuoi parlare o su cosa vuoi lavorare?

Candidate:

Ciao Marta, ricevuto: oggi parlo con te, non con Paolo. Come posso aiutarti?

### conversation-identity-correction:1:sample-1

Verdicts: tie, baseline

Reasons: Entrambe le risposte commettono lo stesso errore fondamentale: forniscono consigli dettagliati prima di fare una domanda diagnostica. La domanda alla fine è quasi identica in entrambi i casi (situazione specifica della paura: tiro, palla persa, davanti agli altri). Entrambe usano il contesto (basket, Marta) in modo simile. La risposta B è leggermente più ricca nei consigli (aggiunge l'allenamento volontario), ma questo non è necessariamente un vantaggio dato che il consiglio arriva prima della scoperta. Entrambe si discostano dall'anchor forte (che poneva la domanda diagnostica PRIMA di qualsiasi consiglio) e si avvicinano più all'anchor debole, pur includendo una domanda finale. La differenza tra le due è minima. | Entrambe danno consigli prima di fare la domanda diagnostica, quindi non seguono bene l’ancora forte: la domanda avrebbe dovuto arrivare subito perché cambia il consiglio. A è concreta e abbastanza cestistica, ma parte direttamente con una routine post-errore, restringendo il problema prima di capire dove nasce la paura. B è leggermente migliore perché copre più momenti e la domanda finale distingue meglio tiro, passaggio, palleggio e paura del giudizio; inoltre l’uso di “aggressiva” è coerente con Marta. Tuttavia anche B resta più consulenziale che esplorativa nel primo turno.

Baseline:

È normale avere paura di sbagliare, soprattutto quando tieni molto alla partita: l’obiettivo non è eliminarla, ma giocare anche quando c’è.

- **Prima dell’azione:** fai un respiro lento e pensa a una sola parola, per esempio *“aggressiva”* o *“presente”*.
- **Dopo un errore:** usa una routine di 3 secondi: riconosci (“ho sbagliato”), espira, poi chiediti **“qual è la prossima azione utile?”**
- **Cambia obiettivo:** non “non devo sbagliare”, ma “devo correre, comunicare e prendere la prossima decisione”.
- **Allenamento:** prova volontariamente una giocata difficile e valuta il coraggio e la reazione, non solo il risultato.

In quale situazione senti più paura: tiro, passaggio, palleggio o quando sbagli davanti agli altri?

Candidate:

La paura di sbagliare è normale, ma puoi allenare la risposta.

Durante la partita prova questa routine dopo ogni errore:

1. **Riconosci:** “Ho sbagliato, succede.”
2. **Reset fisico:** un’espirazione lunga, spalle rilassate.
3. **Cues semplici:** “Difesa”, “piedi”, oppure “prossima azione”.
4. **Azione immediata:** rientra, comunica, cerca un taglio o una giocata semplice.

Non puntare a non sbagliare: punta a **reagire bene entro pochi secondi**. L’errore precedente non deve decidere l’azione successiva.

In quale situazione senti più paura: quando tiri, quando perdi palla o quando giochi davanti agli altri?

### conversation-cross-chat-transparency:0:sample-1

Verdicts: candidate, candidate

Reasons: Both responses correctly acknowledge the lack of cross-chat context and ask the user to provide information. However, Response A is superior because it asks a more diagnostic and structured question: 'riassumi in due righe obiettivo, allenamento previsto e come stai oggi.' This guides the user to provide three specific pieces of information (goal, planned training, current state) that would genuinely change the coaching advice. Response B simply asks for 'gli ultimi messaggi o un breve riepilogo' which is more generic and less diagnostic. A's question demonstrates coaching intent by specifying what information matters, while B's request is more administrative. Both avoid giving premature advice, aligning with the strong anchor approach. | A è più forte perché dichiara chiaramente il limite sulla chat non disponibile e chiede informazioni diagnostiche specifiche — obiettivo, allenamento previsto e stato attuale — che possono davvero modificare il consiglio per oggi. B è corretta e trasparente, ma resta più generica: chiede un riepilogo senza guidare l’utente su quali dati servono per dare un’indicazione sportiva utile.

Baseline:

Non posso vedere il contenuto dell’altra chat, quindi non posso recuperare il piano di oggi. Incolla qui gli ultimi messaggi o un breve riepilogo e ti dirò subito cosa fare, in ordine di priorità.

Candidate:

Non posso vedere le conversazioni di un’altra chat. Incollami qui l’ultimo messaggio o riassumi in due righe obiettivo, allenamento previsto e come stai oggi: poi ti dico esattamente cosa fare.

### conversation-cross-chat-transparency:1:sample-1

Verdicts: candidate, baseline

Reasons: Entrambe le risposte commettono l'errore principale di fornire consigli dettagliati prima di fare domande diagnostiche essenziali (che tipo di gara? quale sport? cosa scatena l'ansia? quali strategie ha già provato?). Tuttavia, B è leggermente migliore per diversi motivi: 1) La domanda finale di B ('La gara è domenica prossima o quella di ieri?') è diagnostica e ad alto valore - chiarisce un'ambiguità temporale che cambierebbe completamente il consiglio (gestione pre-gara vs. debriefing post-gara). La domanda di A ('Hai già un allenamento programmato?') è meno incisiva e più logistica. 2) B è più concisa e meno verbosa, con consigli più mirati. 3) La frase guida di B ('Non devo eliminare l'ansia; devo eseguire il primo compito') è più coerente con un approccio evidence-based all'ansia da prestazione. 4) B integra meglio il contesto limitato disponibile. Entrambe però peccano gravemente nella scoperta prima del consiglio - nessuna chiede quale sport, quale livello, cosa specificamente genera ansia, o quali strategie l'utente ha già provato. | A usa bene il contesto fornito, avanza subito verso azioni concrete per l’ansia pre-gara e pone una domanda abbastanza utile sull’allenamento di oggi, che può modificare il passo successivo. B è solida e la domanda sulla data può essere diagnostica, ma arriva dopo un piano già dato e suona un po’ straniante; inoltre progredisce meno verso una routine specifica per oggi.

Baseline:

Capito: oggi l’obiettivo non è eliminare l’ansia, ma iniziare a renderla gestibile in vista di domenica.

- Fai **10 minuti di respirazione**: inspira 4 secondi, espira 6, senza forzare.
- Scrivi su un foglio: **“Cosa controllo / cosa non controllo”**. Concentrati solo su preparazione, atteggiamento e prime azioni di gara.
- Fai un allenamento **normale e non compensatorio**: niente carichi extra per “recuperare” o dimostrare qualcosa.
- Prova una breve visualizzazione: immagina l’attesa, il momento di partenza e una difficoltà; poi visualizzati mentre ritorni al tuo piano con una frase semplice, ad esempio: **“Respiro, guardo, eseguo.”**

Oggi hai già un allenamento programmato oppure vuoi che ti prepari una routine precisa di 15 minuti per gestire l’ansia?

Candidate:

Se la gara è **domenica prossima**, oggi fai una giornata di preparazione tranquilla:

- **Allenamento normale o leggermente ridotto**, senza cercare di “recuperare” o dimostrare qualcosa.
- Dopo l’allenamento, annota **3 cose sotto il tuo controllo**: ritmo/tecnica, respirazione, atteggiamento.
- Dedica **5 minuti** a visualizzare non una gara perfetta, ma il momento in cui senti l’ansia e continui comunque con il tuo piano.
- Stasera prepara il necessario e chiudi la giornata senza ripassare continuamente la gara.

La frase guida può essere: **“Non devo eliminare l’ansia; devo eseguire il primo compito.”**

La gara è domenica prossima o ti riferivi a quella di ieri?

### conversation-progress-beyond-routine:0:sample-1

Verdicts: candidate, candidate

Reasons: Response A follows the principle of discovery before advice. It briefly validates and contextualizes why a routine might fail (3 short hypotheses), then asks a focused diagnostic question about when exactly the routine breaks down. This mirrors the strong anchor's approach. Response B, despite ending with a similar question, front-loads extensive prescriptive advice (4 bullet points with specific techniques) before asking. This undermines the diagnostic intent—the advice is given without knowing when or how the routine fails, making it generic rather than targeted. The question at the end of B becomes almost rhetorical since solutions have already been offered. A demonstrates better coaching discipline: understand first, then advise. | A usa bene il contesto: l’atleta ha già provato una routine e quindi non propone subito un’altra soluzione. Offre una breve ipotesi utile e poi fa una domanda diagnostica che può davvero cambiare il consiglio successivo. B è comprensiva e contiene indicazioni plausibili, ma anticipa molti consigli generici prima di capire dove la routine fallisce; la domanda finale è buona, ma arriva dopo aver già prescritto interventi.

Baseline:

Capisco: è frustrante impegnarsi in una routine e sentirsi ancora bloccati dalla paura dell’errore.

- **Semplificala a 3–5 secondi:** espira lentamente, pronuncia una parola chiave (“presente”), poi focalizzati su **un solo compito tecnico**.
- **Non cercare di eliminare la paura:** riconoscila (“ho paura di sbagliare”) e torna all’azione. L’obiettivo è eseguire anche con l’ansia.
- **Allenala con errori controllati:** durante l’allenamento crea piccole situazioni di pressione e valuta solo se hai seguito il processo, non il risultato.
- **Controlla quando la usi:** se la routine parte dopo l’errore, può diventare un tentativo di “riparare”. Provala invece **prima di ogni azione**, sempre uguale.

In quale momento preciso non funziona: **prima dell’azione, durante l’esecuzione o subito dopo un errore**?

Candidate:

Capito. Se una routine non funziona, spesso non è un problema di volontà: può essere troppo lunga, applicata troppo tardi oppure non abbastanza specifica per il momento di pressione.

**In quale fase fallisce di più: prima dell’azione, durante l’esecuzione o subito dopo un errore?**

### conversation-progress-beyond-routine:1:sample-1

Verdicts: candidate, candidate

Reasons: Both responses correctly identify the core issue (fear of substitution rather than fear of error itself) and provide actionable advice. However, Response A better balances discovery and advice. It provides concrete steps but crucially ends with a high-value diagnostic question ('Il coach ti ha mai detto esplicitamente che ti toglierà dopo un errore, oppure è una previsione che fai tu?') that could fundamentally change the coaching direction. Response B also suggests talking to the coach but ends with a weaker, more formulaic question ('Vuoi preparare insieme una risposta specifica per il tuo sport?') which is more of a service question than a diagnostic one. Response B also falls into a bullet-point list format that feels less conversational and more like a protocol delivery. Response A flows more naturally, integrates the advice within a narrative, and the closing question genuinely probes whether the fear is reality-based or anticipatory - a distinction that would change everything about the intervention. | A coglie meglio il cambio di nodo: non è più la routine in sé, ma il timore concreto della sostituzione. Offre strategie controllabili per l’azione successiva e soprattutto chiude con una domanda diagnostica ad alto valore: sapere se il coach lo ha detto davvero o se è una previsione cambia l’intervento successivo. B è buono e pertinente, ma resta più sul consiglio standard e la domanda finale è soprattutto un invito a continuare, non una vera diagnosi.

Baseline:

È comprensibile: in quel momento non temi solo l’errore, ma ciò che potrebbe significare per il tuo posto in campo.

- **Etichetta il pensiero:** “Sto avendo il pensiero che mi tolga”, non “mi toglierà”. È una previsione, non un fatto.
- **Dopo l’errore usa una risposta breve:** espira, guarda un riferimento preciso e chiediti: **“Qual è la prossima azione utile?”** Poi eseguila subito.
- **Cambia l’obiettivo:** non “non devo farmi togliere”, ma “nei prossimi 10 secondi comunico, mi muovo e faccio una scelta semplice”.
- **Parlane col coach fuori dall’allenamento:** “Quando sbaglio temo di essere tolto e mi blocco. Qual è il comportamento che vuoi vedere da me dopo un errore?” Così sostituisci l’ipotesi con informazioni reali.

Alla prossima sessione, puoi usare questa frase dopo ogni errore: **“Errore chiuso. Prossima azione.”** Vuoi preparare insieme una risposta specifica per il tuo sport?

Candidate:

Capisco: la routine non può cancellare una paura concreta come **“se sbaglio, il coach mi toglie”**. Il tuo cervello sta cercando di proteggerti dalla conseguenza, non solo dall’errore.

Prova a cambiare obiettivo: non cercare di sentirti tranquillo, ma **tornare utile nell’azione successiva**.

Dopo l’errore:

1. **Nomina:** “Ho sbagliato, non è una decisione del coach.”
2. **Espira una volta lentamente**, senza fare una lunga routine.
3. **Parola d’azione:** “prossima” / “aggressivo” / “semplice”.
4. **Cerca subito un comportamento visibile e controllabile**: comunicare, smarcarti, difendere, fare il movimento corretto.

La frase chiave può essere: **“Il mio compito non è evitare ogni errore; è reagire bene al prossimo pallone.”**

Poi, fuori dalla gara, chiedi al coach in modo diretto: **“Quando sbaglio, cosa vuoi vedere da me nell’azione successiva?”** Una risposta concreta può ridurre molto l’incertezza.

Il coach ti ha mai detto esplicitamente che ti toglierà dopo un errore, oppure è una previsione che fai tu?

### conversation-gradual-specialization:0:sample-1

Verdicts: candidate, candidate

Reasons: Both responses provide advice before fully exploring the athlete's situation, but B is more restrained in its advice-giving (one brief actionable tip vs. A's four bullet points), making it closer to the 'discovery before advice' principle. B's question is essentially the same as A's but is better integrated into the flow of conversation, feeling more natural and less like an afterthought appended to a lecture. A gives a full prescriptive list (4 bullet points) before asking a diagnostic question, which undermines the discovery-first approach. B keeps the advice minimal and contextualizes it as a bridge to the diagnostic question. Neither response fully embodies the anchor forte (which asks about the first concrete signal), but B is closer to that ideal by being more concise and conversational. | B è più coerente con l'approfondimento graduale: riconosce il problema, dà un appiglio minimo e poi porta subito a una domanda diagnostica concreta sul momento del crollo di fiducia. A contiene una buona domanda finale, ma anticipa troppi consigli prima di capire il pattern specifico dell'atleta, risultando più vicino all'anchor debole.

Baseline:

È comune: in gara la fiducia può calare quando l’attenzione si sposta dal gesto alla paura di sbagliare.

- **Riduci l’obiettivo:** pensa solo alla prossima azione, non al risultato finale.
- **Usa una parola-chiave** come “calma”, “spingi” o “presente” prima di ogni gesto.
- **Fai un reset dopo l’errore:** espira lentamente, rilassa le spalle e riparti con una routine sempre uguale.
- **Prepara una frase realistica:** “Non devo sentirmi sicuro per agire bene; devo eseguire il prossimo compito.”

In quale momento della gara perdi più fiducia: prima di iniziare, dopo un errore o quando la pressione aumenta?

Candidate:

Capita spesso: in gara la fiducia non si perde tutta insieme, di solito cala dopo un errore, un confronto o una sensazione di pressione. In quel momento evita di cercare subito “fiducia” e torna a un’azione controllabile: **respiro, parola chiave, prossimo gesto**.

Quando senti che la fiducia crolla, qual è il momento più preciso: **prima di iniziare, dopo un errore o quando gli altri sembrano andare meglio?**

### conversation-gradual-specialization:1:sample-1

Verdicts: baseline, baseline

Reasons: Both responses use the context well (two consecutive errors in the final) and provide relevant advice. However, Response A jumps straight into a full protocol without asking any further diagnostic question - it assumes it knows enough to prescribe a complete routine. Response B also provides advice but ends with a follow-up question that attempts to understand what specifically the athlete struggles with after errors (technical, tactical, or attentional). This question has moderate diagnostic value - it could shape subsequent advice. Neither response does extensive discovery before advising, but B at least maintains the conversational thread and progression by inviting further specificity. Both are somewhat formulaic with bullet-point lists, reducing naturalness slightly. B edges ahead on multi-turn progression and question quality. | Entrambe usano bene il dettaglio emerso: due errori consecutivi nel finale, e propongono un reset breve e controllabile. A è solida, concreta e include anche un buon suggerimento di allenamento in situazione, ma chiude la conversazione senza approfondire quale sia il compito successivo più critico. B è leggermente migliore perché, oltre al reset e alla riduzione del compito, pone una domanda diagnostica utile: capire se il blocco riguarda gesto tecnico, decisione tattica o concentrazione cambierebbe il consiglio successivo. La domanda non è puramente rituale e sostiene meglio la progressione graduale.

Baseline:

Capisco: due errori di fila, soprattutto nel finale, possono farti entrare in una spirale di dubbio proprio quando serve lucidità.

- **Dopo il secondo errore:** espira lentamente, guarda un punto preciso e pronuncia mentalmente: *“Reset. Prossima azione.”*
- **Riduci il compito:** scegli un solo obiettivo tecnico per l’azione successiva, non “devo recuperare”.
- **Nel finale:** usa una routine breve sempre uguale: respiro → parola chiave → visualizzazione del gesto → esecuzione.
- **Accetta il rischio controllato:** cerca la giocata semplice e corretta, non quella che cancella subito gli errori precedenti.

Qual è la tua prossima azione più importante dopo due errori: una giocata tecnica, una decisione tattica o mantenere la concentrazione?

Candidate:

Dopo due errori consecutivi, il problema diventa spesso il pensiero: **“non devo sbagliare ancora”**. Questo aumenta la tensione e ti porta a giocare in difesa, proprio nel finale.

Usa una routine breve:

1. **Segnale di chiusura:** espira lentamente e rilassa mani/spalle.  
2. **Parola chiave:** “Prossima azione” oppure “Semplice e deciso”.  
3. **Obiettivo concreto:** scegli solo il prossimo gesto, non il risultato.  
4. **Esecuzione:** fai la scelta che avresti fatto prima degli errori, senza compensare.

Allenala anche in pratica: crea situazioni di finale con due errori consecutivi e prova a eseguire questa routine. La fiducia non deve tornare prima di agire: spesso ritorna **dopo una buona azione controllata**.

### conversation-discovery-age:0:sample-2

Verdicts: candidate, candidate

Reasons: La risposta A segue correttamente il principio di discovery before advice: non fornisce alcun programma senza prima raccogliere informazioni essenziali (sport, frequenza, infortuni). La domanda è diagnostica perché cambia radicalmente il consiglio successivo. La risposta B, invece, fornisce un intero programma di allenamento dettagliato PRIMA di conoscere età, sport, livello ed eventuali limitazioni dell'atleta. Questo è esattamente il comportamento che la rubrica penalizza: dare consigli senza scoperta. La domanda finale di B è quasi rituale, dato che il programma è già stato consegnato. In un contesto di coaching sportivo, prescrivere un allenamento 'molto intenso' senza conoscere età e livello è potenzialmente pericoloso e contrario alla buona pratica. | A rispetta meglio lo scenario: prima di prescrivere un carico intenso chiede dati che cambiano davvero il consiglio, soprattutto sport, frequenza attuale e limitazioni. Manca però l’età e non chiede esplicitamente esperienza/livello, quindi non raggiunge il massimo. B è più completa come contenuto, ma anticipa un allenamento intenso generico senza conoscere età, livello o carico attuale; le domande arrivano solo dopo il consiglio, quindi la scoperta non guida la prescrizione.

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

Posso preparartelo, ma per renderlo **intenso senza essere inutilmente rischioso** mi servono due dati: **che sport pratichi** e **quante volte ti alleni già a settimana**?  
Se puoi, aggiungi anche eventuali infortuni o limitazioni.

### conversation-discovery-age:1:sample-2

Verdicts: candidate, candidate

Reasons: Response B correctly integrates the new context (age 15, 1 year experience, 2 sessions/week) to calibrate expectations and explicitly withholds a detailed program until the missing critical information (sport) is provided. This demonstrates proper discovery-before-advice behavior. Response A, despite receiving the age/experience info, immediately provides another detailed generic workout plan without knowing the sport—repeating the same pattern from the first turn where it gave advice prematurely. Response B's approach is more aligned with the anchor forte (gradual increase without extreme load) while maintaining appropriate restraint. Response A does eventually ask about the sport, but only after delivering a full program, which undermines the diagnostic value of the question. | B è preferibile perché riconosce i dati nuovi — 15 anni, un anno di pratica, due allenamenti settimanali — e identifica correttamente l’informazione mancante che cambia davvero il programma: lo sport praticato. Evita di prescrivere un carico generico prima di avere il dato diagnostico essenziale. A usa bene il contesto e riduce l’intensità rispetto alla richiesta iniziale, ma fornisce comunque una sessione abbastanza specifica prima di sapere la disciplina, quindi fa meno bene la scoperta prima del consiglio.

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
A 15 anni, dopo un solo anno di pratica e con due allenamenti settimanali, è meglio puntare su un lavoro **progressivo e ben recuperato**, non su un carico massimo improvviso. Con lo sport posso prepararti una sessione intensa ma adatta al tuo livello.

### conversation-discovery-food:0:sample-2

Verdicts: candidate, candidate

Reasons: La risposta A fornisce un intero menu settimanale generico senza prima raccogliere informazioni essenziali (sport, obiettivo, orari, preferenze alimentari, allergie). La domanda finale ('Che sport pratichi?') arriva troppo tardi, dopo aver già dato un consiglio dettagliato che potrebbe essere completamente inadatto. Questo viola il principio fondamentale della scoperta prima del consiglio. La risposta B invece si ferma correttamente a chiarire prima cosa l'atleta intende (menu alimentare vs programma di allenamento) e poi chiede informazioni diagnostiche cruciali (sport, frequenza allenamenti, obiettivo). Queste domande cambiano radicalmente il consiglio che verrà dato, quindi sono domande ad alto valore diagnostico, non rituali. B è naturale, concisa e segue una progressione logica corretta. | B è nettamente migliore per questo scenario di discovery: prima chiarisce l'ambiguità tra menu alimentare e programma di allenamento, poi chiede variabili che cambiano davvero il consiglio. A produce subito un menu generico senza preferenze, obiettivo, orari, sport o carico di allenamento; la domanda finale è utile ma arriva dopo il consiglio, quindi non guida realmente la personalizzazione iniziale.

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

Certo. Intendi un **menu alimentare settimanale** per sostenere gli allenamenti oppure un **programma di allenamento settimanale**?

Se parli di alimentazione, indicami anche sport, numero di allenamenti e obiettivo principale: energia, dimagrimento, aumento massa o mantenimento.

### conversation-discovery-food:1:sample-2

Verdicts: baseline, candidate

Reasons: Both responses provide a full vegetarian menu adapted to the 19:00 training time, which is premature given that key information (sport, objective, latto-ovo vs vegan) is still missing. However, both do ask follow-up questions. Response B is slightly better because: (1) it integrates the context more naturally with practical timing guidance (16:30-17:30 pre-workout, 20:30 post-workout) that directly addresses the 19:00 constraint, (2) its follow-up question about latto-ovo vs vegan is more immediately actionable and would change the menu significantly, (3) it's slightly more concise and structured. Response A asks about sport and objective which is also valuable but was already partially asked in the previous turn. Both share the weakness of giving extensive advice before completing discovery - neither truly holds back the full menu pending more information. Response B's closing question is more targeted to the immediate dietary constraint, while A's question bundles multiple things together. Neither is dramatically better than the other, but B edges ahead on context use and conversational flow. | Entrambe usano bene i nuovi vincoli e propongono una struttura sensata per allenamento alle 19, con pre-allenamento digeribile e cena di recupero. A è leggermente superiore perché esplicita subito l’assunzione su uova e latticini e soprattutto chiude con una domanda più diagnostica: sport e obiettivo cambierebbero davvero composizione, quantità e timing del menu. B è naturale e pratica, ma la domanda finale su vegetariana/vegana arriva dopo aver già inserito molti alimenti non vegani ed è meno ad alto valore rispetto a sport, durata e obiettivo.

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

Ecco un **menu vegetariano settimanale generale**, pensato per allenarti alle **19:00**. Presuppongo che tu consumi uova e latticini; se sei vegana, posso modificarlo.

### Orari indicativi
- **Colazione:** 7:00–9:00  
- **Pranzo:** 12:30–14:00  
- **Spuntino pre-allenamento:** 17:15–18:00  
- **Cena post-allenamento:** entro 60–90 minuti dalla fine  

| Giorno | Colazione | Pranzo | Pre-allenamento | Cena post-allenamento |
|---|---|---|---|---|
| **Lunedì** | Yogurt greco, fiocchi d’avena, banana e noci | Pasta integrale con ceci e verdure | Banana + 2 gallette con crema di arachidi | Frittata, patate al forno e insalata |
| **Martedì** | Pane integrale, ricotta e miele + frutta | Riso basmati, tofu e verdure | Yogurt o kefir + frutta | Piadina integrale con hummus, mozzarella e verdure |
| **Mercoledì** | Porridge con latte, cacao e frutti di bosco | Farro con lenticchie, pomodorini e feta | Pane tostato con marmellata | Pasta al pomodoro, parmigiano e contorno di verdure |
| **Giovedì** | Yogurt, muesli e frutta secca | Cous cous con ceci, verdure e yogurt | Frutto + una manciata di cereali semplici | Uova strapazzate, pane integrale e verdure |
| **Venerdì** | Toast integrale con uovo e frutta | Pasta con pesto, fagioli cannellini e verdure | Banana o pane con miele | Burger vegetale, riso o patate e insalata |
| **Sabato** | Pancake d’avena con yogurt e frutta | Insalata di quinoa, edamame, mais e avocado | Yogurt da bere + frutta | Lasagne vegetariane o pasta al forno con legumi |
| **Domenica** | Pane integrale, crema di nocciole 100% e latte | Risotto con piselli + legumi o formaggio | Frutta e 2–3 gallette | Tofu o tempeh, cous cous e verdure |

### Indicazioni utili
- A ogni pasto principale inserisci **una fonte proteica**: legumi, tofu, tempeh, uova, yogurt greco, fiocchi di latte o formaggi.
- Prima dell’allenamento scegli soprattutto **carboidrati facili da digerire** e limita pasti molto grassi o abbondanti.
- Dopo l’allenamento combina **carboidrati + proteine**, per esempio pasta e legumi, riso e tofu, oppure uova e patate.
- Bevi regolarmente durante la giornata; porta acqua all’allenamento.

Per rendere il menu davvero adatto a te, il dato più importante è: **qual è il tuo sport e il tuo obiettivo — dimagrimento, mantenimento, aumento della massa o semplice energia?**

### conversation-discovery-home:0:sample-2

Verdicts: candidate, candidate

Reasons: La risposta A fornisce immediatamente una scheda generica senza alcuna fase di scoperta. Non chiede obiettivi, attrezzatura, livello, limitazioni fisiche o disponibilità di tempo. La domanda finale ('Vuoi una scheda specifica per forza, dimagrimento, calcio...?') arriva dopo aver già dato il consiglio, il che ne riduce il valore diagnostico. La risposta B invece si ferma prima di dare consigli e pone domande diagnostiche ad alto valore (obiettivo, frequenza, attrezzi, livello, limitazioni) che cambierebbero sostanzialmente la scheda risultante. B è più allineata con l'anchor forte e con la rubrica che premia la scoperta prima del consiglio. L'unica debolezza di B è che presenta le domande in formato lista un po' strutturato, ma rimane naturale e concisa. | B è più adatta alla fase discovery: prima di costruire una scheda raccoglie informazioni che cambiano davvero il programma, come obiettivo, tempo disponibile, attrezzatura, livello e limitazioni. A è naturale e propone una scheda praticabile a corpo libero, ma anticipa troppo il consiglio senza sapere attrezzatura, frequenza, livello o eventuali problemi fisici; la domanda finale è utile ma parziale e arriva dopo una prescrizione già definita.

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

- qual è il tuo obiettivo (forza, massa, dimagrimento, preparazione sportiva o mobilità);
- quante volte a settimana e quanto tempo hai;
- quali attrezzi possiedi;
- il tuo livello e se hai dolori o limitazioni fisiche.

### conversation-discovery-home:1:sample-2

Verdicts: candidate, candidate

Reasons: Response B correctly continues the discovery process. The user answered only 2 of the 4 questions asked (frequency and equipment), leaving objective and level/limitations unanswered. B acknowledges the context provided (elastics, 3 days) and asks the most important remaining diagnostic question (objective), which would fundamentally change the program design. Response A jumps straight into a full detailed program without knowing the user's objective, level, or any physical limitations - this is premature advice-giving. While A does use the context (elastics, 3 days) well in the program design and asks a follow-up question at the end about elastic type, it delivers a complete program before understanding what the user actually needs. The anchor forte validates B's approach of acknowledging context and proposing a structure. B is more natural, progressive, and demonstrates proper coaching methodology. | B è preferibile perché, dopo che l’utente ha fornito solo attrezzi e frequenza, identifica la variabile più diagnostica ancora mancante: l’obiettivo. Questo cambia davvero struttura, volume e scelta degli esercizi. A usa bene il contesto di elastici e tre giorni, ma salta troppo presto a una scheda completa senza sapere obiettivo, livello o limitazioni; la domanda finale sul tipo di elastici è utile, ma arriva dopo il consiglio e non è la priorità principale.

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

Perfetto: elastici e **3 giorni a settimana** sono sufficienti. Qual è il tuo obiettivo principale: **aumentare forza/massa, dimagrire, migliorare la preparazione sportiva o tonificare**?

### conversation-clarify-ambiguous:0:sample-2

Verdicts: candidate, candidate

Reasons: L'atleta ha inviato un messaggio ambiguo ('Quando parte mi si chiude tutto') che richiede chiarimento prima di qualsiasi intervento. La Risposta A fornisce tre consigli concreti PRIMA di chiedere chiarimento, violando il principio di scoperta prima del consiglio. Anche se poi pone una domanda diagnostica alla fine, il danno è fatto: i consigli dati potrebbero essere completamente inappropriati senza sapere cosa intende l'atleta. La Risposta B invece parafrasa per verificare comprensione e poi pone una domanda diagnostica chiara senza dare consigli prematuri. La domanda di B è leggermente meno precisa dell'anchor forte (che distingue respiro/pensieri/sensazione fisica), ma comunque discrimina tra blocco mentale e sintomi fisici. B rispetta meglio il principio fondamentale: scoperta prima del consiglio. | B è preferibile perché davanti a un messaggio ambiguo fa subito una domanda diagnostica che può cambiare il consiglio, distinguendo blocco mentale e sintomi fisici. A coglie il momento della partenza e pone una buona domanda, ma anticipa tre consigli prima di chiarire cosa significhi “si chiude tutto”, rischiando di intervenire sul problema sbagliato.

Baseline:

Capito: sembra un blocco proprio al momento di iniziare.  

- Prima della partenza, fai un’espirazione lenta di 6–8 secondi.  
- Concentrati solo sul primo gesto tecnico, non su tutta la prestazione.  
- Ripetiti: “Parto piano, poi entro nel ritmo.”  

Quando dici “mi si chiude tutto”, intendi che ti blocchi mentalmente oppure che senti chiusura fisica a petto o gola?

Candidate:

Capisco: appena inizi la prova/gara senti come se la mente si bloccasse e perdessi accesso a tutto quello che sai fare.

Succede soprattutto come **blocco mentale**, oppure senti anche sintomi fisici forti (fiato corto, tremore, nausea, vertigini)?

### conversation-clarify-ambiguous:1:sample-2

Verdicts: candidate, baseline

Reasons: Both responses acknowledge the clarification about breathing and attempt to provide advice while asking a follow-up question. However, Response A is more concise and conversationally natural, with a better balance between brief advice and a diagnostic follow-up question (asking about the specific sensation - throat, chest, or hyperventilation). Response B is overly verbose and prescriptive, providing a long list of instructions (including medication references) before fully understanding the problem. Response B's question at the end (training vs competition, cough/wheezing) is decent but comes after too much unsolicited advice. Neither response fully embodies the 'anchor forte' approach of working specifically on exhalation at the start, but A is closer to it while maintaining better discovery discipline. Both gave advice before fully diagnosing, but B is significantly more guilty of this with its extensive bullet-point protocol. | Entrambe usano bene il chiarimento dell’utente e introducono correttamente una soglia di sicurezza medica. A ha una domanda finale molto pertinente per distinguere gola, petto e iperventilazione, ma resta un po’ meno operativa. B è più completo nella progressione: collega possibili cause, gestione immediata, prevenzione, criteri medici e una domanda diagnostica utile su allenamento/gara e tosse/fischi. È leggermente più verboso e dà molto consiglio prima della diagnosi, ma nel complesso fa avanzare meglio il turno.

Baseline:

Capito: la sensazione di respiro che si “chiude” all’inizio della gara va presa sul serio, perché può dipendere da partenza troppo intensa, ansia o broncocostrizione da sforzo.

- **Se succede:** rallenta o fermati, esci dalla competizione e cerca aria; non forzare il ritmo.  
- **Respira lentamente:** inspira dal naso per 2–3 secondi ed espira a labbra socchiuse per 4–6 secondi.  
- **Prevenzione:** fai un riscaldamento progressivo di 10–15 minuti, evitando uno scatto immediato.  
- **Controllo medico:** se hai sibili, tosse, dolore/oppressione al petto, capogiri o il respiro non migliora rapidamente, interrompi e chiedi assistenza; programma una valutazione medica, soprattutto se si ripete. Usa eventuali farmaci inalatori solo secondo il piano già indicato da un medico.

Succede anche in allenamento o solo nelle gare, e compare con tosse o fischi?

Candidate:

Capito. Se appena parte la gara senti il respiro “chiudersi”, **non forzare e non continuare a tutta**: rallenta o fermati.

Se hai **dolore o forte oppressione al petto, vertigini, svenimento, difficoltà marcata a respirare, sibili** o i sintomi non passano rapidamente, chiedi subito aiuto e fai una valutazione medica.

Se invece è una sensazione breve all’avvio: prova un riscaldamento progressivo, parti più lentamente nei primi minuti e concentrati su un’**espirazione lunga e rilassata**, senza inspirare affannosamente.  
Ti succede con la sensazione di gola chiusa, di petto stretto o semplicemente perché inizi a respirare troppo velocemente?

### conversation-no-ritual-question:0:sample-2

Verdicts: tie, candidate

Reasons: Entrambe le risposte forniscono una frase breve e funzionale da ripetere prima del servizio, simile all'anchor forte. Nessuna delle due fa domande diagnostiche per personalizzare il consiglio (quale sport? quale problema specifico? livello del giocatore?), ma l'utente ha chiesto esplicitamente una frase pronta, quindi la risposta diretta è ragionevole. La risposta B usa 'mi fido del gesto' che è leggermente più sofisticata dal punto di vista psicologico (fiducia nel gesto automatizzato), mentre A usa 'mi concentro' che è più generico. Tuttavia la differenza è minima. Entrambe mancano di qualsiasi tentativo di scoperta o progressione multi-turn. | Entrambe rispondono direttamente alla richiesta di una frase breve senza inserire domande rituali inutili. B è leggermente migliore perché “mi fido del gesto” richiama meglio l’automatismo e la fluidità del servizio, mentre A usa “mi concentro”, più generico e meno specifico per una routine pre-servizio. Nessuna delle due raggiunge pienamente l’anchor forte perché manca un riferimento concreto al bersaglio o al lasciare andare il braccio.

Baseline:

Respiro, mi concentro e servo con decisione.

Candidate:

Respiro, mi fido del gesto e servo con intenzione.

### conversation-no-ritual-question:1:sample-2

Verdicts: tie, baseline

Reasons: Both responses appropriately close the conversation naturally without forcing unnecessary questions or ritualistic follow-ups. The user said 'Perfetta, grazie' indicating satisfaction and closure. Both A and B respond concisely and naturally. B adds 'Gioca con fiducia' which slightly connects to the context of the self-talk phrase (trust/confidence theme from 'mi fido del gesto'), while A adds 'buon servizio' which is a natural well-wish. Neither asks a question, which is appropriate here since the user signaled closure. The anchor forte ('Di nulla') confirms that a brief, natural closure is the correct approach. Both responses are close to the anchor forte with minor additions. The difference is minimal - B's addition is slightly more contextually connected to the coaching content provided earlier. | Entrambe rispondono in modo naturale e senza introdurre domande rituali non necessarie. A è leggermente migliore perché riprende direttamente il contesto specifico del servizio ed è una chiusura pulita. B è comunque adeguata, ma 'Gioca con fiducia' è più generica e aggiunge un piccolo consiglio motivazionale non richiesto.

Baseline:

Di nulla, buon servizio!

Candidate:

Di nulla! Gioca con fiducia.

### conversation-known-thread-fact:0:sample-2

Verdicts: candidate, candidate

Reasons: Entrambe le risposte forniscono consigli prima di aver fatto una vera scoperta diagnostica, il che è un difetto condiviso rispetto all'anchor forte che pone subito una domanda diagnostica mirata. Tuttavia, B è leggermente migliore: la sua domanda finale ('paura di mandare la palla fuori/in rete oppure pressione quando tutti ti guardano?') è più diagnostica e specifica rispetto alla domanda di A ('quale parte della routine vuoi provare per prima: respiro, lancio o bersaglio?'), che è più una domanda di implementazione/preferenza che non cambia il consiglio. B inoltre è meno verbosa e strutturata in modo più naturale, senza elenchi puntati eccessivi. Nessuna delle due raggiunge il livello dell'anchor forte, che pone immediatamente una domanda diagnostica senza dare consigli prematuri. | B è preferibile perché, pur dando consigli prima di esplorare, chiude con una domanda diagnostica rilevante che distingue paura dell'errore da pressione sociale e può orientare il lavoro successivo. A usa bene il contesto della battuta in pallavolo e offre indicazioni pratiche, ma la domanda finale è soprattutto una scelta operativa sulla routine, non una vera scoperta del blocco.

Baseline:

È comprensibile: la battuta può sembrare un momento in cui tutta l’attenzione è su di te, ma si può allenare come una routine.

- **Crea una routine di 5 secondi:** espira lentamente, guarda il punto scelto, fai rimbalzare la palla sempre lo stesso numero di volte.
- **Pensa a un solo obiettivo tecnico**, ad esempio: “lancio davanti alla spalla”, non “non devo sbagliare”.
- **Scegli una zona ampia e sicura** del campo: prima cerca continuità, poi precisione.
- **Allenati con pressione graduale:** 10 battute da solo, poi con un compagno che osserva, infine simulando il punteggio reale. Dopo ogni errore ripeti la routine senza commentarti negativamente.

Alla prossima partita, quale parte della routine vuoi provare per prima: respiro, lancio o bersaglio?

Candidate:

È un blocco molto comune: spesso non manca la tecnica, ma l’attenzione si sposta dal gesto alla paura di sbagliare. In battuta prova a concentrarti su **un solo obiettivo controllabile**, per esempio: “lancio alto e davanti alla spalla”, invece di “non devo sbagliare”.

Prima di servire:
1. espira lentamente;
2. guarda il punto scelto;
3. ripeti una parola chiave, come **“fluida”**;
4. esegui senza modificare il gesto all’ultimo momento.

Il blocco ti arriva soprattutto per **paura di mandare la palla fuori/in rete**, oppure perché senti pressione quando tutti ti guardano?

### conversation-known-thread-fact:1:sample-2

Verdicts: baseline, candidate

Reasons: Both responses provide structured weekly plans that build on the previous context (volleyball, serving block, routine). However, Response B is superior in several ways: (1) It ends with a diagnostic question ('quale battuta esegui: dal basso, flottante o in salto?') that would genuinely change the advice—different serve types require different technical cues and routines. This is a high-value question, not a ritual one. (2) It includes a self-monitoring tool (tension level 1-10, what helped) that adds coaching depth. (3) The day-by-day structure is more progressive and concrete, with clear escalation of pressure. Response A is solid but ends without any question, missing an opportunity for discovery. It also feels slightly more formulaic with the section headers. Neither response asks a discovery question before giving advice (both jump straight into plans), but B at least asks one at the end that would meaningfully shape future guidance. | A è preferibile perché usa molto bene il contesto già emerso: blocco in battuta, routine breve, parola chiave, bersaglio e soprattutto misurazione dell’esecuzione della routine invece del solo esito. Progredisce in modo coerente dal turno precedente e dà un piano settimanale pratico senza introdurre troppe variabili. B è valida e più strutturata giorno per giorno, con una domanda finale potenzialmente utile sul tipo di battuta, ma la fa dopo aver già dato il piano e introduce elementi meno centrati sul blocco mentale, come una giornata tecnica e una simulazione 23-23 forse un po’ precoce.

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

Questa settimana lavora soprattutto sulla **routine e sulla fiducia**, non sul perfezionare tutto il gesto.

### Piano semplice

**Ogni giorno — 5 minuti**
- 5 respiri lenti, con espirazione più lunga dell’inspirazione.
- Visualizza 5 battute riuscite, concentrandoti sul gesto fluido.
- Ripeti sempre la stessa routine:  
  **posizione → 1-2 palleggi della palla → sguardo al bersaglio → espira → battuta**.
- Usa una sola parola chiave: **“fluida”**, **“alta”** o **“decisa”**.

**Primo allenamento**
- Fai 10 battute verso una zona ampia e sicura.
- Conta come successo solo il rispetto della routine, non il risultato.
- Poi prova 10 battute mirando a una zona precisa.

**Secondo allenamento**
- Crea pressione gradualmente: ad esempio, devi realizzare 3 battute valide su 5.
- Se sbagli, non ricominciare da capo e non punirti: fai un respiro, ripeti la routine e continua.

**Prima della partita**
Scegli in anticipo:
- una zona bersaglio;
- una parola chiave;
- una routine di massimo 5 secondi.

Durante la partita, pensa solo a **eseguire la routine**, non a evitare l’errore. Dopo ogni battuta valuta soltanto: “Ho seguito la mia routine, sì o no?”. Annotalo per una settimana.

### conversation-identity-correction:0:sample-2

Verdicts: tie, baseline

Reasons: Both responses correctly acknowledge the identity switch to Marta, avoid giving unsolicited advice, and ask an open-ended discovery question. Response A says 'Ti ascolto: su cosa vuoi lavorare oggi?' which is slightly more coaching-oriented (framing it as 'working on something'). Response B says 'Di cosa hai bisogno?' which is slightly more service-oriented but equally valid. Both are concise, natural, and appropriately avoid ritualistic formulas. Neither provides premature advice. The differences are minimal and neither clearly outperforms the other across the rubric dimensions. | Entrambe evitano consigli prematuri e fanno una domanda utile per avviare il coaching. A è leggermente più naturale e la domanda è più orientata al lavoro di coaching, ma B usa meglio il contesto dell'identity correction perché esplicita che oggi parlerà con Marta e non con Paolo. In questo scenario la correzione d'identità è il punto centrale, quindi B è preferibile.

Baseline:

Ciao Marta, ricevuto: oggi parlerò con te, non con Paolo. Di cosa hai bisogno?

Candidate:

Va bene, Marta. Ti ascolto: su cosa vuoi lavorare oggi?

### conversation-identity-correction:1:sample-2

Verdicts: candidate, candidate

Reasons: Entrambe le risposte commettono lo stesso errore fondamentale: danno consigli dettagliati prima di fare una domanda diagnostica, violando il principio 'scoperta prima del consiglio'. Tuttavia, B è leggermente migliore per diversi motivi: (1) La domanda finale di B è più ricca e diagnostica - include 'quando temi il giudizio dell'allenatore e delle compagne', che apre una dimensione psicologica importante e non ovvia, mentre A si limita a elencare gesti tecnici (tiro, passaggio, palleggio). (2) B offre un framing iniziale più utile ('l'obiettivo non è eliminarla, ma giocare anche quando c'è') che è un principio di coaching valido. (3) B è leggermente più naturale nel tono, meno formulaica. Entrambe usano il nome Marta e il contesto basket, ma nessuna delle due si avvicina all'anchor forte che pone la domanda diagnostica PRIMA di qualsiasi consiglio. | B è preferibile perché, pur dando consigli prima di esplorare, formula una domanda diagnostica più utile: distingue tra tiro, perdita di palla e timore del giudizio, elementi che porterebbero a interventi diversi. A usa bene il nome Marta e offre routine sensate, ma la domanda finale è più generica e meno trasformativa, con categorie parzialmente sovrapposte.

Baseline:

Capisco, Marta: la paura di sbagliare può bloccarti proprio quando vuoi dare il meglio.

- **Prima dell’azione:** fai un respiro lento e pensa a una sola parola-chiave, come “attacca” o “presente”.
- **Cambia obiettivo:** non “non devo sbagliare”, ma “faccio la scelta giusta e aggressiva”.
- **Dopo un errore:** usa una routine di 3 secondi: riconosci (“errore”), resetta con un respiro, poi concentrati sulla prossima azione.
- **Allenati alla pressione:** durante gli allenamenti chiedi situazioni simulate di partita e valuta l’impegno, non solo il risultato.

In quale situazione senti più paura: tiro, passaggio, palleggio o partita?

Candidate:

La paura di sbagliare è comune: l’obiettivo non è eliminarla, ma giocare anche quando c’è.

Prova questa routine durante la partita:

1. **Prima dell’azione:** un respiro lento.
2. **Parola chiave:** “prossima azione”.
3. **Obiettivo concreto:** difendere forte, muovere la palla, tagliare o prendere il tiro giusto.
4. **Dopo l’errore:** niente giudizi; chiediti solo: “Qual è la mia prossima cosa utile?”

Un errore non definisce la tua partita: spesso il vero problema è l’azione successiva, quando inizi a giocare con cautela.

In quale situazione senti più paura: **quando tiri, quando perdi la palla o quando temi il giudizio dell’allenatore e delle compagne**?

### conversation-cross-chat-transparency:0:sample-2

Verdicts: baseline, baseline

Reasons: Both responses correctly identify that they cannot access the other chat and ask the user to provide context. However, Response A is slightly better because it specifies what information it needs (obiettivo, allenamento previsto, stato fisico), which is a more diagnostic and targeted request that would actually change the coaching advice given. Response B's request is more generic ('riassumimi cosa avevamo stabilito'). Response A also avoids the slightly inconsistent 'avevamo stabilito' phrasing that B uses (implying shared memory while simultaneously saying it can't see the chat). Both are concise and natural, but A's specificity in what to share makes it a higher-quality discovery question. | Entrambe gestiscono bene la trasparenza cross-chat senza fingere di ricordare. A è leggermente superiore perché chiede informazioni diagnostiche specifiche — obiettivo, allenamento previsto e stato fisico — che possono cambiare davvero il consiglio per oggi. B è molto naturale e diretta, ma resta più generica: chiedere l’ultimo piano o cosa era stato stabilito è utile, però raccoglie meno dati immediatamente rilevanti per adattare la seduta odierna.

Baseline:

Non posso vedere il contenuto dell’altra chat, quindi mi manca il contesto per dirti cosa fare oggi.

Incolla qui l’ultimo messaggio o riassumi obiettivo, allenamento previsto e stato fisico: ti preparo subito un piano concreto per oggi.

Candidate:

Non posso vedere l’altra chat da questa conversazione. Incollami l’ultimo piano o riassumimi cosa avevamo stabilito, e ti dico subito cosa fare oggi.

### conversation-cross-chat-transparency:1:sample-2

Verdicts: candidate, candidate

Reasons: Entrambe le risposte saltano alla fase di consiglio senza fare domande diagnostiche sufficienti prima. L'utente ha detto solo 'ansia prima della gara di domenica' — non sappiamo che sport pratica, che tipo di ansia (somatica, cognitiva), quanto è intensa, cosa ha già provato, né cosa era stato discusso nell'altra chat. Entrambe danno consigli generici. Tuttavia B è leggermente migliore per diversi motivi: (1) La domanda finale di B ('Oggi avevi allenamento, riposo o una gara/test?') è più diagnostica e aperta — chiede informazioni concrete che cambiano il consiglio. La domanda di A ('vuoi che ti costruisca una routine precisa...') è più una proposta di servizio che una vera domanda esplorativa. (2) B è più concisa e meno verbosa, evitando formule come 'l'obiettivo non è eliminare l'ansia ma renderla gestibile' che suonano un po' rituali. (3) B è leggermente più naturale nel tono. Nessuna delle due eccelle nella scoperta prima del consiglio — entrambe danno 4 punti di azione prima di chiedere qualcosa — ma B almeno chiude con una domanda che potrebbe effettivamente modificare il piano. | B è preferibile perché usa bene il contesto dell’ansia pre-gara e chiude con una domanda diagnostica davvero utile: sapere se oggi è allenamento, riposo o test cambia il consiglio operativo. A offre indicazioni sensate, ma assume che oggi ci sia allenamento e la domanda finale è meno diagnostica, più orientata a continuare la chat che a correggere subito il piano.

Baseline:

Capito: oggi l’obiettivo non è eliminare l’ansia, ma renderla gestibile e trasformarla in preparazione concreta per domenica.

- **Fai un allenamento normale o leggermente ridotto**, senza testarti né cercare conferme sulla forma.
- **Scrivi per 5 minuti**: “Cosa temo?” e accanto “Cosa posso controllare oggi?”. Scegli solo 1–2 azioni controllabili.
- **Prova una routine pre-gara breve**: 5 respiri lenti, una frase-guida come *“Mi concentro sul prossimo gesto”*, poi visualizza i primi minuti della gara.
- **Stasera prepara il necessario** e stabilisci un orario realistico per dormire: meno decisioni domenica significa meno spazio all’ansia.

Oggi hai allenamento: vuoi che ti costruisca una routine precisa per prima, durante e dopo?

Candidate:

Capito. Per oggi, senza stravolgere la preparazione:

- fai l’allenamento previsto, senza “recuperare” o testarti oltre il necessario;
- dedica 10 minuti a scrivere **cosa puoi controllare** domenica: ritmo, respirazione, routine e atteggiamento;
- prova una breve visualizzazione: immagina l’ansia pre-gara, poi nota il respiro e parti comunque con il primo compito semplice;
- stasera evita di analizzare continuamente la gara: prepara il necessario e chiudi la giornata normalmente.

Oggi avevi allenamento, riposo o una gara/test?

### conversation-progress-beyond-routine:0:sample-2

Verdicts: candidate, candidate

Reasons: L'atleta dice che la routine non funziona. L'anchor forte mostra che la risposta ideale è una domanda diagnostica senza consiglio prematuro. La Risposta A fornisce quattro consigli dettagliati prima di porre la domanda diagnostica alla fine — questo è esattamente il pattern da evitare (consiglio prima della scoperta). La domanda finale è buona ma arriva dopo un muro di suggerimenti non richiesti che ignorano il bisogno di capire prima dove si inceppa la routine. La Risposta B invece normalizza brevemente la situazione, poi pone subito una domanda diagnostica mirata che aiuterà a capire il momento preciso del fallimento. Non dà consigli prematuri, rispetta il principio di scoperta prima del consiglio, ed è naturale e concisa. La qualità della domanda è simile in entrambe (entrambe chiedono il momento preciso), ma B la pone senza prima sommergere l'atleta di indicazioni generiche. | B è preferibile perché riconosce che la routine già provata non funziona e non propone subito un'altra soluzione. Fa una domanda diagnostica concreta che può cambiare il consiglio successivo, distinguendo tra blocco prima dell'azione, ipercontrollo durante il gesto o calo di fiducia dopo l'errore. A contiene una buona domanda finale, ma la precede con diversi consigli immediati, quindi salta la fase di scoperta richiesta dallo scenario.

Baseline:

Capisco: è frustrante quando una routine dovrebbe aiutarti ma finisce per aggiungere pressione.

- **Non cercare di eliminare la paura**: prima della prestazione dì “Posso avere paura e fare comunque la mia azione”.
- **Riduci la routine a 3 secondi**: espira lentamente, guarda un punto preciso, ripeti una sola parola-chiave come *“aggressivo”* o *“fluido”*.
- **Sposta l’obiettivo dal risultato all’azione**: invece di “non sbagliare”, scegli un comportamento controllabile: “attacco il pallone”, “comunico”, “seguo il gesto”.
- **Dopo l’errore, niente analisi immediata**: usa una frase breve — *“finito, prossimo compito”* — e rientra nell’azione successiva.

In quale momento preciso la routine smette di funzionare: **prima dell’azione, durante il gesto o subito dopo un errore**?

Candidate:

Capito. Se una routine non funziona, non significa che tu non sia capace: probabilmente non sta intervenendo sul momento giusto o sul vero meccanismo della paura.

Quando la paura compare, cosa succede esattamente: **ti blocchi prima dell’azione, pensi troppo durante il gesto, oppure dopo un errore perdi subito fiducia?**

### conversation-progress-beyond-routine:1:sample-2

Verdicts: candidate, baseline

Reasons: Both responses correctly identify the core issue (fear of being substituted rather than the error itself), aligning with the anchor forte. However, Response A demonstrates better coaching practice: it provides a lighter, more proportionate amount of advice before asking a crucial diagnostic question ('il coach ti ha mai detto chiaramente che ti toglierà dopo un errore, oppure è una paura che nasce dentro di te?'). This question is genuinely diagnostic—it changes the direction of coaching depending on the answer. Response B, while also identifying the issue, immediately delivers a 4-bullet prescriptive list before asking a less impactful question about what the coach wants to see. B's question assumes the athlete hasn't spoken to the coach yet (which is reasonable but less diagnostic). B also falls into the pattern of verbose bullet-point formatting that feels formulaic rather than conversational. Response A feels more like a natural coaching conversation that builds on the previous turn, while B reads more like a template. Both use context well, but A's progression feels more organic and its discovery-before-advice ratio is better. | Entrambe colgono che il nodo è la paura della sostituzione più che la routine. A ha una domanda diagnostica più forte, perché distingue tra minaccia reale comunicata dal coach e previsione interna. B però progredisce meglio sul piano pratico: collega il problema al comportamento visibile dopo l’errore, propone una risposta controllabile nell’azione successiva e include il chiarimento delle aspettative col coach, cioè il passaggio più utile per uscire dalle supposizioni. La domanda finale di B è meno diagnostica di quella di A, ma orienta comunque verso il possesso successivo e rende il consiglio più applicabile.

Baseline:

Capisco: il problema non è solo l’errore, ma la paura immediata delle conseguenze e di perdere il posto.

- **Separa fatto e previsione**: dopo l’errore, chiediti: “Il coach mi ha davvero detto che mi toglierà, oppure lo sto immaginando?”. Non discutere con il pensiero: riconoscilo come una previsione.
- **Usa una risposta breve**: *“Un errore non decide il mio cambio. Ora mostro la prossima azione.”*
- **Dai al coach un segnale visibile**: dopo l’errore comunica, rientra subito in posizione e fai un’azione semplice e corretta. Mostri reazione, non perfezione.
- **Parlane fuori dalla gara**: chiedigli con calma: “Dopo un errore, quale comportamento vuoi vedere da me? In quali situazioni mi sostituisci?”. Avere criteri reali riduce le supposizioni.

Qual è la cosa più probabile che il coach voglia vedere da te subito dopo un errore: **comunicazione, impegno difensivo o una giocata semplice**?

Candidate:

Allora il problema non è solo l’errore: è la conseguenza che immagini subito dopo — **“se sbaglio, il coach mi toglie”**. In quel momento la routine rischia di sembrare inutile perché stai cercando di calmarti mentre il cervello interpreta l’errore come una minaccia.

Prova a sostituire la routine con una risposta molto concreta:

1. **Errore:** “È successo.”
2. **Conseguenza reale:** “Un errore non decide da solo se gioco o no.”
3. **Azione:** una parola tecnica semplice, poi esegui l’azione successiva.

Non cercare di convincerti che “non succederà nulla”: usa una frase credibile, come **“Posso sbagliare e restare utile alla squadra.”**

Una cosa importante: il coach ti ha mai detto chiaramente che ti toglierà dopo un errore, oppure è una paura che nasce dentro di te?

### conversation-gradual-specialization:0:sample-2

Verdicts: candidate, tie

Reasons: Both responses give advice before fully exploring the issue, which goes against the principle of discovery before advice. However, Response A is slightly better structured: it frames the advice more concisely (4 steps vs 4 bullet points that are more verbose), and its closing question is slightly more nuanced ('prima della gara, dopo un errore, oppure quando senti la pressione del risultato') which adds a third dimension (pressure of result) compared to B's question which is similar but slightly less differentiated. Response A also has a slightly more natural conversational flow - the opening acknowledgment is brief and the transition to the question feels more organic. Both fail the 'discovery before advice' criterion significantly since they provide full action plans before asking any diagnostic question, but A is marginally better in question quality and naturalness. | Entrambe le risposte sono competenti e pertinenti al contesto gara/fiducia, ma partono con un blocco di consigli prima di fare scoperta. La domanda finale è diagnostica e utile, perché distingue momenti diversi in cui la fiducia cala e potrebbe orientare il coaching successivo; tuttavia arriva dopo una routine già prescritta, quindi non segue pienamente la progressione graduale richiesta. Nessuna delle due raggiunge l’anchor forte, che avrebbe chiesto subito un segnale concreto prima di proporre interventi.

Baseline:

È comune: in gara la fiducia può oscillare, ma puoi allenare il modo in cui reagisci.

- **Scegli una parola chiave**: “aggressivo”, “calmo” o “presente”, da ripetere dopo ogni errore.
- **Riduci l’attenzione all’azione successiva**: chiediti “Qual è il prossimo gesto concreto?” invece di valutare la prestazione.
- **Usa una routine di reset di 5 secondi**: espira lentamente, rilassa le spalle, guarda un punto preciso e riparti.
- **Prepara una frase realistica**: “Non devo sentirmi sicuro per agire bene; devo eseguire il prossimo compito.”

In quale momento perdi più fiducia: dopo un errore, quando vai sotto nel punteggio o prima di iniziare?

Candidate:

Capita spesso: in gara la fiducia non deve essere una sensazione perfetta, ma la decisione di eseguire anche quando compare il dubbio.

Prova questa routine breve:
1. **Riconosci:** “Sto dubitando, non significa che sto andando male.”
2. **Reset fisico:** espira lentamente, rilassa spalle e mani.
3. **Un solo compito:** scegli una parola tecnica concreta, ad esempio “aggressivo”, “fluido” o “guarda avanti”.
4. **Azione immediata:** concentrati soltanto sulla prossima esecuzione, non sul risultato.

Per capire dove intervenire: **perdi fiducia soprattutto prima della gara, dopo un errore, oppure quando senti la pressione del risultato?**

### conversation-gradual-specialization:1:sample-2

Verdicts: candidate, candidate

Reasons: Both responses use the context well (two consecutive errors in the final) and provide similar tactical advice (reset routine, simplest action, practice under pressure). However, Response B is superior in several ways: (1) It opens with a diagnostic insight ('spirale di recupero') that names the likely mechanism, showing deeper understanding. (2) Its closing question is significantly more diagnostic—asking whether the reaction is 'fretta/aggressività' or 'paura di sbagliare ancora' would genuinely change the next intervention. Response A's question ('Qual è una frase breve...') is more of a coaching exercise than a discovery question—it doesn't reveal new information about the athlete's pattern. (3) Response B's structure feels slightly more natural and progressive, building from acknowledgment to action to further exploration. Both are good but B's question quality and contextual insight give it the edge. | B è preferibile perché usa bene il dettaglio nuovo: due errori consecutivi nel finale, collega il problema a un meccanismo specifico e propone un protocollo coerente. Soprattutto, la domanda finale è diagnostica: distinguere tra fretta/aggressività e paura di sbagliare ancora cambierebbe concretamente il consiglio successivo. A è utile e contestualizzata, ma la domanda sulla frase-comando è più esecutiva che diagnostica e apre meno spazio a una specializzazione ulteriore.

Baseline:

Capisco: due errori consecutivi nel finale possono trasformarsi rapidamente in paura del terzo.

- **Dopo il secondo errore, attiva una routine fissa**: espira, abbassa le spalle, guarda un punto e dì mentalmente: *“Reset. Una giocata.”*
- **Non cercare di recuperare subito**: scegli l’opzione più semplice e ad alta percentuale nella giocata successiva.
- **Usa un solo obiettivo tecnico**: ad esempio “gambe attive”, “occhi sulla palla” o “gesto completo”. Non correggere tutto insieme.
- **Allenalo sotto pressione**: in allenamento crea situazioni di finale e imponiti la routine dopo due errori consecutivi.

Qual è una frase breve e concreta che potresti usare come comando dopo il secondo errore?

Candidate:

Dopo due errori consecutivi entri probabilmente in una **spirale di recupero**: pensi a compensare subito, aumenti la tensione e perdi il gesto.

Nel finale usa un protocollo sempre uguale:

- **Accetta:** “Due errori sono già successi.”
- **Reset:** un’espirazione lunga e rilassa mani/spalle.
- **Parola chiave:** “Prossima azione.”
- **Obiettivo minimo:** esegui la scelta più semplice e solida, senza cercare di recuperare tutto in un’azione.

Allenalo anche in pratica: crea situazioni di finale con due errori simulati e misura solo se riesci a eseguire bene **l’azione successiva**, non il risultato.

La tua reazione dopo il secondo errore è più spesso **fretta/aggressività** oppure **paura di sbagliare ancora**?

### conversation-discovery-age:0:sample-3

Verdicts: candidate, candidate

Reasons: L'atleta non ha fornito età, livello, sport, né frequenza di allenamento. Risposta A fornisce un programma completo e dettagliato PRIMA di avere queste informazioni critiche, violando il principio fondamentale della scoperta prima del consiglio. Pur ponendo domande alla fine, il danno è fatto: il consiglio è già stato dato senza contesto. Risposta B invece si astiene correttamente dal dare un programma, ponendo domande diagnostiche essenziali (sport e frequenza attuale) prima di procedere. La domanda di B è concisa, diretta e ad alto valore diagnostico. Manca la domanda sull'età (presente nell'anchor forte), ma il principio di scoperta è rispettato. A è verbosa e potenzialmente pericolosa (dare un allenamento 'molto intenso' senza conoscere età o livello dell'atleta). | B è nettamente migliore perché, davanti a una richiesta di carico molto intenso senza dati essenziali, ferma la prescrizione e fa domande diagnostiche prima di consigliare. Le domande su sport e frequenza attuale cambiano davvero il programma, anche se manca un dato cruciale nello scenario: l'età, oltre al livello/esperienza. A è naturale e include avvertenze, ma prescrive subito una seduta intensa completa senza conoscere età, livello, sport, esperienza o carico attuale; la domanda finale arriva troppo tardi e non corregge il problema principale.

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

Posso preparartelo, ma per renderlo davvero efficace e non inutilmente rischioso mi servono due dati: **che sport pratichi** e **quante volte ti alleni già a settimana**?

### conversation-discovery-age:1:sample-3

Verdicts: candidate, candidate

Reasons: Response B demonstrates superior coaching behavior. The user revealed they are 15 years old with only one year of experience - critical safety information. Response B correctly recognizes that the sport is still unknown (it was asked in the previous turn but never answered) and asks the essential diagnostic question before providing any program. It acknowledges the age and level context ('adatta ai tuoi 15 anni e al tuo attuale livello') and explicitly reframes intensity ('senza puntare solo sulla fatica'). Response A, while providing age-appropriate modifications and good safety caveats, jumps into a full program despite still not knowing the sport. It then asks the sport at the end, but the damage is done - a generic program was already delivered. This mirrors the weak anchor pattern of giving advice prematurely. Response A also had already provided a full intense program in the previous turn before knowing age/sport, making the current turn a correction rather than proper discovery. Response B maintains proper discovery-before-advice discipline throughout the conversation. | B è preferibile perché, mancando ancora lo sport, ferma correttamente la prescrizione e pone la domanda diagnostica che cambia davvero il contenuto dell’allenamento. A usa bene età, esperienza e frequenza, ed è prudente, ma propone comunque una struttura di carico prima di sapere lo sport; per un atleta di 15 anni questo è meno solido come coaching. La domanda finale di A è buona, ma arriva dopo il consiglio. B è più essenziale e meno completo sul contesto già emerso, però rispetta meglio la progressione di discovery.

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

Quale sport pratichi? L’allenamento intenso cambia molto tra calcio, basket, atletica, tennis e altri sport. Poi ti preparo una sessione adatta ai tuoi 15 anni e al tuo attuale livello, senza puntare solo sulla fatica.

### conversation-discovery-food:0:sample-3

Verdicts: baseline, baseline

Reasons: Entrambe le risposte adottano correttamente un approccio di scoperta prima di dare consigli, ponendo domande diagnostiche pertinenti. La risposta B è leggermente superiore per diversi motivi: 1) Include la domanda sugli orari degli allenamenti (che è presente nell'anchor forte come elemento chiave), 2) Aggiunge una domanda sullo stile alimentare preferito (mediterraneo) che è diagnostica e non rituale perché cambierebbe concretamente il piano, 3) Ha un tono leggermente più naturale e conversazionale senza la struttura 'conferma + lista + promessa' un po' formulaica di A. La risposta A ha una domanda iniziale di conferma ('Intendi un menu alimentare...') che è leggermente rituale dato che il contesto è già chiaro. Entrambe sono buone risposte di coaching, ma B è marginalmente migliore nella qualità e completezza delle domande diagnostiche. | Entrambe evitano di proporre un menu generico e fanno discovery utile. B è superiore perché chiede esplicitamente giorni e orari degli allenamenti, informazione decisiva per organizzare pasti e spuntini attorno alla prestazione; include anche obiettivo, allergie/intolleranze e preferenze alimentari. A è buona, ma manca il timing degli allenamenti e apre con una domanda di conferma un po' meno necessaria.

Baseline:

Certo: per preparare un menu davvero adatto ai tuoi allenamenti mi servono alcune informazioni.

- Che sport pratichi e quante volte ti alleni?
- In quali giorni e orari ti alleni?
- Obiettivo: energia e prestazione, dimagrimento, aumento massa o mantenimento?
- Hai allergie, intolleranze o alimenti che eviti?

Indicami anche età, altezza e peso se vuoi un piano più preciso; preferisci un menu semplice in stile mediterraneo?

Candidate:

Certo. Intendi un **menu alimentare settimanale organizzato intorno agli allenamenti**?

Per personalizzarlo, dimmi:
- sport e numero di allenamenti;
- obiettivo: energia, dimagrimento, massa o mantenimento;
- eventuali allergie, intolleranze o preferenze alimentari;
- età e, se vuoi indicarlo, peso/altezza.

Con queste informazioni preparo colazione, pranzo, cena e spuntini per ogni giorno.

### conversation-discovery-food:1:sample-3

Verdicts: candidate, candidate

Reasons: Response A integrates the new context (vegetarian, 19:00 training) and provides a structural framework while still asking a critical diagnostic question (objective) before delivering a full detailed plan. This follows good coaching practice: acknowledge what's known, give a useful preview, then ask what's still missing. Response B jumps to a complete detailed weekly menu without knowing the athlete's objective, sport type, training frequency, age, or body composition—all of which were asked in the previous turn but never answered. Delivering a full plan before discovery is complete violates the 'discovery before advice' principle. While B does ask about the objective at the end, the damage is done: the menu is already delivered, making the question feel like an afterthought rather than a genuine diagnostic tool. B is also excessively verbose and formulaic. A maintains better conversational flow and progression. | A usa bene le due nuove informazioni dell’utente e fa una domanda diagnostica ad alto valore, l’obiettivo, prima di costruire davvero il menu; offre solo una struttura generale coerente con allenamento alle 19 e vegetarianismo. B usa bene il contesto e il menu è plausibile, ma salta la fase di scoperta: produce subito un piano settimanale dettagliato senza sapere obiettivo, sport, frequenza, intensità o giorni di allenamento. La domanda finale è utile, ma arriva dopo il consiglio principale, quindi funziona più come correzione successiva che come vera discovery.

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

Perfetto: preparo il menu considerando allenamenti alle **19:00** e un’alimentazione **vegetariana**. Per adattare quantità e composizione, qual è il tuo obiettivo principale: **energia/performance, dimagrimento, aumento della massa muscolare o mantenimento**?

Nel frattempo, la struttura ideale è:

- **Colazione:** carboidrati + proteine  
- **Pranzo:** cereali integrali + legumi/uova/latticini + verdure  
- **Spuntino pre-allenamento, 60–90 minuti prima:** carboidrati facilmente digeribili, ad esempio banana e yogurt oppure pane e marmellata  
- **Cena post-allenamento:** proteine + carboidrati + verdure, ad esempio tofu o uova con riso/patate e verdure  
- **Idratazione:** acqua durante il pomeriggio e l’allenamento.

### conversation-discovery-home:0:sample-3

Verdicts: candidate, candidate

Reasons: La risposta A fornisce immediatamente una scheda generica senza alcuna fase di scoperta. Non chiede obiettivi, attrezzatura, limitazioni o disponibilità prima di consigliare. La domanda finale ('Vuoi che te la adatti?') è posta dopo aver già dato il consiglio, il che riduce drasticamente il suo valore diagnostico. La risposta B invece si ferma prima di prescrivere e pone 4 domande diagnostiche ad alto valore (obiettivo, attrezzatura, giorni/tempo, limitazioni) che cambierebbero concretamente la scheda risultante. Questo è esattamente il comportamento premiato dalla rubrica: scoperta prima del consiglio, domande che modificano il consiglio, progressione multi-turn significativa. | B è più adatta allo scenario di discovery: prima di proporre una scheda raccoglie informazioni che cambiano davvero il consiglio, come obiettivo, attrezzatura, tempo disponibile e limitazioni fisiche. A offre una scheda generica subito, utile ma non personalizzata, e fa domande solo alla fine.

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

1. **Obiettivo**: forza, massa muscolare, dimagrimento, forma generale o sport specifico?
2. **Attrezzatura disponibile**: nessuna, elastici, manubri, kettlebell, sbarra?
3. **Quanti giorni e quanto tempo** hai a disposizione?
4. Hai **dolori o limitazioni** da considerare?

### conversation-discovery-home:1:sample-3

Verdicts: candidate, candidate

Reasons: Response A correctly integrates the new context (elastics, 3 days) and asks a high-value diagnostic question about the user's objective before prescribing a program. This follows good coaching practice: discovery before advice. Response B jumps straight into a full detailed program without knowing the user's goal, experience level, or limitations. While B does use the context (elastics, 3 days) to structure the program, it provides a generic prescription before understanding what the person actually needs. B's final question about orientation feels like an afterthought rather than genuine discovery. The anchor forte suggests acknowledging the context and proposing a structure (alternating push/pull/legs), which A partially does by acknowledging the info and asking the key missing question. A is more aligned with coaching best practices of discovery before detailed prescription. | A gestisce meglio il turno di discovery: usa le nuove informazioni essenziali, riconosce che mancano ancora dati decisivi e fa una domanda diagnostica sull’obiettivo, che cambierebbe davvero struttura, volume e intensità della scheda. B sfrutta molto bene elastici e tre giorni e propone una progressione concreta, ma salta troppo presto a una scheda completa senza aver chiarito l’obiettivo; la domanda finale è utile, ma arriva dopo il consiglio e quindi ha più sapore di adattamento tardivo che di discovery prima della prescrizione.

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

Perfetto: **3 giorni a settimana con elastici**. Per personalizzarla mi manca solo una cosa: qual è il tuo obiettivo principale?

- **Forza/massa muscolare**
- **Dimagrimento e forma generale**
- **Preparazione per uno sport**
- **Mobilità e benessere**

Se non hai un obiettivo specifico, posso prepararti una scheda generale per tutto il corpo.

### conversation-clarify-ambiguous:0:sample-3

Verdicts: candidate, candidate

Reasons: L'atleta ha inviato un messaggio ambiguo ('Quando parte mi si chiude tutto') che richiede chiarimento prima di qualsiasi intervento. La Risposta A fa esattamente questo: pone domande diagnostiche mirate (respiro, stomaco, gambe, mente; gara, esercizio, altra situazione) senza dare consigli prematuri. La Risposta B invece fornisce subito 4 consigli pratici (respirazione, focus, partire al 90%, annotare) prima ancora di capire cosa significhi 'si chiude tutto', e solo alla fine pone la domanda di chiarimento. Questo è un errore fondamentale: dare consigli senza diagnosi. La domanda finale di B risulta quasi rituale perché i consigli sono già stati dati, rendendo la risposta meno coerente. A è più naturale, rispetta la progressione multi-turn e dimostra vera scoperta prima del consiglio. | A gestisce correttamente l'ambiguità: riformula senza presumere troppo e fa domande diagnostiche che cambierebbero davvero il consiglio, distinguendo respiro, stomaco, gambe, mente e contesto in cui accade. B contiene una domanda utile, ma arriva dopo una serie di consigli prematuri basati su un'interpretazione non ancora chiarita del problema.

Baseline:

Capisco: all’inizio la tensione può farti “chiudere” corpo e mente.

- Prima di partire, espira lentamente per 6–8 secondi, per 3 volte.
- Scegli un solo focus semplice: **“respiro”**, **“ritmo”** o **“primo gesto”**.
- Parti al 90%, senza cercare subito la prestazione perfetta; lascia che il corpo entri gradualmente nel ritmo.
- Dopo, annota quando esattamente ti blocchi: prima del via, nei primi secondi o quando senti pressione.

Quando dici “mi si chiude tutto”, intendi soprattutto il respiro, i muscoli o la mente?

Candidate:

Capisco: sembra che appena inizi ti blocchi completamente. Quando dici “mi si chiude tutto”, intendi soprattutto **il respiro, lo stomaco, le gambe o la mente**? E succede all’inizio di una gara, di un esercizio o in un’altra situazione?

### conversation-clarify-ambiguous:1:sample-3

Verdicts: baseline, baseline

Reasons: Both responses give advice before fully exploring the issue, which is a weakness shared by both. However, Response B integrates the context better (respiro + partenza gara) into actionable steps that are more sport-specific (progressive warm-up, first 30-60 seconds strategy, relaxed shoulders/jaw). Response B's closing question is also slightly better because it asks two diagnostic dimensions: whether it happens in training vs. competition (which differentiates anxiety from a physiological issue) AND whether there are physical symptoms. Response A's question only asks about physical symptoms. Both include appropriate safety caveats. Response A feels somewhat overly cautious/medical in tone for a coaching conversation, which reduces conversational naturalness. Neither response fully embodies the 'discovery before advice' principle since both give substantial advice before asking their diagnostic question, but Response B's advice is more contextually relevant and the question is more diagnostically valuable. | B usa meglio il chiarimento dell'utente e progredisce in modo più sport-specifico: propone riscaldamento progressivo, espirazione lunga, partenza controllata e segnali di sicurezza, poi fa domande diagnostiche utili che distinguono tensione da possibile risposta respiratoria da sforzo. A è sicura e fa una buona domanda sui sintomi, ma risulta più medicalizzata/allarmante e meno orientata alla gestione concreta della partenza in gara.

Baseline:

Capisco: il respiro che si blocca appena parte la gara può dipendere dalla tensione, ma anche da una risposta respiratoria da sforzo, quindi va preso sul serio.

- Fai un **riscaldamento progressivo di 10–15 minuti**, con qualche breve accelerazione, invece di partire bruscamente.
- Prima del via: inspira normalmente dal naso o dalla bocca ed espira più a lungo, senza fare grandi inspirazioni forzate; pensa a **“espira e ritmo controllato”**.
- Nei primi 30–60 secondi parti leggermente sotto il massimo, mantenendo spalle e mascella rilassate.
- Se compaiono affanno intenso, sibili, dolore al petto, capogiri o non riesci a parlare, **fermati e chiedi assistenza**; se succede spesso, parlane con un medico prima di gareggiare.

Ti succede anche durante gli allenamenti o solo in gara, e avverti sibili o senso di costrizione al petto?

Candidate:

Se il respiro si blocca davvero appena parte la gara, **non forzare**: rallenta o fermati, avvisa allenatore/medico e riprendi solo quando respiri normalmente. Se compaiono forte affanno, dolore o costrizione al petto, sibili, capogiro o svenimento, cerca assistenza subito.

Se invece riesci a respirare ma senti di “non riuscire a prendere aria”, prova alla partenza a **ridurre leggermente il ritmo per i primi 30–60 secondi**, espirare lentamente e concentrarti su un’espirazione più lunga dell’inspirazione. Un episodio ricorrente va comunque valutato da un professionista sanitario prima di spingere al massimo.

Durante l’episodio avverti anche **sibili o costrizione al petto**, oppure è soprattutto una sensazione di panico/blocco?

### conversation-no-ritual-question:0:sample-3

Verdicts: tie, candidate

Reasons: Both responses provide a short pre-serve phrase directly, similar to the strong anchor. Neither asks any discovery question (which could be justified given the user's direct request), but neither uses any context about the user's sport level, type of serve issues, or mental state. Both are nearly identical in structure (breathe, focus, serve with X) and quality. Neither advances the conversation or offers coaching depth. They are functionally equivalent responses that match the strong anchor pattern reasonably well. | Entrambe rispondono direttamente alla richiesta di una frase breve senza aggiungere domande rituali inutili. A è leggermente più naturale in italiano: “mi concentro” suona più fluido e immediato di “mi focalizzo”. Nessuna delle due raggiunge pienamente l’anchor forte perché manca un riferimento più concreto a bersaglio e gesto tecnico.

Baseline:

Respiro, mi focalizzo e servo con decisione.

Candidate:

“Respiro, mi concentro e servo con fiducia.”

### conversation-no-ritual-question:1:sample-3

Verdicts: baseline, candidate

Reasons: Both responses appropriately acknowledge the user's gratitude without forcing unnecessary questions or ritualistic follow-ups. Neither asks a question, which is appropriate given the user has expressed satisfaction. Response B edges ahead by adding a brief contextual reinforcement ('Usala per entrare nel punto con calma e convinzione') that connects back to the original request and provides a small coaching nudge about how to use the phrase, showing slightly better use of context and multi-turn progression. Response A is perfectly natural but offers no additional value beyond a simple farewell. | L'utente ha già accettato la frase e ringrazia: non serve una nuova domanda né ulteriore coaching. A chiude in modo naturale, breve e contestuale al servizio. B è comunque adeguata e usa bene il contesto, ma aggiunge un piccolo consiglio non richiesto dopo un ringraziamento.

Baseline:

Di nulla! Usala per entrare nel punto con calma e convinzione.

Candidate:

Di nulla! Buon servizio.

### conversation-known-thread-fact:0:sample-3

Verdicts: candidate, baseline

Reasons: Entrambe le risposte commettono lo stesso errore fondamentale: danno consigli dettagliati prima di aver fatto scoperta. Tuttavia, A è leggermente migliore perché: 1) la domanda finale è più focalizzata e diagnostica (paura di sbagliare vs insicurezza tecnica), il che potrebbe effettivamente cambiare il consiglio successivo; 2) il consiglio è meno prolisso e la struttura è più leggera; 3) la domanda in B è più dispersiva (lancio, momento prima di colpire, paura di sbagliare - tre opzioni) e arriva dopo un blocco di consigli molto dettagliato che rende la domanda quasi rituale. Nessuna delle due si avvicina all'anchor forte che pone subito una domanda diagnostica senza dare consigli prematuri, ma A è marginalmente superiore nella qualità della domanda e nella naturalezza. | B è preferibile perché la domanda finale è più diagnostica e specifica per la battuta: distingue tra lancio, momento prima del colpo e paura di sbagliare, informazioni che cambierebbero davvero il consiglio successivo. Usa anche meglio il contesto della pallavolo con riferimenti a zone e battuta sotto pressione. Entrambe però danno molti consigli prima di fare scoperta, quindi non raggiungono il modello forte della domanda iniziale prima dell’intervento.

Baseline:

Capita spesso: il blocco in battuta nasce più dalla pressione del momento che dalla tecnica, e si può allenare.

- **Crea una routine sempre uguale**: respira lentamente, guarda il punto scelto, fai rimbalzare la palla una volta e batti. Mantienila in 5–7 secondi.
- **Scegli un obiettivo semplice e ampio**, per esempio “zona 1” o “oltre la rete”, invece di pensare a non sbagliare.
- **Usa una frase breve**: “Alto e avanti” oppure “Routine, colpisci”. Riporta l’attenzione all’azione.
- **Allenati sotto pressione graduale**: 5 battute senza conseguenze, poi una “battuta decisiva” contando solo l’esecuzione della routine, non il risultato.

Alla prossima partita, quale parte ti blocca di più: il lancio, il momento prima di colpire o la paura di sbagliare?

Candidate:

È abbastanza comune: spesso il blocco nasce dal tentativo di **non sbagliare**, che fa pensare troppo al gesto.

Per la prossima battuta prova questa routine semplice:

1. Espira lentamente.
2. Guarda un punto preciso del campo.
3. Ripeti una sola parola: **“fluidità”** oppure **“alta e dentro”**.
4. Fai sempre lo stesso numero di rimbalzi e lancia la palla senza modificarlo.
5. Concentrati sul gesto, non sul risultato.

In allenamento, inizia con un obiettivo controllabile: **5 battute sicure**, non necessariamente potenti. Poi aumenta gradualmente la difficoltà.

Quando ti blocchi, senti soprattutto **paura di sbagliare**, oppure perdi la sicurezza tecnica sul movimento?

### conversation-known-thread-fact:1:sample-3

Verdicts: candidate, candidate

Reasons: Both responses provide structured weekly plans that build on the volleyball serving context from the previous turn. Neither asks a diagnostic question before giving advice (both jump straight into a plan), which is a weakness given that the athlete hasn't yet clarified what specifically blocks them (the previous assistant questions went unanswered). Response A is slightly better because: (1) it includes a Day 1 observation step that encourages self-awareness before drilling, which partially compensates for the lack of a diagnostic question; (2) it explicitly addresses error management (Day 4), which is highly relevant to the blocking issue; (3) it includes visualization, adding a mental training dimension; (4) the closing 'rule' aligns well with the anchor forte concept of measuring routine completion rather than results. Response B is solid but its closing question ('Quando sarà il tuo prossimo allenamento?') is more logistical/ritual than diagnostic—it doesn't change the advice given. Both are somewhat formulaic in structure but A offers slightly more depth and progression. | Entrambe usano bene il contesto della battuta in pallavolo e trasformano il problema in un piano settimanale concreto. A è leggermente superiore perché integra meglio la progressione: osservazione iniziale del punto del blocco, automatizzazione della routine, gestione dell’errore, pressione graduale e simulazione. Inoltre mantiene il focus sulla misura della routine, in linea con l’anchor forte. B è molto solida e più naturale, con un buon uso di compagno/allenatore e pressione controllata, ma la domanda finale è più logistica che diagnostica e il piano è un po’ meno adattivo.

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

Questa settimana lavora su **routine, sicurezza e pressione graduale**, non sulla potenza.

### Piano di 7 giorni

**Giorno 1 – Osserva**
- Fai 20 battute facili.
- Segna quando ti blocchi: prima del lancio, durante il gesto o dopo un errore.
- Scegli una sola battuta-obiettivo, per esempio: *alta, profonda e dentro*.

**Giorni 2-3 – Automatizza la routine**
Prima di ogni battuta:
1. Un respiro lento.
2. Guarda il punto scelto.
3. Una parola chiave: **“fluida”**.
4. Stesso numero di rimbalzi o preparazione.
5. Esegui senza aggiungere pensieri.

Fai 3 serie da 6 battute, con una breve pausa. Conta solo quante volte hai seguito la routine, non quante sono entrate.

**Giorno 4 – Gestisci l’errore**
Dopo una battuta sbagliata:
- espira;
- di’ mentalmente: **“azione successiva”**;
- ripeti la routine identica.

Non correggere tre aspetti insieme: scegli un solo dettaglio tecnico.

**Giorni 5-6 – Pressione graduale**
Simula la partita:
- devi mettere dentro 3 battute su 5;
- poi 5 su 7;
- se sbagli, non ricominciare da zero: applica la routine e continua.

Aumenta la difficoltà solo se riesci a mantenere un gesto tranquillo.

**Giorno 7 – Gara simulata**
Prima dell’allenamento o a casa, visualizza 5 battute:
- senti la tensione;
- fai la routine;
- immagini di eseguire il gesto con continuità;
- includi anche un errore e il tuo recupero.

### Regola per tutta la settimana
Valuta la prestazione con questa domanda: **“Ho seguito la mia routine?”**  
Il risultato della battuta verrà dopo. L’obiettivo iniziale è rendere il gesto prevedibile anche quando senti pressione.

### conversation-identity-correction:0:sample-3

Verdicts: tie, baseline

Reasons: Both responses appropriately acknowledge the identity correction (Marta, not Paolo), avoid giving unsolicited advice, and ask an open-ended question to discover what Marta needs. Neither response is significantly better than the other. Both are natural, concise, and aligned with the strong anchor. The questions ('Di cosa vuoi parlare oggi?' vs 'Come posso aiutarti oggi?') are functionally equivalent - both are open discovery questions rather than diagnostic ones, but given the minimal context available, this is appropriate. Neither adds unnecessary verbosity or ritualistic formulas. | Entrambe recepiscono la correzione d'identità e non danno consigli prematuri. A è leggermente migliore perché usa il nome in modo naturale e apre il turno con una domanda un po' meno formulaica di 'Come posso aiutarti oggi?'. Tuttavia entrambe restano generiche e non esplicitano che terranno presente che oggi l'interlocutrice è Marta.

Baseline:

Perfetto, grazie per avermelo detto Marta. Di cosa vuoi parlare oggi?

Candidate:

Ciao Marta, grazie per avermelo detto. Come posso aiutarti oggi?

### conversation-identity-correction:1:sample-3

Verdicts: candidate, baseline

Reasons: Entrambe le risposte commettono lo stesso errore fondamentale rispetto all'anchor forte: danno consigli prima di fare la domanda diagnostica. Tuttavia, A è leggermente migliore perché il suo consiglio è più conciso (4 punti brevi vs un elenco più lungo e dettagliato in B), il che rende la domanda finale meno sepolta. B è più verbosa e fornisce un piano d'azione più elaborato senza prima capire dove si manifesta la paura, il che è meno coerente con un approccio di coaching basato sulla scoperta. Entrambe usano il nome Marta implicitamente (non esplicitamente come nell'anchor forte) e pongono una domanda diagnostica alla fine, ma la quantità di consiglio non richiesto prima della domanda penalizza entrambe. A è leggermente più naturale e meno 'da manuale' rispetto a B. | Entrambe rispondono in modo utile e naturale, ma danno consigli prima di fare una domanda diagnostica, quindi perdono punti sulla scoperta prima del consiglio. B è leggermente superiore perché la domanda finale distingue meglio tra tiro, perdita di palla e partite importanti, categorie che cambierebbero davvero il tipo di intervento; inoltre collega già la paura alla pressione di gara e all’allenamento situazionale. A è più concisa e valida, ma la domanda è un po’ meno mirata e include opzioni meno trasformative per il consiglio.

Baseline:

È normale avere paura di sbagliare: l’obiettivo non è eliminarla, ma giocare comunque con fiducia.

- **Prima dell’azione:** inspira lentamente e pensa a una sola parola chiave: *“aggressiva”*, *“semplice”* o *“presente”*.
- **Dopo un errore:** fai un reset immediato: battito di mani, espira e chiediti: *“Qual è la prossima azione utile?”*
- **Cambia obiettivo:** non puntare a “non sbagliare”; punta a correre in difesa, comunicare, prendere buone decisioni e aiutare la squadra.
- **Allenati alla pressione:** durante gli allenamenti chiedi situazioni simulate di partita, concentrandoti sul gesto successivo, non sul risultato.

In quale momento senti più paura: quando tiri, quando perdi palla o durante le partite importanti?

Candidate:

La paura di sbagliare è normale, ma non deve guidare la tua prossima azione. In campo prova questa routine:

1. **Respira una volta lentamente.**
2. **Dì mentalmente:** “Prossima azione.”
3. **Scegli un obiettivo controllabile:** difendere forte, passare semplice, tagliare, correre in transizione.
4. Dopo un errore, niente giudizi: chiediti solo **“Cosa faccio adesso?”**

Un errore non definisce la tua partita; la reazione successiva sì.

**Quando senti più paura: durante i tiri, nei passaggi, in difesa o quando ti osservano?**

### conversation-cross-chat-transparency:0:sample-3

Verdicts: baseline, baseline

Reasons: Both responses correctly acknowledge they cannot access the other chat and ask the user to provide context before giving advice. However, Response A is superior because it specifies exactly what information it needs (allenamento previsto, stato fisico e obiettivo di oggi), which is a higher-quality diagnostic question that would actually shape the coaching advice. Response B simply asks for 'l'ultimo messaggio o un breve riepilogo del piano concordato' which is more generic and less targeted. A's specificity demonstrates better coaching instinct - knowing what variables matter for today's session. Both avoid giving premature advice, but A's structured request would lead to more actionable follow-up. | Entrambe riconoscono correttamente di non avere accesso all'altra chat e chiedono contesto prima di dare consigli. A è superiore perché chiede dati diagnostici concreti — allenamento previsto, stato fisico e obiettivo di oggi — che possono cambiare realmente il consiglio sportivo. B è chiara e naturale, ma resta più generica: chiedere il piano concordato aiuta, però guida meno l'utente verso le informazioni davvero utili.

Baseline:

Non posso vedere il contenuto dell’altra chat, quindi non voglio inventare un piano. Incollami qui gli ultimi messaggi o riassumi **allenamento previsto, stato fisico e obiettivo di oggi**, e ti dirò esattamente cosa fare.

Candidate:

Non posso vedere l’altra chat da questa conversazione. Incollami qui l’ultimo messaggio o un breve riepilogo del piano concordato, e ti dico subito cosa fare oggi.

### conversation-cross-chat-transparency:1:sample-3

Verdicts: candidate, baseline

Reasons: Both responses share the same fundamental structure: they jump into advice before asking diagnostic questions, then close with the same question ('hai allenamento o è un giorno di riposo?'). Neither asks about the nature/intensity of the anxiety, the sport, the athlete's experience level, or what was discussed previously—all of which would change the advice significantly. However, A is slightly better because it's more concise and less prescriptive without knowing the context. B gives a very detailed protocol (10 minutes writing, visualization, evening routine) without knowing the sport, the athlete's level, what triggers the anxiety, or whether they even have training today. This makes B more presumptuous. A's advice is lighter and leaves more room for adaptation after the closing question is answered. Both have the same closing question which is decent but not high-value diagnostically—a better question would probe the nature of the anxiety or what was discussed in the previous chat. A is marginally better for being less verbose and less presumptuous given the lack of information. | B usa meglio il contesto specifico della gara di domenica e trasforma il tema dell’ansia in una giornata concreta: controllo/preoccupazioni, allenamento senza sovraccarico, visualizzazione e preparazione serale. A è solida e naturale, ma più generica e meno completa. Entrambe fanno una domanda diagnostica utile su allenamento o riposo, ma la pongono dopo aver già dato il piano, quindi la scoperta prima del consiglio resta solo discreta.

Baseline:

Capisco: oggi l’obiettivo non è eliminare l’ansia, ma renderla gestibile in vista della gara di domenica.

- **10 minuti:** scrivi cosa ti preoccupa e dividi tutto in “sotto il mio controllo” / “non sotto il mio controllo”. Scegli una sola azione concreta dalla prima lista.
- **Allenamento:** svolgilo normalmente, senza aggiungere carico per “recuperare” o dimostrare qualcosa. Concentrati su 1–2 aspetti tecnici già allenati.
- **Visualizzazione breve:** immagina partenza, primo momento di tensione e una risposta semplice: *respiro, guardo il riferimento, eseguo il prossimo gesto*.
- **Stasera:** prepara l’attrezzatura e fai 5 minuti di respirazione lenta, con espirazione più lunga dell’inspirazione.

Oggi hai già un allenamento programmato oppure è un giorno di riposo?

Candidate:

Per oggi, l’obiettivo non è eliminare l’ansia, ma imparare a gestirla senza darle il controllo.

Fai questo:
- 5 minuti per scrivere cosa temi e cosa puoi controllare.
- Scegli **un solo focus di gara** (per esempio: respirazione, ritmo o primo gesto).
- Durante l’allenamento, prova una breve routine: espirazione lenta, parola-chiave, attenzione al gesto successivo.
- Chiudi la giornata senza ripassare mentalmente tutti gli scenari negativi.

Oggi hai allenamento oppure è un giorno di riposo?

### conversation-progress-beyond-routine:0:sample-3

Verdicts: candidate, candidate

Reasons: L'atleta dice che la routine non funziona. L'anchor forte mostra che la risposta ideale è una domanda diagnostica prima di qualsiasi consiglio. Risposta B fa esattamente questo: valida brevemente, offre un'ipotesi leggera (troppo generica o momento sbagliato) e poi pone due domande diagnostiche precise (quando fallisce e cosa succede concretamente). Risposta A invece fornisce quattro consigli dettagliati prima di porre la domanda diagnostica alla fine, invertendo l'ordine corretto. Questo viola il principio 'scoperta prima del consiglio': se non sai ancora quando e come la routine fallisce, i consigli sono generici e potenzialmente irrilevanti. B è più naturale, concisa e orientata alla progressione multi-turn. | B è superiore perché non propone subito un’altra routine o soluzioni generiche: usa il fatto che la routine precedente non funzioni per fare una diagnosi utile sul momento del fallimento e sul tipo di reazione. La domanda può davvero cambiare il consiglio successivo. A è empatica e contiene spunti plausibili, ma dà molte indicazioni prima di capire dove e come la routine fallisce, quindi progredisce meno bene nel coaching multi-turn.

Baseline:

Capisco: è frustrante impegnarsi in una routine e sentire che, proprio quando serve, la paura resta lì.

- **Accorciala:** riducila a 3 passaggi e 5–8 secondi: *espira lentamente → guarda un punto preciso → scegli una sola intenzione tecnica*.
- **Non cercare di eliminare la paura:** formula “Posso sentire paura e fare comunque il gesto”. L’obiettivo è agire, non sentirsi perfettamente calmi.
- **Sposta l’attenzione sull’azione:** sostituisci “non sbagliare” con un comando osservabile, per esempio “piede attivo”, “guarda la palla” o “attacca il bersaglio”.
- **Allenala sotto pressione graduale:** inserisci una conseguenza controllata — punteggio, tempo limite o una ripetizione decisiva — e usa la routine anche quando l’errore non è ancora imminente.

In quale momento preciso smette di funzionare: **prima dell’azione, durante l’esecuzione o subito dopo un errore**?

Candidate:

Capito: se non sta funzionando, non serve ripeterla più forte; probabilmente è troppo generica o arriva nel momento sbagliato.

In quale situazione fallisce soprattutto: **prima dell’azione**, **durante**, oppure **subito dopo un errore**? E cosa succede concretamente — pensieri, tensione fisica o blocco tecnico?

### conversation-progress-beyond-routine:1:sample-3

Verdicts: candidate, candidate

Reasons: Both responses correctly identify the core issue (fear of substitution rather than fear of error itself) and provide actionable advice. However, Response B is superior in several ways: (1) Discovery before advice - B's closing question ('Has the coach ever explicitly said he'll sub you after an error, or is this a consequence you fear?') is a high-value diagnostic question that could fundamentally change the direction of coaching. It distinguishes between a real threat and a cognitive distortion, which would alter the entire intervention. A's closing question ('What's the first concrete action you can do after the next error?') is more of a commitment question than a discovery question. (2) B's framework (Fact → Thought → Command) is cleaner and more memorable, separating observation from interpretation in a way that teaches a skill. (3) B is more conversationally natural - it doesn't use bullet-point lists with bold headers in the same formulaic way A does. (4) B better aligns with the anchor forte's emphasis on clarifying expectations with the coach, but does so through a question rather than prescribing it directly. A does suggest talking to the coach but frames it as advice rather than first exploring whether the fear is grounded in reality. | B è preferibile perché identifica bene che il problema è il significato attribuito all’errore e pone una domanda diagnostica ad alto valore: sapere se il coach ha davvero minacciato la sostituzione cambia il lavoro successivo. A usa bene il contesto e offre indicazioni pratiche valide, inclusa la conversazione col coach, ma passa subito a molte soluzioni e la domanda finale è più orientata all’azione che alla diagnosi del nodo centrale.

Baseline:

Capisco: non temi solo l’errore, ma la conseguenza che immagini subito dopo—essere tolto dal coach.

- **Dopo l’errore, interrompi la previsione:** dì mentalmente “È un errore, non una sostituzione”. Non puoi controllare la decisione del coach, ma puoi controllare la prossima azione.
- **Usa un reset di 5 secondi:** espira, guarda il coach o un riferimento del campo, pronuncia una parola-chiave come *“prossima”*, poi fai un’azione semplice e utile.
- **Cambia l’obiettivo:** non “devo dimostrare di non sbagliare”, ma “dopo l’errore devo restare presente e contribuire”.
- **Parlane con il coach fuori dalla gara:** “Quando sbaglio temo di essere tolto e gioco più contratto. Qual è il comportamento che vuoi vedere da me dopo un errore?”

Qual è la **prima azione concreta** che puoi fare dopo il prossimo errore per dimostrare presenza, indipendentemente da ciò che decide il coach?

Candidate:

Il problema non è solo l’errore: è il significato che gli dai subito dopo — **“adesso mi toglie”**. In quel momento non devi convincerti che andrà tutto bene; devi separare il fatto dalla previsione:

**Dopo l’errore:**
1. **Fatto:** “Ho sbagliato questa azione.”
2. **Pensiero:** “Il coach mi toglierà.”
3. **Comando:** una sola indicazione tecnica per la giocata successiva, ad esempio: “Mi muovo subito” o “Guardo prima”.

Poi esegui il comando senza controllare la reazione del coach. L’obiettivo non è smettere di avere paura, ma **non lasciare che la paura decida la giocata successiva**.

Una domanda importante: **il coach ha mai detto esplicitamente che ti toglierà dopo un errore, oppure è una conseguenza che temi tu?**

### conversation-gradual-specialization:0:sample-3

Verdicts: candidate, candidate

Reasons: L'utente ha fornito un'informazione molto generica ('In gara perdo fiducia'). L'anchor forte della rubrica indica chiaramente che la risposta ideale è una domanda diagnostica prima di dare consigli. La Risposta A fornisce subito 4 consigli strutturati (bullet points) senza aver prima compreso il contesto specifico dell'atleta - quale sport, quale momento della gara, quali segnali. Solo alla fine pone una domanda. La Risposta B invece offre solo una breve normalizzazione e un reframe utile ('non devi aspettare di sentirti sicuro'), poi passa direttamente alla domanda diagnostica senza dare consigli prematuri. Questo rispetta il principio 'scoperta prima del consiglio' molto meglio. La domanda di B è leggermente più strutturata con opzioni chiare. A pecca di verbosità e di dare consigli generici prima di aver capito il problema specifico. | B è più coerente con il controllo positivo di approfondimento graduale: riconosce il problema e pone subito una domanda diagnostica che può cambiare il consiglio successivo. A contiene consigli potenzialmente utili, ma anticipa troppo la soluzione prima di capire quando e come cala la fiducia; la domanda finale è buona, ma arriva dopo una lista di interventi generici.

Baseline:

È comune: in gara la pressione può far sembrare più fragili capacità che in allenamento ci sono già.

- **Prima della gara:** scegli 2 obiettivi controllabili, ad esempio “parto deciso” e “respiro tra un’azione e l’altra”, invece di pensare solo al risultato.
- **Durante:** usa una parola-chiave breve: *“presente”*, *“aggressivo”* o *“fluido”*. Ripetila prima dell’azione.
- **Dopo un errore:** espira lentamente, guarda un punto preciso e chiediti: **“Qual è la prossima azione utile?”** Niente analisi mentre stai gareggiando.
- **Allenamento mentale:** simula situazioni di pressione e allena la tua routine di reset, non solo la tecnica.

In quale momento perdi più fiducia: all’inizio, dopo un errore o quando il risultato è in bilico?

Candidate:

È comune: in gara la fiducia può calare dopo un errore o quando senti pressione, ma non devi aspettare di “sentirti sicuro” per continuare a eseguire bene.

In quale momento perdi più fiducia: **prima della gara, dopo un errore, oppure quando il risultato è in bilico**?

### conversation-gradual-specialization:1:sample-3

Verdicts: candidate, candidate

Reasons: Response A better integrates the user's specific context (two consecutive errors in the final) by hypothesizing what happens psychologically ('playing not to make mistakes') and then offering a concise reset routine. Crucially, A's closing question is diagnostically valuable—it distinguishes between two different mental patterns ('I must not make more mistakes' vs. 'I'm losing the match'), which would genuinely change the next piece of advice. Response B provides a longer list of tips (some already given in the previous turn, showing less progression) and ends with a weaker question ('What's your next simplest and safest action?') that reads more like a coaching exercise than a diagnostic probe. B also repeats much of the structure from its first turn, showing less multi-turn progression. Both responses give advice before fully exploring, but A balances advice with meaningful discovery better. | A usa bene il dettaglio nuovo dei due errori nel finale, propone un reset mirato e aggiunge una domanda diagnostica che può davvero cambiare il coaching successivo: paura di sbagliare ancora e paura di perdere richiedono interventi diversi. B è pratico e contestualizzato, ma tende a dare una lista più ampia e la domanda finale è più di implementazione che diagnostica; inoltre 'semplice e sicura' potrebbe rinforzare una modalità troppo conservativa nel finale.

Baseline:

Capisco: due errori nel finale possono trasformarsi rapidamente da problema tecnico a dubbio mentale.

- **Dopo il primo errore:** pensa solo a correggere un dettaglio, non al risultato.
- **Dopo il secondo:** attiva un reset fisso di 5–10 secondi: espira lungo, rilassa spalle e mani, guarda un punto, ripeti **“una giocata alla volta”**.
- **Prima dell’azione successiva:** scegli un’intenzione concreta: *“profondo”, “semplice”, “aggressivo”* oppure un’indicazione tecnica specifica.
- **In allenamento:** simula finali sotto pressione partendo da due errori consecutivi; allena soprattutto la routine di recupero.

Qual è la tua prossima azione più semplice e sicura quando sei nel finale?

Candidate:

Dopo due errori consecutivi nel finale, probabilmente inizi a giocare **per non sbagliare**: controlli troppo, acceleri o perdi lucidità.

Usa una routine breve:

1. **Segnale di stop:** espira lentamente e rilassa spalle/mani.  
2. **Frase semplice:** “Un’azione alla volta.”  
3. **Obiettivo controllabile:** scegli un solo compito tecnico per l’azione successiva.  
4. **Accetta il rischio:** non cercare di recuperare entrambi gli errori con una giocata perfetta.

La fiducia torna spesso **dopo un’azione eseguita bene**, non prima.

Qual è il pensiero dominante dopo quei due errori: **“non devo sbagliare più”** oppure **“sto perdendo la gara”**?

