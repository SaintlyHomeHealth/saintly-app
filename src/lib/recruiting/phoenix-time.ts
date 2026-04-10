/**
 * Arizona (America/Phoenix) calendar bounds for recruiting follow-up filters and highlights.
 */

function phoenixYmdParts(d: Date): { y: string; m: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return { y, m, day };
}

export function phoenixTodayYmd(d = new Date()): string {
  const { y, m, day } = phoenixYmdParts(d);
  return `${y}-${m}-${day}`;
}

/** Start of “today” in Phoenix, as an ISO string with fixed -07:00 offset (MST, no DST). */
export function phoenixStartOfTodayIso(d = new Date()): string {
  const { y, m, day } = phoenixYmdParts(d);
  return `${y}-${m}-${day}T00:00:00.000-07:00`;
}

/** End of “today” in Phoenix. */
export function phoenixEndOfTodayIso(d = new Date()): string {
  const { y, m, day } = phoenixYmdParts(d);
  return `${y}-${m}-${day}T23:59:59.999-07:00`;
}

/** True if `iso` falls on the Phoenix calendar date of `d` (typically “today”). */
export function isPhoenixSameCalendarDay(iso: string | null | undefined, d = new Date()): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  const a = phoenixTodayYmd(d);
  const b = phoenixTodayYmd(new Date(t));
  return a === b;
}

/** `ymd` is YYYY-MM-DD in Phoenix calendar terms (from a date input). */
export function phoenixYmdStartIso(ymd: string): string | null {
  const t = ymd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return `${t}T00:00:00.000-07:00`;
}

export function phoenixYmdEndIso(ymd: string): string | null {
  const t = ymd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return `${t}T23:59:59.999-07:00`;
}
