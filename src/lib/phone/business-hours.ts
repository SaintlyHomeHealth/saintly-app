/**
 * Configurable business hours (hardcoded defaults; future: admin / DB).
 * No AI — pure calendar + clock math in a fixed IANA timezone.
 */

export type WeekendBehavior = "use_after_hours_rules" | "treat_as_closed";

export type BusinessHoursSchedule = {
  /** IANA timezone, e.g. America/Phoenix */
  timezone: string;
  /** Weekdays that follow `open` / `close` (0 = Sunday … 6 = Saturday). Default Mon–Fri. */
  businessWeekdays: readonly number[];
  /** `HH:MM` 24h local to `timezone` */
  openLocal: string;
  closeLocal: string;
  /** When Sat/Sun: mirror after-hours routing, or treat as fully closed (still after-hours style for routing). */
  weekendBehavior: WeekendBehavior;
};

/** Optional YYYY-MM-DD dates (local calendar in `timezone`) treated as closed. */
export const BUSINESS_HOLIDAY_DATES_YYYY_MM_DD: readonly string[] = [];

/**
 * Default: Monday–Friday 8:00–17:00, America/Phoenix.
 * Tune later via env without schema changes (see {@link resolveBusinessHoursScheduleFromEnv}).
 */
export const DEFAULT_BUSINESS_HOURS_SCHEDULE: BusinessHoursSchedule = {
  timezone: "America/Phoenix",
  businessWeekdays: [1, 2, 3, 4, 5],
  openLocal: "08:00",
  closeLocal: "17:00",
  weekendBehavior: "use_after_hours_rules",
};

export type BusinessHoursContext = {
  timezone: string;
  nowUtc: string;
  localDate: string;
  localWeekday: number;
  isHoliday: boolean;
  isWeekendDay: boolean;
  /** True when schedule says the office is accepting “business hours” inbound routing. */
  isOpen: boolean;
  /** When not open and weekend rules apply (Sat/Sun or holiday), after-hours routing should run. */
  useAfterHoursRouting: boolean;
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function parseHm(local: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const h = Number.parseInt(m[1], 10);
  const min = Number.parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return { h, m: min };
}

function minutesSinceMidnight(h: number, m: number): number {
  return h * 60 + m;
}

/**
 * Reads optional env overrides:
 * - `TWILIO_BUSINESS_TZ` — IANA timezone
 * - `TWILIO_BUSINESS_HOURS_WEEKDAY` — `8-17` hours (legacy coarse format, maps to 08:00–17:00 same day)
 * - `TWILIO_BUSINESS_INCLUDE_WEEKEND` — `1` = weekend counts as business open (legacy)
 *
 * When `TWILIO_BUSINESS_HOURS_WEEKDAY` is **unset**, returns `null` (legacy: treat office as always open for routing).
 */
export function resolveBusinessHoursScheduleFromEnv(): BusinessHoursSchedule | null {
  const raw = process.env.TWILIO_BUSINESS_HOURS_WEEKDAY?.trim();
  if (!raw) {
    return null;
  }
  const tz = process.env.TWILIO_BUSINESS_TZ?.trim() || DEFAULT_BUSINESS_HOURS_SCHEDULE.timezone;
  let openLocal = DEFAULT_BUSINESS_HOURS_SCHEDULE.openLocal;
  let closeLocal = DEFAULT_BUSINESS_HOURS_SCHEDULE.closeLocal;
  const leg = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(raw);
  if (leg) {
    const a = Number.parseInt(leg[1], 10);
    const b = Number.parseInt(leg[2], 10);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      openLocal = `${pad2(Math.min(23, Math.max(0, a)))}:00`;
      closeLocal = `${pad2(Math.min(23, Math.max(0, b)))}:00`;
    }
  }
  const includeWeekend = process.env.TWILIO_BUSINESS_INCLUDE_WEEKEND === "1";
  return {
    timezone: tz,
    businessWeekdays: includeWeekend ? [0, 1, 2, 3, 4, 5, 6] : DEFAULT_BUSINESS_HOURS_SCHEDULE.businessWeekdays,
    openLocal,
    closeLocal,
    weekendBehavior: DEFAULT_BUSINESS_HOURS_SCHEDULE.weekendBehavior,
  };
}

function formatLocalDateInTz(iso: Date, timeZone: string): { ymd: string; weekday: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(iso);
  const hour = Number.parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = Number.parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const wdayStr = parts.find((p) => p.type === "weekday")?.value ?? "";
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = wdMap[wdayStr] ?? 0;
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const ymd = `${year}-${month}-${day}`;
  return { ymd, weekday, minutes: minutesSinceMidnight(hour, minute) };
}

/**
 * Open/closed for the given instant, holiday-aware, weekend-aware.
 * When schedule resolution is `null` (no `TWILIO_BUSINESS_HOURS_WEEKDAY`), legacy behavior is **always open**.
 */
export function resolveBusinessHoursContext(now: Date, schedule?: BusinessHoursSchedule | null): BusinessHoursContext {
  const s = schedule ?? resolveBusinessHoursScheduleFromEnv();
  if (s == null) {
    const tz = process.env.TWILIO_BUSINESS_TZ?.trim() || DEFAULT_BUSINESS_HOURS_SCHEDULE.timezone;
    const { ymd, weekday } = formatLocalDateInTz(now, tz);
    return {
      timezone: tz,
      nowUtc: now.toISOString(),
      localDate: ymd,
      localWeekday: weekday,
      isHoliday: false,
      isWeekendDay: weekday === 0 || weekday === 6,
      isOpen: true,
      useAfterHoursRouting: false,
    };
  }
  const { ymd, weekday, minutes } = formatLocalDateInTz(now, s.timezone);
  const isHoliday = BUSINESS_HOLIDAY_DATES_YYYY_MM_DD.includes(ymd);
  const isWeekendDay = weekday === 0 || weekday === 6;

  const open = parseHm(s.openLocal);
  const close = parseHm(s.closeLocal);
  const openMin = open ? minutesSinceMidnight(open.h, open.m) : 8 * 60;
  const closeMin = close ? minutesSinceMidnight(close.h, close.m) : 17 * 60;

  const onBusinessWeekday = s.businessWeekdays.includes(weekday);
  const inWindow = minutes >= openMin && minutes < closeMin;

  let isOpen = false;
  if (isHoliday) {
    isOpen = false;
  } else if (isWeekendDay) {
    if (s.weekendBehavior === "treat_as_closed") {
      isOpen = false;
    } else {
      isOpen = false;
    }
  } else {
    isOpen = onBusinessWeekday && inWindow;
  }

  const useAfterHoursRouting = !isOpen;

  return {
    timezone: s.timezone,
    nowUtc: now.toISOString(),
    localDate: ymd,
    localWeekday: weekday,
    isHoliday,
    isWeekendDay,
    isOpen,
    useAfterHoursRouting,
  };
}
