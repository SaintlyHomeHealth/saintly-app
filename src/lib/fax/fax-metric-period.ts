/**
 * Phoenix calendar windows for Fax Center incoming / sent / failed counts.
 * Week starts Sunday. The next control stops once the following window begins after today.
 */

import { APP_TIME_ZONE, appCalendarMidnightUtc, formatAppCalendarYmd } from "@/lib/datetime/app-timezone";

export const FAX_METRIC_SPANS = ["day", "week", "month", "year"] as const;

export type FaxMetricSpan = (typeof FAX_METRIC_SPANS)[number];

export const FAX_METRIC_SPAN_LABELS: Record<FaxMetricSpan, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  year: "Year",
};

export type FaxMetricWindow = {
  span: FaxMetricSpan;
  /** Phoenix YYYY-MM-DD the controls are anchored on. Never after today. */
  anchorYmd: string;
  todayYmd: string;
  /** Inclusive Phoenix date. */
  startYmd: string;
  /** Exclusive Phoenix date. */
  endYmd: string;
  startIso: string;
  endIso: string;
  label: string;
  previousAnchorYmd: string;
  nextAnchorYmd: string;
  canGoNext: boolean;
};

export const FAX_ARRIVED_PRESETS = ["today", "yesterday", "week", "all"] as const;

export type FaxArrivedPreset = (typeof FAX_ARRIVED_PRESETS)[number];

export const FAX_ARRIVED_LABELS: Record<FaxArrivedPreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "Week",
  all: "All",
};

/** Missing or unknown values open on today so newly arrived faxes are the first thing staff see. */
export function parseFaxArrivedPreset(raw: string): FaxArrivedPreset {
  const value = raw.trim().toLowerCase();
  return (FAX_ARRIVED_PRESETS as readonly string[]).includes(value) ? (value as FaxArrivedPreset) : "today";
}

/**
 * Phoenix window for the inbox arrival list. `all` has no bounds.
 * Week is the current Sunday–Saturday week.
 */
export function faxArrivedWindow(
  preset: FaxArrivedPreset,
  now: Date = new Date()
): { startIso: string | null; endIso: string | null; label: string } {
  if (preset === "all") {
    return { startIso: null, endIso: null, label: "All" };
  }
  if (preset === "yesterday") {
    const today = resolveFaxMetricPeriod({ spanRaw: "day", dayRaw: "", now });
    const day = resolveFaxMetricPeriod({ spanRaw: "day", dayRaw: today.previousAnchorYmd, now });
    return { startIso: day.startIso, endIso: day.endIso, label: "Yesterday" };
  }
  if (preset === "week") {
    const week = resolveFaxMetricPeriod({ spanRaw: "week", dayRaw: "", now });
    return { startIso: week.startIso, endIso: week.endIso, label: week.label };
  }
  const today = resolveFaxMetricPeriod({ spanRaw: "day", dayRaw: "", now });
  return { startIso: today.startIso, endIso: today.endIso, label: "Today" };
}

export function parseFaxMetricSpan(raw: string): FaxMetricSpan {
  const value = raw.trim().toLowerCase();
  return (FAX_METRIC_SPANS as readonly string[]).includes(value) ? (value as FaxMetricSpan) : "day";
}

/**
 * PostgREST `or` filter: timestamp column in [start, end), else created_at when that column is null.
 * ISO values are quoted so colons survive the filter parser.
 */
export function faxPeriodOrFilter(
  column: "received_at" | "sent_at" | "failed_at",
  startIso: string,
  endIso: string
): string {
  const start = `"${startIso}"`;
  const end = `"${endIso}"`;
  return `and(${column}.gte.${start},${column}.lt.${end}),and(${column}.is.null,created_at.gte.${start},created_at.lt.${end})`;
}

export function resolveFaxMetricPeriod(input: {
  spanRaw: string;
  dayRaw: string;
  now?: Date;
}): FaxMetricWindow {
  const now = input.now ?? new Date();
  const todayYmd = formatAppCalendarYmd(now) || "1970-01-01";
  const span = parseFaxMetricSpan(input.spanRaw);
  const requested = input.dayRaw.trim();
  const anchorYmd = clampYmd(isYmd(requested) ? requested : todayYmd, todayYmd);
  const bounds = windowBounds(span, anchorYmd);
  const previousAnchorYmd = shiftAnchor(span, anchorYmd, -1);
  const nextAnchorYmd = shiftAnchor(span, anchorYmd, 1);
  const nextStartYmd = windowBounds(span, nextAnchorYmd).startYmd;

  return {
    span,
    anchorYmd,
    todayYmd,
    startYmd: bounds.startYmd,
    endYmd: bounds.endYmd,
    startIso: phoenixMidnightIso(bounds.startYmd),
    endIso: phoenixMidnightIso(bounds.endYmd),
    label: periodLabel(span, bounds.startYmd, bounds.endYmd, todayYmd),
    previousAnchorYmd,
    nextAnchorYmd,
    canGoNext: nextStartYmd <= todayYmd,
  };
}

