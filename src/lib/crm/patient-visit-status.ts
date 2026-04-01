/**
 * Operational visit workflow — keep in sync with DB constraint on `patient_visits.status`.
 * @see supabase migration `patient_visits_status_expand`.
 */
export const PATIENT_VISIT_STATUSES = [
  "scheduled",
  "confirmed",
  "en_route",
  "arrived",
  "completed",
  "missed",
  "rescheduled",
  "canceled",
] as const;

export type PatientVisitStatus = (typeof PATIENT_VISIT_STATUSES)[number];

/** Allowed next statuses from current (admin / ops can move visits forward or to terminal states). */
export const VISIT_STATUS_TRANSITIONS: Record<string, string[]> = {
  scheduled: ["confirmed", "en_route", "arrived", "missed", "rescheduled", "canceled"],
  confirmed: ["en_route", "arrived", "missed", "rescheduled", "canceled"],
  en_route: ["arrived", "missed", "canceled"],
  arrived: ["completed", "canceled"],
  completed: [],
  missed: ["rescheduled", "canceled"],
  rescheduled: [],
  canceled: [],
};

export function allowedNextVisitStatuses(current: string): string[] {
  return VISIT_STATUS_TRANSITIONS[current] ?? [];
}

export function formatVisitStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}
