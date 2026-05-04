/**
 * Agency clock: Saintly business times are expressed in America/Phoenix (MST, no DST).
 * Store instants as UTC ISO strings (`timestamptz`); interpret naive `datetime-local`
 * payloads as Phoenix wall time, then persist UTC.
 */

export const APP_TIME_ZONE = "America/Phoenix" as const;

/**
 * Offset for America/Phoenix (no daylight saving). Used only to parse naive
 * `YYYY-MM-DDTHH:mm` values from `<input type="datetime-local" />` and similar.
 */
const APP_WALL_OFFSET = "-07:00";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function coerceInstant(input: Date | string | number): Date | null {
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Compact date + time for tables and admin UI (`M/D/YY, H:MM AM` style).
 */
export function formatAppDateTime(
  input: Date | string | number | null | undefined,
  empty = "—",
  options?: Omit<Intl.DateTimeFormatOptions, "timeZone">
): string {
  if (input === null || input === undefined || input === "") return empty;
  const d = coerceInstant(input);
  if (!d) return empty;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: APP_TIME_ZONE,
    ...(options ?? {}),
  }).format(d);
}

/**
 * Date-only label in Phoenix (`MMM D, YYYY` medium style by default).
 */
export function formatAppDate(
  input: Date | string | number | null | undefined,
  empty = "—",
  options?: Omit<Intl.DateTimeFormatOptions, "timeZone">
): string {
  if (input === null || input === undefined || input === "") return empty;
  const d = coerceInstant(input);
  if (!d) return empty;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: APP_TIME_ZONE,
    ...(options ?? {}),
  }).format(d);
}

/** `YYYY-MM-DD` for Phoenix calendar corresponding to instant `d`. */
export function formatAppCalendarYmd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Start of Phoenix calendar day `YYYY-MM-DD` as a UTC `Date` (midnight Phoenix).
 */
export function appCalendarMidnightUtc(ymd: string): Date | null {
  const t = ymd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const ms = Date.parse(`${t}T00:00:00${APP_WALL_OFFSET}`);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/** `YYYY-MM-DDTHH:mm` suitable for `<input type="datetime-local" />` (Phoenix wall time). */
export function isoInstantToDatetimeLocalInput(iso: string | null | undefined): string {
  if (!iso?.trim()) return "";
  const d = new Date(iso.trim());
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPart["type"]) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  const hour = pick("hour");
  const minute = pick("minute");
  return year && month && day && hour && minute ? `${year}-${month}-${day}T${hour}:${minute}` : "";
}

/** Current instant formatted for `datetime-local` in Phoenix. */
export function getAppNowForDateTimeInput(now: Date = new Date()): string {
  return isoInstantToDatetimeLocalInput(now.toISOString());
}

function normalizeWallHm(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number.parseInt(m[1], 10);
  const min = Number.parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return `${pad2(h)}:${pad2(min)}`;
}

/**
 * Parse `YYYY-MM-DDTHH:mm` (or with seconds) as Phoenix wall time → UTC ISO string.
 */
export function parseAppDateTimeInputToUtcIso(localDatetime: string): string | null {
  let s = localDatetime.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
    s = `${s}:00`;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) return null;
  const ms = Date.parse(`${s}${APP_WALL_OFFSET}`);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/** Phoenix calendar date + `H:mm` or `HH:mm` → UTC ISO (for visit scheduling, follow-ups). */
export function combineAppCalendarDateAndTimeToUtcIso(dateYmd: string, timeHm: string): string | null {
  const d = dateYmd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const hm = normalizeWallHm(timeHm);
  if (!hm) return null;
  return parseAppDateTimeInputToUtcIso(`${d}T${hm}`);
}

/**
 * Parse form datetime values: prefer Phoenix `datetime-local`, else fall back to full ISO / Date.
 */
export function parseFormDatetimeToUtcIso(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  const phx = parseAppDateTimeInputToUtcIso(t);
  if (phx) return phx;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
