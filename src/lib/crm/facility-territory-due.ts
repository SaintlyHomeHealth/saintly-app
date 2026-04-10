import {
  addCalendarDaysToIsoDate,
  getCrmCalendarDateIsoFromInstant,
  getCrmCalendarTodayIso,
} from "@/lib/crm/crm-local-date";
import { formatFacilityDate } from "@/lib/crm/facility-address";
import { isValidVisitFrequency, type VisitFrequencyOption } from "@/lib/crm/facility-options";

export type FacilityDueBand = "overdue" | "due_soon" | "on_track" | "none";

export function daysForVisitFrequency(f: VisitFrequencyOption): number {
  if (f === "weekly") return 7;
  if (f === "biweekly") return 14;
  return 30;
}

export type FacilityDueInfo = {
  band: FacilityDueBand;
  /** Next due date as YYYY-MM-DD in CRM calendar (America/Chicago). */
  effectiveNextDueYmd: string | null;
  /** True when `next_follow_up_at` drove the due date (vs cadence from last visit). */
  usesExplicitFollowUp: boolean;
};

/**
 * Prefer explicit `next_follow_up_at` as the due date; otherwise last visit + visit_frequency.
 * Bands vs CRM "today": overdue = before today; due soon = today through +7 days; on track = after +7 days.
 */
export function computeFacilityDueInfo(input: {
  last_visit_at: string | null;
  next_follow_up_at: string | null;
  visit_frequency: string | null;
}): FacilityDueInfo {
  const { last_visit_at, next_follow_up_at, visit_frequency } = input;
  const today = getCrmCalendarTodayIso();
  const weekEnd = addCalendarDaysToIsoDate(today, 7);

  let effectiveNextYmd: string | null = null;
  let usesExplicitFollowUp = false;

  if (next_follow_up_at) {
    effectiveNextYmd = getCrmCalendarDateIsoFromInstant(new Date(next_follow_up_at));
    usesExplicitFollowUp = true;
  } else if (last_visit_at && visit_frequency && isValidVisitFrequency(visit_frequency)) {
    const lastYmd = getCrmCalendarDateIsoFromInstant(new Date(last_visit_at));
    const days = daysForVisitFrequency(visit_frequency);
    effectiveNextYmd = addCalendarDaysToIsoDate(lastYmd, days);
  }

  if (!effectiveNextYmd) {
    return { band: "none", effectiveNextDueYmd: null, usesExplicitFollowUp: false };
  }

  if (effectiveNextYmd < today) {
    return { band: "overdue", effectiveNextDueYmd: effectiveNextYmd, usesExplicitFollowUp };
  }
  if (effectiveNextYmd <= weekEnd) {
    return { band: "due_soon", effectiveNextDueYmd: effectiveNextYmd, usesExplicitFollowUp };
  }
  return { band: "on_track", effectiveNextDueYmd: effectiveNextYmd, usesExplicitFollowUp };
}

export function facilityDueBadgeLabel(band: FacilityDueBand): string {
  switch (band) {
    case "overdue":
      return "Overdue";
    case "due_soon":
      return "Due soon";
    case "on_track":
      return "On track";
    default:
      return "No schedule";
  }
}

/** Pill + border tones for list cards and table. */
export function facilityDueBadgeClasses(band: FacilityDueBand): string {
  switch (band) {
    case "overdue":
      return "bg-red-50 text-red-900 ring-1 ring-red-200/90";
    case "due_soon":
      return "bg-amber-50 text-amber-950 ring-1 ring-amber-200/90";
    case "on_track":
      return "bg-emerald-50 text-emerald-950 ring-1 ring-emerald-200/80";
    default:
      return "bg-slate-100 text-slate-600 ring-1 ring-slate-200/80";
  }
}

export function facilityDueCardBorderClass(band: FacilityDueBand): string {
  switch (band) {
    case "overdue":
      return "border-l-[3px] border-l-red-500";
    case "due_soon":
      return "border-l-[3px] border-l-amber-400";
    case "on_track":
      return "border-l-[3px] border-l-emerald-500";
    default:
      return "border-l-[3px] border-l-transparent";
  }
}

/** Compact 1–5 relationship strength for tables and cards. */
export function formatRelationshipStrengthDots(n: number | null | undefined): string {
  if (n == null || n < 1 || n > 5) return "—";
  return "●".repeat(n) + "○".repeat(5 - n);
}

/** Display a CRM calendar YYYY-MM-DD as a medium date string. */
export function formatDueYmdAsDisplay(ymd: string | null): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "—";
  return formatFacilityDate(`${ymd}T12:00:00.000Z`);
}
