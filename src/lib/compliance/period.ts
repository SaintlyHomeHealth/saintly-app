import { appCalendarMidnightUtc, formatAppCalendarYmd, getAppNowForDateTimeInput } from "@/lib/datetime/app-timezone";

export type Quarter = 1 | 2 | 3 | 4;

export function isQuarter(value: number): value is Quarter {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function quarterLabel(quarter: number): string {
  return `Q${quarter}`;
}

export function periodLabel(year: number, quarter: number): string {
  return `${quarterLabel(quarter)} ${year}`;
}

export function monthLabel(year: number, month: number): string {
  const date = appCalendarMidnightUtc(`${year}-${pad2(month)}-01`);
  if (!date) return `${month}/${year}`;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** Inclusive Phoenix calendar bounds for a quarter. */
export function quarterBounds(year: number, quarter: number): { start: string; end: string } {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = [31, 30, 30, 31][quarter - 1] ?? 31;
  return {
    start: `${year}-${pad2(startMonth)}-01`,
    end: `${year}-${pad2(endMonth)}-${pad2(lastDay)}`,
  };
}

export function quarterOfMonth(month: number): Quarter {
  return (Math.floor((month - 1) / 3) + 1) as Quarter;
}

export function periodFromYmd(ymd: string): { year: number; quarter: Quarter } {
  const [y, m] = ymd.split("-").map((part) => Number.parseInt(part, 10));
  const year = Number.isFinite(y) ? y : new Date().getFullYear();
  const month = Number.isFinite(m) ? m : 1;
  return { year, quarter: quarterOfMonth(month) };
}

export function phoenixTodayYmd(now: Date = new Date()): string {
  return formatAppCalendarYmd(now) || now.toISOString().slice(0, 10);
}

export function phoenixNowParts(now: Date = new Date()): { ymd: string; time: string } {
  const local = getAppNowForDateTimeInput(now);
  if (local.length >= 16) {
    return { ymd: local.slice(0, 10), time: local.slice(11, 16) };
  }
  const ymd = phoenixTodayYmd(now);
  return { ymd, time: "00:00" };
}

export function parsePeriodParams(
  yearRaw: string | undefined,
  quarterRaw: string | undefined,
  todayYmd: string
): { year: number; quarter: Quarter } {
  const current = periodFromYmd(todayYmd);
  const yearNum = Number.parseInt(yearRaw ?? "", 10);
  const quarterNum = Number.parseInt(quarterRaw ?? "", 10);
  const year = Number.isFinite(yearNum) && yearNum >= 2000 && yearNum <= 2100 ? yearNum : current.year;
  const quarter = isQuarter(quarterNum) ? quarterNum : current.quarter;
  return { year, quarter };
}

export function yearChoices(todayYmd: string): number[] {
  const { year } = periodFromYmd(todayYmd);
  return [year - 2, year - 1, year, year + 1];
}

export function quarterRangeIso(year: number, quarter: number): { start: string; end: string } {
  const { start } = quarterBounds(year, quarter);
  const next = quarter === 4 ? { year: year + 1, quarter: 1 } : { year, quarter: quarter + 1 };
  const nextStart = quarterBounds(next.year, next.quarter).start;
  return {
    start: appCalendarMidnightUtc(start)?.toISOString() ?? `${start}T07:00:00.000Z`,
    end: appCalendarMidnightUtc(nextStart)?.toISOString() ?? `${nextStart}T07:00:00.000Z`,
  };
}

export function monthBounds(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${pad2(month)}-01`;
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const nextStart = `${next.year}-${pad2(next.month)}-01`;
  const endMs = Date.parse(`${nextStart}T00:00:00Z`) - 86400000;
  const end = new Date(endMs).toISOString().slice(0, 10);
  return { start, end };
}

export function monthRangeIso(year: number, month: number): { start: string; end: string } {
  const { start } = monthBounds(year, month);
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const nextStart = `${next.year}-${pad2(next.month)}-01`;
  return {
    start: appCalendarMidnightUtc(start)?.toISOString() ?? `${start}T07:00:00.000Z`,
    end: appCalendarMidnightUtc(nextStart)?.toISOString() ?? `${nextStart}T07:00:00.000Z`,
  };
}

export function monthsInQuarter(quarter: number): number[] {
  const start = (quarter - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}

export function complianceHref(
  path: string,
  year: number,
  quarter: number,
  extra?: Record<string, string | number | undefined>
): string {
  const params = new URLSearchParams({ year: String(year), quarter: String(quarter) });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined && value !== "") params.set(key, String(value));
    }
  }
  return `${path}?${params.toString()}`;
}

export function compareYmd(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
