/**
 * Weekly payroll policy: pay period Mon–Sun; employee submits Tuesday; pay Wednesday.
 * Boundary dates use the browser/server local timezone.
 */

/** Monday 00:00 local of the week containing `d`. */
export function getWeekMondayLocal(d: Date): Date {
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

/** Sunday end-of-day local of the week starting `monday`. */
export function getWeekSundayLocal(monday: Date): Date {
  const sun = new Date(monday);
  sun.setDate(monday.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return sun;
}

export type PayPeriodBounds = {
  payPeriodStart: string;
  payPeriodEnd: string;
  submissionDeadline: string;
  payDate: string;
};

/** ISO date strings yyyy-mm-dd for period boundaries; deadline is ISO datetime for Tuesday 23:59:59 local. */
export function getPayPeriodForDate(d: Date): PayPeriodBounds {
  const monday = getWeekMondayLocal(d);
  const sunday = getWeekSundayLocal(monday);

  const tuesdayAfter = new Date(sunday);
  tuesdayAfter.setDate(sunday.getDate() + 2);
  tuesdayAfter.setHours(23, 59, 59, 999);

  const wednesdayPay = new Date(sunday);
  wednesdayPay.setDate(sunday.getDate() + 3);
  wednesdayPay.setHours(12, 0, 0, 0);

  const isoDate = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

  return {
    payPeriodStart: isoDate(monday),
    payPeriodEnd: isoDate(sunday),
    submissionDeadline: tuesdayAfter.toISOString(),
    payDate: isoDate(wednesdayPay),
  };
}

export function serviceDateInPeriod(serviceDateIso: string, periodStart: string, periodEnd: string): boolean {
  return serviceDateIso >= periodStart && serviceDateIso <= periodEnd;
}

export function minutesBetween(checkInIso: string, checkOutIso: string): number | null {
  const a = Date.parse(checkInIso);
  const b = Date.parse(checkOutIso);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return Math.round((b - a) / 60_000);
}

/** Next period after current (for display). */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const iso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return iso(dt);
}

/** Consecutive pay weeks (Mon–Sun) always listed in admin /admin/payroll week dropdown (plus DB weeks). */
export const ADMIN_PAYROLL_WEEK_PICKER_FALLBACK_COUNT = 12;

export type AdminPayrollWeekOption = { start: string; end: string; label: string };

/**
 * Build pay week dropdown options: last N weeks ending at now, plus any distinct periods from
 * `nurse_weekly_billings` rows. Deduped, sorted newest first (ISO Monday strings).
 */
export function buildAdminPayrollWeekPickerOptions(
  now: Date,
  dbPeriodRows: { pay_period_start?: unknown; pay_period_end?: unknown }[]
): AdminPayrollWeekOption[] {
  const seen = new Set<string>();
  const out: AdminPayrollWeekOption[] = [];

  const push = (start: string, end: string) => {
    const s = start.trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    const e = end.trim() || s;
    out.push({ start: s, end: e, label: `${s} – ${e}` });
  };

  const anchorMonday = getWeekMondayLocal(now);
  for (let i = 0; i < ADMIN_PAYROLL_WEEK_PICKER_FALLBACK_COUNT; i++) {
    const d = new Date(anchorMonday);
    d.setDate(anchorMonday.getDate() - i * 7);
    const b = getPayPeriodForDate(d);
    push(b.payPeriodStart, b.payPeriodEnd);
  }

  for (const row of dbPeriodRows) {
    const s = typeof row.pay_period_start === "string" ? row.pay_period_start.trim() : "";
    if (!s) continue;
    const e = typeof row.pay_period_end === "string" ? row.pay_period_end.trim() : s;
    push(s, e);
  }

  out.sort((a, b) => b.start.localeCompare(a.start));
  return out;
}

/** Ensures the URL-selected week appears in the picker (e.g. deep link to an older week). */
export function ensureAdminPayrollWeekInPickerOptions(
  options: AdminPayrollWeekOption[],
  selected: PayPeriodBounds
): AdminPayrollWeekOption[] {
  if (options.some((o) => o.start === selected.payPeriodStart)) {
    return options;
  }
  const merged = [
    ...options,
    {
      start: selected.payPeriodStart,
      end: selected.payPeriodEnd,
      label: `${selected.payPeriodStart} – ${selected.payPeriodEnd}`,
    },
  ];
  merged.sort((a, b) => b.start.localeCompare(a.start));
  return merged;
}
