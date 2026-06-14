import {
  addCalendarDaysToIsoDate,
  getCrmCalendarTodayIso,
  getCrmCalendarTomorrowIso,
} from "@/lib/crm/crm-local-date";

/** End-of-business-day instant for a CRM calendar date (5 PM local browser time, matching AI Capture). */
export function calendarDateToDueIso(ymd: string): string {
  const d = new Date(`${ymd.trim().slice(0, 10)}T17:00:00`);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

export function dueIsoFromPreset(preset: "today" | "tomorrow" | "3days" | "1week" | "2weeks"): string {
  const today = getCrmCalendarTodayIso();
  switch (preset) {
    case "today":
      return calendarDateToDueIso(today);
    case "tomorrow":
      return calendarDateToDueIso(getCrmCalendarTomorrowIso());
    case "3days":
      return calendarDateToDueIso(addCalendarDaysToIsoDate(today, 3));
    case "1week":
      return calendarDateToDueIso(addCalendarDaysToIsoDate(today, 7));
    case "2weeks":
      return calendarDateToDueIso(addCalendarDaysToIsoDate(today, 14));
    default:
      return calendarDateToDueIso(today);
  }
}

export const SNOOZE_PRESETS = [
  { id: "tomorrow" as const, label: "Tomorrow" },
  { id: "3days" as const, label: "3 days" },
  { id: "1week" as const, label: "1 week" },
];

export const RESCHEDULE_PRESETS = [
  { id: "today" as const, label: "Today" },
  { id: "tomorrow" as const, label: "Tomorrow" },
  { id: "3days" as const, label: "3 days" },
  { id: "1week" as const, label: "1 week" },
  { id: "2weeks" as const, label: "2 weeks" },
];

export type FollowUpTaskActionMode = "complete" | "snooze" | "reschedule" | "cancel";
