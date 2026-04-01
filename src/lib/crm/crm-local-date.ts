/**
 * "Today" for CRM follow-up filters and dashboard counts.
 * Uses America/Chicago so daily cutoffs align with typical Saintly ops (US Central).
 */
const CRM_CALENDAR_TZ = "America/Chicago";

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
