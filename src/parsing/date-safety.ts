export type CalendarDate = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly iso: string;
};

export type DateParseResult =
  | { readonly status: "VALID"; readonly date: CalendarDate; readonly raw: string }
  | { readonly status: "INVALID"; readonly raw: string };

export type TemporalClassification =
  | "TODAY"
  | "NORMAL_LATE_CLOSING"
  | "HISTORICAL"
  | "FUTURE"
  | "INVALID";

const DATE_PATTERN = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/;
const WIB = "Asia/Jakarta";

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseBusinessDate(raw: string): DateParseResult {
  const value = raw.trim();
  const match = DATE_PATTERN.exec(value);
  if (!match) return { status: "INVALID", raw };

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return { status: "INVALID", raw };
  }
  return {
    status: "VALID",
    raw,
    date: {
      year,
      month,
      day,
      iso: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    }
  };
}

function wibParts(now: Date): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WIB,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second")
  };
}

function dayNumber(date: { year: number; month: number; day: number }): number {
  return Date.UTC(date.year, date.month - 1, date.day) / 86400000;
}

export function classifyTemporalDate(date: CalendarDate | undefined, now: Date): TemporalClassification {
  if (!date) return "INVALID";
  const current = wibParts(now);
  const target = dayNumber(date);
  const today = dayNumber(current);
  if (target === today) return "TODAY";
  if (target > today) return "FUTURE";
  if (target === today - 1 && (
    current.hour < 3
    || (current.hour === 3 && current.minute === 0 && current.second === 0)
  )) {
    return "NORMAL_LATE_CLOSING";
  }
  return "HISTORICAL";
}
