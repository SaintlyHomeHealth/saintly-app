/**
 * Self-billing line service dates: which calendar days a nurse may select.
 * - Tue–Sun: current week (Mon–Sun) in the relevant timezone.
 * - Monday only: previous Mon through current Sun (one continuous range).
 *
 * Date strings are always yyyy-mm-dd (Gregorian). Comparisons use string order (valid for ISO dates).
 */

import { getWeekMondayLocal } from "./pay-period";

export function localCalendarDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function utcCalendarDow(y: number, m: number, d: number): number {
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

function addDaysYMD(y: number, m: number, d: number, delta: number): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function ymdToIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Monday (Gregorian) of the week containing y-m-d; week = Mon–Sun. */
function mondayOfWeekContainingYMD(y: number, m: number, d: number): { y: number; m: number; d: number } {
  const dow = utcCalendarDow(y, m, d);
  const delta = dow === 0 ? -6 : 1 - dow;
  return addDaysYMD(y, m, d, delta);
}

function getYMDInTimeZone(instant: Date, timeZone: string): { y: number; m: number; d: number } {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = f.formatToParts(instant);
  let y = 0;
  let m = 0;
  let d = 0;
  for (const p of parts) {
    if (p.type === "year") y = Number(p.value);
    if (p.type === "month") m = Number(p.value);
    if (p.type === "day") d = Number(p.value);
  }
  return { y, m, d };
}

export type SelectableServiceDateBounds = {
  min: string;
  max: string;
  /** True when Monday rule applies (can bill last week too). */
  isMondayWindow: boolean;
};

/**
 * Bounds using the **browser / Date local** getters (nurse device local time).
 */
export function getSelectableServiceDateBoundsLocal(now: Date): SelectableServiceDateBounds {
  const thisMonday = getWeekMondayLocal(now);
  const y = thisMonday.getFullYear();
  const m = thisMonday.getMonth() + 1;
  const d = thisMonday.getDate();
  const thisMondayYmd = { y, m, d };

  const day = now.getDay();
  const isMonday = day === 1;

  const thisSunday = addDaysYMD(y, m, d, 6);

  if (isMonday) {
    const prevMonday = addDaysYMD(y, m, d, -7);
    return {
      min: ymdToIso(prevMonday.y, prevMonday.m, prevMonday.d),
      max: ymdToIso(thisSunday.y, thisSunday.m, thisSunday.d),
      isMondayWindow: true,
    };
  }

  return {
    min: ymdToIso(thisMondayYmd.y, thisMondayYmd.m, thisMondayYmd.d),
    max: ymdToIso(thisSunday.y, thisSunday.m, thisSunday.d),
    isMondayWindow: false,
  };
}

/**
 * Bounds for server-side validation using an IANA timezone (e.g. America/Phoenix).
 * "Today" is the calendar date in that zone when `instant` is interpreted there.
 */
export function getSelectableServiceDateBoundsInTimeZone(
  instant: Date,
  timeZone: string
): SelectableServiceDateBounds {
  const { y, m, d } = getYMDInTimeZone(instant, timeZone);
  const dow = utcCalendarDow(y, m, d);
  const isMonday = dow === 1;

  const thisMonday = mondayOfWeekContainingYMD(y, m, d);
  const thisSunday = addDaysYMD(thisMonday.y, thisMonday.m, thisMonday.d, 6);

  if (isMonday) {
    const prevMonday = addDaysYMD(thisMonday.y, thisMonday.m, thisMonday.d, -7);
    return {
      min: ymdToIso(prevMonday.y, prevMonday.m, prevMonday.d),
      max: ymdToIso(thisSunday.y, thisSunday.m, thisSunday.d),
      isMondayWindow: true,
    };
  }

  return {
    min: ymdToIso(thisMonday.y, thisMonday.m, thisMonday.d),
    max: ymdToIso(thisSunday.y, thisSunday.m, thisSunday.d),
    isMondayWindow: false,
  };
}

export function isIsoDateInInclusiveRange(iso: string, min: string, max: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return iso >= min && iso <= max;
}

export function clampIsoDateToRange(iso: string, min: string, max: string): string {
  if (iso < min) return min;
  if (iso > max) return max;
  return iso;
}

/** Default TZ for server validation; override with SELF_BILLING_CALENDAR_TZ. */
export function selfBillingCalendarTimeZone(): string {
  return process.env.SELF_BILLING_CALENDAR_TZ?.trim() || "America/Phoenix";
}
