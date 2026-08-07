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
  title: "Condizioni d'uso",
  description:
    "Le condizioni che regolano l'accesso e l'uso del servizio Anthon.",
};

const sections: LegalPageSection[] = [
  { id: "ambito", label: "Ambito e accettazione" },
  { id: "account", label: "Account e accesso" },
  { id: "servizio", label: "Il servizio Anthon" },
  { id: "intelligenza-artificiale", label: "Limiti dell'IA" },
  { id: "contenuti", label: "I tuoi contenuti" },
  { id: "uso-accettabile", label: "Uso accettabile" },
  { id: "piani", label: "Piani e pagamenti" },
  { id: "canali", label: "Canali di terze parti" },
  { id: "proprieta", label: "Proprietà intellettuale" },
  { id: "sospensione", label: "Sospensione e chiusura" },
  { id: "responsabilita", label: "Responsabilità" },
  { id: "modifiche", label: "Modifiche e legge applicabile" },
];

export default function TermsPage() {
  return (
    <LegalPageLayout
      kind="terms"
      eyebrow="Condizioni d'uso"
      title="Usa Anthon con consapevolezza"
      description="Regole semplici per usare il mental coach basato sull'IA, proteggere il tuo account e sapere cosa aspettarti dal servizio."
      updatedAt="5 agosto 2026"
      sections={sections}
    >
      <LegalSection id="ambito" number="01" title="Ambito e accettazione">
        <p>
          Queste Condizioni d'uso regolano l'accesso e l'utilizzo di Anthon,
          incluso il sito, la chat, le funzioni di memoria, le funzioni vocali e
          i canali collegati quando disponibili. Usando Anthon, dichiari di aver
          letto e accettato queste condizioni e la nostra{" "}
          <Link href="/privacy">Informativa privacy</Link>.
        </p>
        <p>
          Se usi Anthon per conto di un'organizzazione, dichiari di avere il
          potere di vincolare quell'organizzazione. Se non accetti una parte
          delle condizioni, non utilizzare il servizio.
        </p>
      </LegalSection>

      <LegalSection id="account" number="02" title="Account e accesso">
        <p>
          Puoi provare alcune funzioni come ospite. Per conservare il tuo
          contesto e accedere a funzioni più ampie potresti dover creare un
          account. L'autenticazione e, quando applicabile, la gestione di
          organizzazioni e abbonamenti sono fornite tramite Clerk.
        </p>
        <ul>
          <li>fornisci informazioni accurate e mantienile aggiornate;</li>
          <li>proteggi le tue credenziali e non condividere il tuo account;</li>
          <li>avvisaci rapidamente se sospetti un accesso non autorizzato;</li>
          <li>
            sei responsabile delle attività svolte dal tuo account, salvo che tu
            dimostri che non potevi ragionevolmente impedirle.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="servizio" number="03" title="Il servizio Anthon">
        <p>
          Anthon è uno strumento di supporto alla riflessione e alla pratica
          mentale nello sport. Può aiutarti a esplorare obiettivi, pressione,
          fiducia, concentrazione e abitudini attraverso conversazioni testuali
          o vocali.
        </p>
        <p>
          Le funzioni, i modelli, i limiti di utilizzo, la conservazione degli
          allegati e i canali disponibili possono variare in base al piano e
          alla configurazione del servizio. Cerchiamo di mantenere Anthon
          disponibile, ma non garantiamo che ogni funzione sia sempre attiva,
          ininterrotta o priva di errori.
        </p>
      </LegalSection>

      <LegalSection
        id="intelligenza-artificiale"
        number="04"
        title="Limiti dell'intelligenza artificiale"
      >
        <p>
          Le risposte di Anthon sono generate da sistemi di intelligenza
          artificiale. Possono essere incomplete, inesatte, non aggiornate o non
          adatte alla tua situazione. Valuta sempre le risposte con il tuo
          giudizio e, quando serve, con l'aiuto di un professionista
          qualificato.
        </p>
        <p>
          Anthon non è un medico, psicologo, psicoterapeuta, fisioterapista,
          avvocato o consulente finanziario. Il servizio non fornisce diagnosi,
          terapia, prescrizioni, valutazioni cliniche o indicazioni di emergenza
          e non sostituisce un professionista. In una situazione di pericolo
          immediato contatta i servizi di emergenza del tuo Paese, in Italia il{" "}
          <strong>112</strong>.
        </p>
      </LegalSection>

      <LegalSection id="contenuti" number="05" title="I tuoi contenuti">
        <p>
          Mantieni i diritti sui messaggi, sui file, sulle immagini, sulle
          registrazioni e sugli altri materiali che invii ad Anthon. Ci concedi
          solo il diritto non esclusivo e limitato di ospitare, riprodurre,
          elaborare, trasmettere e trasformare quei contenuti nella misura
          necessaria per fornire, proteggere e mantenere il servizio, come
          descritto nella <Link href="/privacy">Informativa privacy</Link>.
        </p>
        <p>
          Sei responsabile di avere i diritti e le autorizzazioni necessari per
          usare e caricare ciò che invii, incluso il contenuto che riguarda
          altre persone. Le risposte generate da Anthon possono non essere
          uniche e non ti garantiamo diritti esclusivi su di esse.
        </p>
      </LegalSection>

      <LegalSection id="uso-accettabile" number="06" title="Uso accettabile">
        <p>
          Devi usare Anthon in modo lecito, rispettoso e coerente con lo scopo
          del servizio. Non puoi:
        </p>
        <ul>
          <li>violare leggi, diritti o sicurezza di altre persone;</li>
          <li>
            usare il servizio per minacce, molestie, frodi, abuso, spam,
            attività illegali o contenuti che mettano altri in pericolo;
          </li>
          <li>
            caricare malware, tentare di eludere limiti o controlli, fare
            scraping sistematico o sondare il servizio senza autorizzazione;
          </li>
          <li>
            usare Anthon per decisioni ad alto impatto su altre persone, per
            diagnosi o trattamento sanitario, o come sostituto di un intervento
            di emergenza;
          </li>
          <li>
            decompilare, rivendere, duplicare o sfruttare il servizio oltre
            quanto consentito dalla legge o da un'autorizzazione scritta.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="piani" number="07" title="Piani e pagamenti">
        <p>
          I prezzi, le funzionalità e i limiti applicabili sono quelli mostrati
          nella pagina <Link href="/pricing">Prezzi</Link> e durante il
          checkout. Gli abbonamenti possono rinnovarsi secondo la frequenza
          indicata al momento dell'acquisto. Puoi gestire o annullare il piano
          attraverso gli strumenti di fatturazione disponibili nel tuo account;
          l'annullamento normalmente vale per il periodo successivo, salvo
          quanto previsto dalla legge o dal checkout.
        </p>
        <p>
          Restano salvi i diritti inderogabili dei consumatori, inclusi quelli
          relativi a recesso, rimborsi e conformità del servizio quando
          applicabili. Non promettiamo accesso illimitato: possiamo applicare
          limiti tecnici, di sicurezza e di utilizzo indicati per il tuo piano.
        </p>
      </LegalSection>

      <LegalSection id="canali" number="08" title="Canali di terze parti">
        <p>
          Se colleghi Telegram o WhatsApp, Anthon riceve e invia messaggi
          attraverso quei provider per eseguire la tua richiesta. L'uso di
          Telegram e WhatsApp resta soggetto alle loro condizioni e informative
          privacy. Sei responsabile di collegare il canale corretto e di non
          usare il numero o l'account di un'altra persona senza autorizzazione.
        </p>
        <p>
          Un'interruzione, un limite o una modifica di un canale esterno può
          ridurre o sospendere la relativa funzione di Anthon senza rendere
          indisponibile il resto del servizio.
        </p>
      </LegalSection>

      <LegalSection id="proprieta" number="09" title="Proprietà intellettuale">
        <p>
          Anthon, il nome, il marchio, il software, il design, i testi e i
          materiali del servizio appartengono ad Anthon AI o ai suoi licenzianti
          e sono protetti dalle leggi applicabili. Ti concediamo una licenza
          personale, non esclusiva, non trasferibile e revocabile per usare il
          servizio per il suo scopo previsto.
        </p>
        <p>
          Se ci invii suggerimenti o feedback, possiamo usarli per migliorare
          Anthon senza obbligo di compenso, purché non divulghiamo i tuoi
          contenuti personali oltre quanto descritto nell'Informativa privacy.
        </p>
      </LegalSection>

      <LegalSection id="sospensione" number="10" title="Sospensione e chiusura">
        <p>
          Possiamo limitare, sospendere o chiudere un account quando è
          ragionevolmente necessario per applicare queste condizioni, proteggere
          utenti o sistemi, prevenire frodi, rispettare la legge o gestire un
          mancato pagamento. Quando possibile, forniremo una spiegazione e
          un'opportunità di rimediare.
        </p>
        <p>
          Puoi smettere di usare Anthon in qualsiasi momento. Se hai un account,
          puoi richiederne la cancellazione dalle impostazioni disponibili o
          scrivendo a{" "}
          <a href="mailto:anthon.chat@gmail.com">anthon.chat@gmail.com</a>. La
          chiusura non elimina gli obblighi o i diritti maturati prima della
          cessazione.
        </p>
      </LegalSection>

      <LegalSection id="responsabilita" number="11" title="Responsabilità">
        <p>
          Anthon è fornito nella misura consentita dalla legge e in base alla
          disponibilità tecnica. Non garantiamo risultati sportivi, personali o
          economici e non siamo responsabili delle decisioni che prendi sulla
          base di una risposta generata dal servizio.
        </p>
        <p>
          Nulla in queste condizioni esclude o limita una responsabilità che non
          può essere esclusa o limitata per legge, inclusa la responsabilità per
          dolo o colpa grave e i diritti inderogabili del consumatore. Per il
          resto, la responsabilità di Anthon è limitata al danno diretto
          ragionevolmente prevedibile derivante dall'uso del servizio, nei
          limiti massimi consentiti dalla legge applicabile.
        </p>
      </LegalSection>

      <LegalSection
        id="modifiche"
        number="12"
        title="Modifiche e legge applicabile"
      >
        <p>
          Possiamo aggiornare queste condizioni per riflettere cambiamenti del
          servizio, della legge o delle misure di sicurezza. Pubblicheremo la
          versione aggiornata su questa pagina e aggiorneremo la data in alto;
          per modifiche sostanziali daremo un avviso ragionevole quando
          richiesto.
        </p>
        <p>
          Per gli utenti consumatori restano applicabili le norme inderogabili e
          il foro competente previsto dalla legge del loro Paese di residenza.
          Per gli utenti professionali, salvo norme inderogabili, queste
          condizioni sono disciplinate dalla legge italiana e dalle competenti
          autorità giudiziarie italiane.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
