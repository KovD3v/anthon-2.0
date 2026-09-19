import { z } from "zod";

export const memoryExpirySchema = z.object({
  expression: z.string().trim().min(1).max(100),
  timeZone: z.string().trim().max(80).nullable().optional(),
});

export type MemoryExpiry = z.infer<typeof memoryExpirySchema>;

export function formatMemoryValidity(input: {
  observedAt?: Date;
  expiresAt?: Date | null;
}) {
  if (!input.expiresAt) return "";
  return ` [valida prima di ${input.expiresAt.toISOString()}${input.observedAt ? `; date relative riferite al messaggio del ${input.observedAt.toISOString()}` : ""}]`;
}

export function validTimeZone(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (!value.includes("/") && value !== "UTC" && value !== "GMT") return null;
  try {
    return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions()
      .timeZone;
  } catch {
    return null;
  }
}

export function messageTimeZone(metadata: unknown): string | null {
  return metadata && typeof metadata === "object" && "timeZone" in metadata
    ? validTimeZone(metadata.timeZone)
    : null;
}

export async function knownMemoryTimeZone(userId: string) {
  const { prisma } = await import("@/lib/db");
  const fact = await prisma.memory.findFirst({
    where: {
      userId,
      key: { in: ["user_timezone", "timezone"] },
      origin: { in: ["EXPLICIT", "CONFIRMED"] },
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { updatedAt: "desc" },
    select: { value: true },
  });
  const value = fact?.value;
  return value && typeof value === "object" && "content" in value
    ? validTimeZone(value.content)
    : null;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function calendarParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return [
    value("year"),
    value("month"),
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  ];
}

function calendarUtc(parts: number[]) {
  return Date.UTC(
    parts[0],
    parts[1] - 1,
    parts[2],
    parts[3] ?? 0,
    parts[4] ?? 0,
    parts[5] ?? 0,
  );
}

// Test both sides of a timezone transition. Nonexistent or repeated local times
// need clarification rather than silently choosing a DST offset.
function localInstant(parts: number[], timeZone: string): Date | null {
  const wallTime = calendarUtc(parts);
  const offsets = new Set(
    [-36, 0, 36].map((hours) => {
      const sample = wallTime + hours * 3_600_000;
      return calendarUtc(calendarParts(new Date(sample), timeZone)) - sample;
    }),
  );
  const candidates = [...offsets]
    .map((offset) => new Date(wallTime - offset))
    .filter((date) => calendarUtc(calendarParts(date, timeZone)) === wallTime);
  return candidates.length === 1 ? candidates[0] : null;
}

const weekdays = [
  ["sunday", "domenica"],
  ["monday", "lunedi"],
  ["tuesday", "martedi"],
  ["wednesday", "mercoledi"],
  ["thursday", "giovedi"],
  ["friday", "venerdi"],
  ["saturday", "sabato"],
];
const months = [
  ["january", "gennaio"],
  ["february", "febbraio"],
  ["march", "marzo"],
  ["april", "aprile"],
  ["may", "maggio"],
  ["june", "giugno"],
  ["july", "luglio"],
  ["august", "agosto"],
  ["september", "settembre"],
  ["october", "ottobre"],
  ["november", "novembre"],
  ["december", "dicembre"],
];

/** Dates without a time expire at the following local midnight. */
export function resolveMemoryExpiry(input: {
  expiry: MemoryExpiry;
  sourceText: string;
  observedAt: Date;
  timeZone?: string | null;
  now?: Date;
}): Date | null {
  const expression = input.expiry.expression.trim();
  // The date expression must be copied from the user's evidence, never invented
  // by extraction or a tool call. Source timestamps come from persisted messages.
  const normalizedExpression = normalize(expression);
  const escapedExpression = normalizedExpression.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const sourceText = normalize(input.sourceText);
  if (!new RegExp(`\\b${escapedExpression}\\b`).test(sourceText)) return null;
  if (
    normalizedExpression === "tomorrow" &&
    /day after tomorrow/.test(sourceText)
  )
    return null;
  const now = input.now ?? new Date();
  if (!Number.isFinite(input.observedAt.getTime())) return null;
  let result: Date | null = null;
  if (z.iso.datetime({ offset: true }).safeParse(expression).success) {
    result = new Date(expression);
  } else {
    const explicitZone = input.expiry.timeZone;
    if (explicitZone && !input.sourceText.includes(explicitZone)) return null;
    const timeZone = validTimeZone(explicitZone ?? input.timeZone);
    if (!timeZone) return null;
    let dateText = normalize(expression);
    const time = dateText.match(
      /(?:t| alle | at | )(\d{2}):(\d{2})(?::(\d{2}))?$/,
    );
    if (time) dateText = dateText.slice(0, time.index).trim();
    const source = calendarParts(input.observedAt, timeZone);
    let dateParts: number[] | null = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
      dateParts = dateText.split("-").map(Number);
    } else {
      const namedDate = dateText.match(/^(\d{1,2}) ([a-z]+) (\d{4})$/);
      const englishDate = dateText.match(/^([a-z]+) (\d{1,2}),? (\d{4})$/);
      if (namedDate || englishDate) {
        const monthName = namedDate?.[2] ?? englishDate?.[1] ?? "";
        const month =
          months.findIndex((names) => names.includes(monthName)) + 1;
        dateParts = [
          Number(namedDate?.[3] ?? englishDate?.[3]),
          month,
          Number(namedDate?.[1] ?? englishDate?.[2]),
        ];
      } else {
        let days: number | undefined;
        if (["oggi", "today"].includes(dateText)) days = 0;
        if (["domani", "tomorrow"].includes(dateText)) days = 1;
        if (["dopodomani", "day after tomorrow"].includes(dateText)) days = 2;
        const relative = dateText.match(
          /^(?:tra|fra|in) (\d{1,3}) (?:giorni|days)$/,
        );
        if (relative) days = Number(relative[1]);
        const weekday = weekdays.findIndex((names) =>
          names.includes(dateText.replace(/^(?:this|questo|questa) /, "")),
        );
        if (weekday >= 0) {
          const dayName = dateText.replace(/^(?:this|questo|questa) /, "");
          if (
            new RegExp(
              `(?:next|prossimo|prossima) ${dayName}|${dayName} (?:prossimo|prossima)`,
            ).test(normalize(input.sourceText))
          )
            return null;
          days =
            (weekday -
              new Date(calendarUtc(source.slice(0, 3))).getUTCDay() +
              7) %
            7;
        }
        if (days === undefined) return null;
        const calendar = new Date(
          calendarUtc(source.slice(0, 3)) + days * 86_400_000,
        );
        dateParts = [
          calendar.getUTCFullYear(),
          calendar.getUTCMonth() + 1,
          calendar.getUTCDate(),
        ];
      }
    }
    const calendar = new Date(calendarUtc(dateParts));
    if (
      calendar.getUTCFullYear() !== dateParts[0] ||
      calendar.getUTCMonth() + 1 !== dateParts[1] ||
      calendar.getUTCDate() !== dateParts[2]
    )
      return null;
    if (time) {
      const clock = time.slice(1).map((part) => Number(part ?? 0));
      if (clock[0] > 23 || clock[1] > 59 || clock[2] > 59) return null;
      result = localInstant([...dateParts, ...clock], timeZone);
    } else {
      calendar.setUTCDate(calendar.getUTCDate() + 1);
      result = localInstant(
        [
          calendar.getUTCFullYear(),
          calendar.getUTCMonth() + 1,
          calendar.getUTCDate(),
        ],
        timeZone,
      );
    }
  }
  return result && result > input.observedAt && result > now ? result : null;
}
