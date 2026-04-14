/**
 * Credentialing UI displays dates/times in a single business timezone so server
 * rendering matches what staff expect (avoids implicit UTC / server-local).
 */
export const CREDENTIALING_DISPLAY_TIMEZONE = "America/Los_Angeles";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CREDENTIALING_DISPLAY_TIMEZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** Instant timestamps from Postgres (timestamptz / ISO strings). */
export function formatCredentialingDateTime(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso.trim());
  if (Number.isNaN(d.getTime())) return "—";
  return dateTimeFormatter.format(d);
}

/** Calendar date only (no clock time) for an instant, in the display timezone. */
export function formatCredentialingDateFromInstant(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso.trim());
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CREDENTIALING_DISPLAY_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

/** Calendar date only (YYYY-MM-DD) — avoids UTC midnight shifting the displayed day. */
export function formatCredentialingDateOnly(isoDate: string | null | undefined): string {
  if (!isoDate?.trim()) return "—";
  const s = isoDate.trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  const utcNoon = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CREDENTIALING_DISPLAY_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(utcNoon));
}

function yyyyMmDdInTimeZone(timeZone: string, date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const mo = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (!y || !mo || !d) return "";
  return `${y}-${mo}-${d}`;
}

function daysBetweenCalendarYmd(dueYmd: string, startYmd: string): number {
  const [dy, dm, dd] = dueYmd.split("-").map(Number);
  const [sy, sm, sd] = startYmd.split("-").map(Number);
  const a = Date.UTC(dy, dm - 1, dd);
  const b = Date.UTC(sy, sm - 1, sd);
  return Math.round((a - b) / 86400000);
}

/**
 * Relative due labels for date-only follow-up fields (uses display timezone "today").
 */
export function formatCredentialingDueDateLabel(isoDate: string | null): string {
  if (!isoDate?.trim()) return "—";
  const s = isoDate.trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  const dueYmd = `${m[1]}-${m[2]}-${m[3]}`;
  const todayYmd = yyyyMmDdInTimeZone(CREDENTIALING_DISPLAY_TIMEZONE, new Date());
  if (!todayYmd) return formatCredentialingDateOnly(isoDate);

  const diff = daysBetweenCalendarYmd(dueYmd, todayYmd);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1) return `In ${diff} days`;
  if (diff < -1) return `${Math.abs(diff)} days overdue`;
  return formatCredentialingDateOnly(isoDate);
}
