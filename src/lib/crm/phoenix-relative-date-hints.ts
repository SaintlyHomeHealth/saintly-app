/**
 * Computes calendar hints in America/Phoenix for CRM voice date extraction prompts.
 */

import { addCalendarDaysToIsoDate, getCrmCalendarTodayIso } from "@/lib/crm/crm-local-date";
import { combineAppCalendarDateAndTimeToUtcIso } from "@/lib/datetime/app-timezone";

const WEEKDAY_SHORT_TO_DOW = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
} as const;

function phoenixWeekdayShort(ymd: string): keyof typeof WEEKDAY_SHORT_TO_DOW | null {
  const t = ymd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const utcIso = combineAppCalendarDateAndTimeToUtcIso(t, "12:00");
  if (!utcIso) return null;
  const w = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Phoenix" }).format(
    new Date(utcIso)
  );
  if (w in WEEKDAY_SHORT_TO_DOW) return w as keyof typeof WEEKDAY_SHORT_TO_DOW;
  return null;
}

/** Next calendar Phoenix day whose weekday equals target (0=Sunday …). Scans forward up to 14 days inclusive of start. */
function nextCalendarDayWithWeekday(phoenixTodayYmd: string, targetDow: number): string | null {
  const today = phoenixTodayYmd.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  for (let i = 0; i <= 14; i++) {
    const ymd = addCalendarDaysToIsoDate(today, i);
    const sh = phoenixWeekdayShort(ymd);
    if (sh == null) continue;
    if (WEEKDAY_SHORT_TO_DOW[sh] === targetDow) {
      return ymd;
    }
  }
  return null;
}

/**
 * Produce ISO examples for ambiguous phrases (model still decides; hints reduce midnight mistakes).
 */
export function buildPhoenixRelativeDateHintsForVoiceTasks(): Record<string, string | null | undefined> {
  const today = getCrmCalendarTodayIso();

  /** Next Friday strictly after Phoenix today — if today is Fri, skips to following Friday. */
  let nextFriday = nextCalendarDayWithWeekday(addCalendarDaysToIsoDate(today, 1), 5);
  const todayWd = phoenixWeekdayShort(today);
  if (todayWd === "Fri") {
    nextFriday = nextCalendarDayWithWeekday(addCalendarDaysToIsoDate(today, 1), 5);
  } else if (todayWd != null && WEEKDAY_SHORT_TO_DOW[todayWd] < 5) {
    const thisWeekFri = nextCalendarDayWithWeekday(today, 5);
    if (thisWeekFri && thisWeekFri !== today) nextFriday = thisWeekFri;
  }

  const nextMondayStrict = nextCalendarDayWithWeekday(addCalendarDaysToIsoDate(today, 1), 1);
  /** "Next Monday": usually the Monday strictly after Phoenix today unless speaker means this week's Monday — model uses hints. */
  const mondayAhead = nextCalendarDayWithWeekday(today, 1);
  const thisMondayIfFuture =
    todayWd !== "Mon" && mondayAhead && mondayAhead > today ? mondayAhead : nextMondayStrict;

  const tomorrow = addCalendarDaysToIsoDate(today, 1);

  const defaultMorningUtc = combineAppCalendarDateAndTimeToUtcIso(tomorrow, "09:00");
  const nineAmTodayUtc = combineAppCalendarDateAndTimeToUtcIso(today, "09:00");

  return {
    phoenix_today_iso: today,
    phoenix_tomorrow_iso: tomorrow,
    suggestion_tomorrow_9am_phoenix_utc_example: defaultMorningUtc,
    suggestion_today_3pm_phoenix_utc_example: combineAppCalendarDateAndTimeToUtcIso(today, "15:00"),
    suggestion_today_9am_phoenix_utc_example: nineAmTodayUtc,
    next_calendar_friday_iso_hint: nextFriday ?? undefined,
    next_calendar_monday_after_today_hint: nextMondayStrict ?? undefined,
    this_or_next_calendar_monday_hint: thisMondayIfFuture ?? nextMondayStrict,
    note_default_time_when_unspecified_phoenix_wall:
      "If the speaker mentions a calendar day without a clock time, assume 09:00 America/Phoenix (not midnight, not late afternoon unless they say afternoon/evening). 'Morning' implies ~09:00; 'afternoon' ~14:00; '3' or 'three' alone on a weekday usually means 3:00 PM.",
  };
}
