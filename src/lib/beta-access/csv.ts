type BetaSubscriberCsvRow = {
  email: string;
  releaseOptInAt: Date;
  updatesOptInAt: Date | null;
  updatesOptOutAt: Date | null;
  consentVersion: string;
  createdAt: Date;
};

const FORMULA_PREFIX = /^[=+\-@]/;

function csvCell(value: string): string {
  const neutralized = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return `"${neutralized.replaceAll('"', '""')}"`;
}

export function buildBetaSubscribersCsv(
  subscribers: BetaSubscriberCsvRow[],
): string {
  const rows = [
    [
      "Email",
      "Notifica rilascio",
      "Consenso aggiornamenti",
      "Aggiornamenti attivi",
      "Stato verifica",
      "Versione consenso",
      "Data iscrizione",
    ],
    ...subscribers.map((subscriber) => [
      subscriber.email,
      subscriber.releaseOptInAt.toISOString(),
      subscriber.updatesOptInAt?.toISOString() ?? "",
      subscriber.updatesOptInAt && !subscriber.updatesOptOutAt ? "Sì" : "No",
      "Non verificata",
      subscriber.consentVersion,
      subscriber.createdAt.toISOString(),
    ]),
  ];

  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
