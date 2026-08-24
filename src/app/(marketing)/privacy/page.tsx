import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalPageLayout,
  type LegalPageSection,
  LegalSection,
} from "../components/LegalPageLayout";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: "Informativa privacy",
  description:
    "Come Anthon raccoglie, usa, conserva e protegge i dati personali.",
};

const sections: LegalPageSection[] = [
  { id: "titolare", label: "Titolare e contatti" },
  { id: "dati", label: "Dati che trattiamo" },
  { id: "finalita", label: "Perché li usiamo" },
  { id: "ai-memoria", label: "IA, memoria e contenuti" },
  { id: "fornitori", label: "Fornitori e destinatari" },
  { id: "trasferimenti", label: "Trasferimenti internazionali" },
  { id: "cookie", label: "Cookie e tecnologie simili" },
  { id: "conservazione", label: "Conservazione" },
  { id: "diritti", label: "I tuoi diritti" },
  { id: "sicurezza", label: "Sicurezza" },
  { id: "aggiornamenti", label: "Aggiornamenti" },
];

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      kind="privacy"
      eyebrow="Informativa privacy"
      title="I tuoi dati, spiegati chiaramente"
      description="Qui trovi cosa raccogliamo, perché ci serve, con chi può essere condiviso e come puoi esercitare il controllo sui tuoi dati."
      updatedAt="5 agosto 2026"
      sections={sections}
    >
      <LegalSection id="titolare" number="01" title="Titolare e contatti">
        <p>
          Il titolare del trattamento per il servizio Anthon è{" "}
          <strong>Anthon AI</strong> ("Anthon"). Per domande, richieste di
          accesso o cancellazione e comunicazioni relative alla privacy, scrivi
          a <a href="mailto:anthon.chat@gmail.com">anthon.chat@gmail.com</a>.
        </p>
        <p>
          Quando ci scrivi, usa l'indirizzo email associato al tuo account e
          indica chiaramente la richiesta. Potremmo chiederti informazioni
          ragionevoli per verificare la tua identità e proteggere i dati da
          richieste fraudolente.
        </p>
      </LegalSection>

      <LegalSection id="dati" number="02" title="Dati che trattiamo">
        <p>
          Raccogliamo solo i dati necessari per una specifica funzione o per
          proteggere il servizio. In base a come usi Anthon, possiamo trattare:
        </p>
        <ul>
          <li>
            <strong>Account e identità:</strong> identificativo Clerk, email,
            nome, immagine del profilo, dati di accesso e stato della sessione;
          </li>
          <li>
            <strong>Profilo e preferenze:</strong> nome, sport, obiettivi,
            esperienza, data di nascita, note, tono, modalità, lingua e
            preferenze vocali;
          </li>
          <li>
            <strong>Conversazioni e contenuti:</strong> messaggi, titoli delle
            chat, risposte, feedback, file, immagini, documenti, audio, output
            vocali e metadati tecnici relativi a una richiesta;
          </li>
          <li>
            <strong>Memoria del coaching:</strong> fatti e preferenze che Anthon
            salva per rendere più coerenti le conversazioni tra sessioni e
            canali. Puoi rivedere o cancellare le memorie dalle funzioni
            disponibili nel profilo;
          </li>
          <li>
            <strong>Canali collegati:</strong> identificativi e metadati del
            profilo Telegram o WhatsApp, numero o chat identificata dal provider
            e messaggi ricevuti o inviati tramite quel canale;
          </li>
          <li>
            <strong>Uso, sicurezza e fatturazione:</strong> piano, stato
            dell'abbonamento, conteggi d'uso, token e costi tecnici, errori, log
            operativi, identificativi antifrode e dati necessari a gestire
            l'account e il pagamento. I dati completi della carta sono gestiti
            dal provider di fatturazione e non sono memorizzati nel database
            applicativo di Anthon;
          </li>
          <li>
            <strong>Dati tecnici:</strong> informazioni necessarie a servire la
            pagina, mantenere la sessione e prevenire abusi. Per i limiti guest,
            l'indirizzo di rete può essere temporaneamente elaborato e
            trasformato in un identificativo hash con chiave; l'indirizzo
            originale non viene salvato nel relativo registro antifrode.
          </li>
        </ul>
        <p>
          I contenuti che scegli di scrivere possono rivelare informazioni
          sensibili, incluse informazioni sulla salute. Non inserire dati
          sanitari o dati di altre persone se non è necessario e non hai una
          base legale per farlo.
        </p>
      </LegalSection>

      <LegalSection id="finalita" number="03" title="Perché li usiamo">
        <p>
          Usiamo i dati per le finalità seguenti, applicando la base giuridica
          appropriata secondo il GDPR e la normativa applicabile:
        </p>
        <ul>
          <li>
            <strong>Fornire Anthon:</strong> creare e proteggere l'account,
            mantenere le chat, generare risposte, sincronizzare memoria e
            profilo e consegnare messaggi sui canali scelti. Base: esecuzione
            del contratto o misure precontrattuali;
          </li>
          <li>
            <strong>Gestire piani e pagamenti:</strong> attivare prova e piano,
            applicare limiti e sincronizzare lo stato dell'abbonamento. Base:
            contratto e obblighi di legge;
          </li>
          <li>
            <strong>Proteggere il servizio:</strong> prevenire frodi, spam,
            accessi abusivi e uso contrario alle condizioni. Base: legittimo
            interesse e, quando applicabile, obbligo di legge;
          </li>
          <li>
            <strong>Assistenza e comunicazioni:</strong> rispondere alle
            richieste e gestire problemi tecnici. Base: contratto o legittimo
            interesse;
          </li>
          <li>
            <strong>Misurare e migliorare il prodotto:</strong> analizzare
            eventi di prodotto, uso aggregato, prestazioni ed errori. Quando
            richiesto, la misurazione non essenziale avviene solo con il
            consenso; in ogni caso cerchiamo di non inviare a PostHog il testo
            delle conversazioni o i risultati dell'IA;
          </li>
          <li>
            <strong>Rispettare la legge:</strong> gestire richieste delle
            autorità, contenziosi, registri contabili e obblighi di sicurezza.
            Base: obbligo di legge o legittimo interesse.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="ai-memoria" number="04" title="IA, memoria e contenuti">
        <p>
          Per rispondere a una richiesta, Anthon può inviare a un provider di
          modelli il testo della conversazione e, quando la funzione lo
          richiede, contenuti multimediali o trascrizioni audio. Il modello e il
          percorso di elaborazione possono variare in base alla funzione e al
          piano.
        </p>
        <p>
          Se la memoria è attiva, Anthon può estrarre e conservare fatti utili
          come sport, obiettivi, preferenze, disponibilità o contesto del
          coaching. La memoria non è un profilo pubblico: viene usata per il tuo
          account e può essere modificata o cancellata dalle funzioni del
          profilo. Le conversazioni possono inoltre essere riassunte per
          conservare il contesto quando i messaggi grezzi vengono rimossi
          secondo la politica di conservazione descritta sotto.
        </p>
        <p>
          Non usiamo il testo delle tue chat per creare pubblicità
          comportamentale. Non possiamo però controllare i trattamenti che un
          canale o un provider esterno effettua secondo la propria informativa.
        </p>
      </LegalSection>

      <LegalSection id="fornitori" number="05" title="Fornitori e destinatari">
        <p>
          Per fornire il servizio possiamo condividere i dati necessari con
          fornitori che operano per nostro conto, con i provider che scegli di
          collegare e con le autorità quando la legge lo richiede. I principali
          servizi coinvolti sono:
        </p>
        <ul>
          <li>
            <strong>Clerk:</strong> autenticazione, sessioni, organizzazioni e
            gestione del checkout o dello stato dell'abbonamento;
          </li>
          <li>
            <strong>OpenRouter e provider dei modelli configurati:</strong>
            generazione delle risposte, classificazione, memoria, ricerca e
            trascrizione quando richieste;
          </li>
          <li>
            <strong>ElevenLabs:</strong> sintesi vocale quando la funzione voce
            è attiva;
          </li>
          <li>
            <strong>Vercel Blob:</strong> conservazione tecnica di allegati e
            file audio privati;
          </li>
          <li>
            <strong>PostHog:</strong> eventi di prodotto, analisi e diagnostica,
            quando la relativa configurazione è attiva. Per gli account
            autenticati può ricevere l'identificativo Clerk e i dati di profilo
            necessari all'identificazione analitica;
          </li>
          <li>
            <strong>Hosting, database e code operative:</strong> infrastruttura
            Vercel, database PostgreSQL/Neon e servizi di coda usati per
            attività di manutenzione;
          </li>
          <li>
            <strong>Telegram e WhatsApp:</strong> contenuti e identificativi
            necessari solo se scegli di collegare e usare quei canali.
          </li>
        </ul>
        <p>
          Non vendiamo i tuoi dati personali. Possiamo trasferire informazioni a
          un successore o a consulenti nell'ambito di una riorganizzazione o
          operazione societaria, mantenendo le tutele previste da questa
          informativa.
        </p>
      </LegalSection>

      <LegalSection
        id="trasferimenti"
        number="06"
        title="Trasferimenti internazionali"
      >
        <p>
          Alcuni fornitori possono trattare dati al di fuori dello Spazio
          Economico Europeo. Quando un trasferimento internazionale è soggetto
          al GDPR, adottiamo il meccanismo previsto dalla legge applicabile,
          come una decisione di adeguatezza o clausole contrattuali standard,
          insieme alle misure supplementari appropriate quando necessarie.
        </p>
        <p>
          Le informative e i termini dei provider possono descrivere ulteriori
          trattamenti. Ti consigliamo di leggerli prima di collegare un canale o
          inviare contenuti particolarmente sensibili.
        </p>
      </LegalSection>

      <LegalSection id="cookie" number="07" title="Cookie e tecnologie simili">
        <p>
          Anthon può usare cookie, session storage o local storage per rendere
          possibile il login, mantenere una sessione guest, ricordare preferenze
          tecniche e proteggere il servizio. Questi strumenti sono necessari per
          alcune funzioni e non vengono usati per pubblicità comportamentale.
        </p>
        <p>
          Quando la configurazione di PostHog è attiva, possiamo usare
          tecnologie analitiche per misurare navigazione, uso delle funzioni e
          errori. Sono strumenti non essenziali e, quando richiesto dalla legge,
          devono essere attivati solo dopo una scelta valida dell'utente. Puoi
          anche gestire o bloccare cookie e archiviazione locale dalle
          impostazioni del browser; alcune funzioni potrebbero non funzionare
          correttamente.
        </p>
        <p>
          Per una descrizione aggiornata delle tecnologie di tracciamento e
          delle scelte disponibili, contattaci a{" "}
          <a href="mailto:anthon.chat@gmail.com">anthon.chat@gmail.com</a>.
        </p>
      </LegalSection>

      <LegalSection id="conservazione" number="08" title="Conservazione">
        <p>
          Conserviamo i dati per il tempo necessario alla finalità per cui sono
          stati raccolti, alla gestione del tuo account e agli obblighi di
          legge. Applichiamo inoltre queste regole operative:
        </p>
        <ul>
          <li>
            i dati dell'account e del profilo restano disponibili finché
            l'account è attivo; le chat e gli allegati seguono anche le regole
            di conservazione specifiche indicate qui sotto;
          </li>
          <li>
            le sessioni concluse possono essere riassunte e i messaggi grezzi
            rimossi dopo il periodo del piano: 1 giorno per guest, 30 giorni per
            Basic, 60 giorni per Basic Plus e 180 giorni per Pro;
          </li>
          <li>
            gli allegati seguono lo stesso periodo di conservazione del piano e
            vengono rimossi dal relativo storage quando la pulizia viene
            eseguita;
          </li>
          <li>
            i trace tecnici cifrati delle richieste AI hanno una scadenza
            operativa di 30 giorni;
          </li>
          <li>
            i registri antifrode guest vengono conservati per una finestra
            operativa di 30 giorni;
          </li>
          <li>
            alcuni dati possono essere conservati più a lungo per obblighi
            contabili, sicurezza, difesa di diritti o gestione di controversie.
          </li>
        </ul>
        <p>
          Puoi cancellare l'account dalle funzioni disponibili nel profilo o
          scrivendo a noi. La cancellazione rimuove l'account e i dati
          applicativi collegati secondo le operazioni tecniche disponibili;
          copie limitate nei backup o nei registri che dobbiamo conservare
          possono persistere per il periodo necessario e restano protette.
        </p>
      </LegalSection>

      <LegalSection id="diritti" number="09" title="I tuoi diritti">
        <p>
          Nei limiti previsti dal GDPR, puoi chiedere accesso ai dati,
          rettifica, cancellazione, limitazione del trattamento, portabilità e
          opposizione. Puoi anche revocare un consenso in qualsiasi momento,
          senza incidere sulla liceità del trattamento precedente alla revoca.
        </p>
        <p>
          Invia la richiesta a{" "}
          <a href="mailto:anthon.chat@gmail.com">anthon.chat@gmail.com</a>.
          Rispondiamo senza indebito ritardo e, di norma, entro un mese; il
          termine può essere prorogato nei casi previsti dalla legge. Se ritieni
          che il trattamento violi la normativa, puoi proporre reclamo al{" "}
          <a
            href="https://www.garanteprivacy.it/"
            target="_blank"
            rel="noreferrer"
          >
            Garante per la protezione dei dati personali
          </a>
          .
        </p>
        <p>
          Anthon usa l'IA per fornire risposte e applica limiti tecnici di
          piano, sicurezza e utilizzo. Non usa le conversazioni per prendere
          decisioni esclusivamente automatizzate che producano effetti giuridici
          o analogamente significativi su di te.
        </p>
      </LegalSection>

      <LegalSection id="sicurezza" number="10" title="Sicurezza">
        <p>
          Applichiamo misure tecniche e organizzative proporzionate al rischio,
          tra cui controllo degli accessi, separazione dei dati per account,
          protezione delle sessioni, rimozione degli allegati scaduti e
          cifratura dei trace AI sensibili. I dati inviati ai provider esterni
          seguono anche le loro misure di sicurezza.
        </p>
        <p>
          Nessun servizio online è completamente sicuro. Non condividere con
          Anthon password, chiavi private, dati di pagamento completi o
          informazioni che non vuoi trasmettere a un servizio online e ai suoi
          provider tecnici.
        </p>
      </LegalSection>

      <LegalSection id="aggiornamenti" number="11" title="Aggiornamenti">
        <p>
          Possiamo aggiornare questa informativa quando cambiano il servizio, i
          fornitori, le finalità o la normativa. La versione vigente è sempre
          disponibile su questa pagina; per modifiche sostanziali useremo un
          avviso ragionevole quando necessario.
        </p>
        <p>
          Per richieste, dubbi o per esercitare i tuoi diritti, contattaci a{" "}
          <a href="mailto:anthon.chat@gmail.com">anthon.chat@gmail.com</a>. Per
          le regole di utilizzo del servizio, consulta le{" "}
          <Link href="/terms">Condizioni d'uso</Link>.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
