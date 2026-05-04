/**
 * CRM calendar-day boundaries (`follow_up_date`, “today” filters, visit boards).
 * Aligned with agency operations in America/Phoenix (no DST).
 */
const CRM_CALENDAR_TZ = "America/Phoenix";

export function getCrmCalendarTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CRM_CALENDAR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Add whole calendar days to a `YYYY-MM-DD` string (logical date; not timezone-shifted).
 */
export function addCalendarDaysToIsoDate(ymd: string, deltaDays: number): string {
  const t = ymd.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const [ys, ms, ds] = t.split("-").map(Number);
  const base = new Date(Date.UTC(ys, ms - 1, ds));
  base.setUTCDate(base.getUTCDate() + deltaDays);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(base.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function getCrmCalendarTomorrowIso(): string {
  return addCalendarDaysToIsoDate(getCrmCalendarTodayIso(), 1);
}

/** Calendar `YYYY-MM-DD` in CRM timezone for a given instant (for `leads.follow_up_date`). */
export function getCrmCalendarDateIsoFromInstant(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CRM_CALENDAR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
