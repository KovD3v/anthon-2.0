import { describe, expect, it } from "vitest";
import { buildBetaSubscribersCsv } from "./csv";

describe("beta subscriber CSV", () => {
  it("exports consent evidence and unverified status", () => {
    const csv = buildBetaSubscribersCsv([
      {
        email: "person@example.com",
        releaseOptInAt: new Date("2026-08-16T10:00:00.000Z"),
        updatesOptInAt: new Date("2026-08-16T10:01:00.000Z"),
        updatesOptOutAt: null,
        consentVersion: "privacy-2026-08-16",
        createdAt: new Date("2026-08-16T10:00:00.000Z"),
      },
    ]);

    expect(csv).toContain('"Email","Notifica rilascio"');
    expect(csv).toContain('"person@example.com","2026-08-16T10:00:00.000Z"');
    expect(csv).toContain('"Sì","Non verificata","privacy-2026-08-16"');
  });

  it.each(["=cmd@example.com", "+sum@example.com", "-x@example.com", "@x"])(
    "neutralizes spreadsheet formula prefix in %s",
    (email) => {
      const csv = buildBetaSubscribersCsv([
        {
          email,
          releaseOptInAt: new Date("2026-08-16T10:00:00.000Z"),
          updatesOptInAt: null,
          updatesOptOutAt: null,
          consentVersion: "privacy-2026-08-16",
          createdAt: new Date("2026-08-16T10:00:00.000Z"),
        },
      ]);

      expect(csv).toContain(`"'${email.replaceAll('"', '""')}"`);
    },
  );

  it("quotes double quotes and line breaks without breaking rows", () => {
    const csv = buildBetaSubscribersCsv([
      {
        email: 'person"\n@example.com',
        releaseOptInAt: new Date("2026-08-16T10:00:00.000Z"),
        updatesOptInAt: null,
        updatesOptOutAt: null,
        consentVersion: "privacy-2026-08-16",
        createdAt: new Date("2026-08-16T10:00:00.000Z"),
      },
    ]);

    expect(csv).toContain('"person""\n@example.com"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});