function isYmd(value: string): boolean {
  return parseYmd(value) !== null;
}

function parseYmd(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return { y, m, d };
}

function ymdFromParts(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function clampYmd(ymd: string, todayYmd: string): string {
  return ymd > todayYmd ? todayYmd : ymd;
}

function addCalendarDays(ymd: string, days: number): string {
  const parts = parseYmd(ymd);
  if (!parts) return ymd;
  const utc = new Date(Date.UTC(parts.y, parts.m - 1, parts.d + days));
  return ymdFromParts(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

function addMonths(ymd: string, delta: number): string {
  const parts = parseYmd(ymd);
  if (!parts) return ymd;
  const index = parts.y * 12 + (parts.m - 1) + delta;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return ymdFromParts(y, m, Math.min(parts.d, last));
}

function addYears(ymd: string, delta: number): string {
  const parts = parseYmd(ymd);
  if (!parts) return ymd;
  const y = parts.y + delta;
  const last = new Date(Date.UTC(y, parts.m, 0)).getUTCDate();
  return ymdFromParts(y, parts.m, Math.min(parts.d, last));
}

function startOfWeekSunday(ymd: string): string {
  const parts = parseYmd(ymd);
  if (!parts) return ymd;
  const dow = new Date(Date.UTC(parts.y, parts.m - 1, parts.d)).getUTCDay();
  return addCalendarDays(ymd, -dow);
}

function windowBounds(span: FaxMetricSpan, anchorYmd: string): { startYmd: string; endYmd: string } {
  if (span === "week") {
    const startYmd = startOfWeekSunday(anchorYmd);
    return { startYmd, endYmd: addCalendarDays(startYmd, 7) };
  }
  if (span === "month") {
    const parts = parseYmd(anchorYmd);
    const startYmd = parts ? ymdFromParts(parts.y, parts.m, 1) : anchorYmd;
    return { startYmd, endYmd: addMonths(startYmd, 1) };
  }
  if (span === "year") {
    const parts = parseYmd(anchorYmd);
    const startYmd = parts ? ymdFromParts(parts.y, 1, 1) : anchorYmd;
    return { startYmd, endYmd: addYears(startYmd, 1) };
  }
  return { startYmd: anchorYmd, endYmd: addCalendarDays(anchorYmd, 1) };
}

function shiftAnchor(span: FaxMetricSpan, anchorYmd: string, delta: number): string {
  if (span === "week") return addCalendarDays(anchorYmd, delta * 7);
  if (span === "month") return addMonths(anchorYmd, delta);
  if (span === "year") return addYears(anchorYmd, delta);
  return addCalendarDays(anchorYmd, delta);
}

function phoenixMidnightIso(ymd: string): string {
  return appCalendarMidnightUtc(ymd)?.toISOString() ?? `${ymd}T07:00:00.000Z`;
}

function formatPhoenix(ymd: string, options: Intl.DateTimeFormatOptions): string {
  const instant = appCalendarMidnightUtc(ymd);
  if (!instant) return ymd;
  return new Intl.DateTimeFormat("en-US", { timeZone: APP_TIME_ZONE, ...options }).format(instant);
}

function periodLabel(span: FaxMetricSpan, startYmd: string, endYmd: string, todayYmd: string): string {
  const includesToday = startYmd <= todayYmd && todayYmd < endYmd;
  if (span === "day") {
    const date = formatPhoenix(startYmd, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    return includesToday ? `Today · ${date}` : date;
  }
  if (span === "week") {
    const inclusiveEnd = addCalendarDays(endYmd, -1);
    const sameYear = startYmd.slice(0, 4) === inclusiveEnd.slice(0, 4);
    const range = sameYear
      ? `${formatPhoenix(startYmd, { month: "short", day: "numeric" })} – ${formatPhoenix(inclusiveEnd, { month: "short", day: "numeric", year: "numeric" })}`
      : `${formatPhoenix(startYmd, { month: "short", day: "numeric", year: "numeric" })} – ${formatPhoenix(inclusiveEnd, { month: "short", day: "numeric", year: "numeric" })}`;
    return includesToday ? `This week · ${range}` : range;
  }
  if (span === "month") {
    const name = formatPhoenix(startYmd, { month: "long", year: "numeric" });
    return includesToday ? `This month · ${name}` : name;
  }
  const year = startYmd.slice(0, 4);
  return includesToday ? `This year · ${year}` : year;
}
