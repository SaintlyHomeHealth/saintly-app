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
