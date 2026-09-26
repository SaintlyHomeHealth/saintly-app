export const COMPLIANCE_ROLES = ["super_admin", "admin", "manager", "don"] as const;

export const MEETING_TYPES = [
  ["staff", "Staff Meeting"],
  ["qapi", "QAPI"],
  ["governing_body", "Governing Body"],
  ["advisory", "Advisory Group"],
  ["safety", "Safety"],
  ["emergency", "Emergency Preparedness"],
  ["other", "Other"],
] as const;

export const EXERCISE_TYPES = [
  ["tabletop", "Tabletop Exercise"],
  ["mock", "Mock Drill"],
  ["functional", "Functional Exercise"],
  ["community", "Community Exercise"],
  ["actual", "Actual Emergency"],
  ["other", "Other"],
] as const;

export const INCIDENT_TYPES = [
  ["complaint", "Complaint"],
  ["hospitalization", "Hospitalization"],
  ["er_visit", "ER Visit"],
  ["fall", "Fall"],
  ["medication_error", "Medication Error"],
  ["missed_visit", "Missed Visit"],
  ["infection", "Infection"],
  ["injury", "Injury"],
  ["staff_issue", "Staff Issue"],
  ["other", "Other"],
] as const;

export const PROJECT_STATUSES = [
  ["planning", "Planning"],
  ["active", "Active"],
  ["monitoring", "Monitoring"],
  ["completed", "Completed"],
] as const;

export const SAFETY_ITEMS = [
  ["smoke_detector", "Smoke detector operational"],
  ["extinguisher_present", "Fire extinguisher present"],
  ["extinguisher_current", "Fire extinguisher inspection/current"],
  ["exits_clear", "Emergency exits clear"],
  ["routes_clear", "Exit routes unobstructed"],
  ["cords_safe", "Electrical cords appear safe"],
  ["outlets_safe", "Electrical outlets appear safe"],
  ["no_overload", "No obvious overloaded outlets/power strips"],
  ["numbers_posted", "Emergency numbers posted"],
  ["first_aid", "First-aid supplies available"],
  ["walkways_clear", "Walkways clear"],
  ["no_trip_hazards", "No obvious trip hazards"],
  ["flashlight", "Emergency flashlight available"],
  ["records_accessible", "Important records/equipment accessible"],
  ["office_acceptable", "General office safety acceptable"],
] as const;

export const EMERGENCY_REVIEW_ITEMS = [
  ["emergency_contacts", "Emergency contact information reviewed"],
  ["staff_contacts", "Staff contact list reviewed"],
  ["high_risk_patients", "High-risk patient procedures reviewed"],
  ["power_outage", "Power outage procedures reviewed"],
  ["extreme_heat", "Extreme heat procedures reviewed"],
  ["fire", "Fire procedures reviewed"],
  ["severe_weather", "Severe weather / monsoon procedures reviewed"],
  ["communication", "Communication plan reviewed"],
  ["vendors", "Emergency vendors/resources reviewed"],
  ["emr_outage", "EMR / technology outage procedures reviewed"],
] as const;

export const QAPI_COUNT_FIELDS = [
  ["patients_served", "Total Patients Served", false],
  ["hospitalizations", "Hospitalizations", true],
  ["er_visits", "ER Visits", true],
  ["falls", "Falls", true],
  ["medication_errors", "Medication Errors", true],
  ["complaints", "Complaints", true],
  ["missed_visits", "Missed Visits", true],
  ["infections", "Infections", true],
  ["late_documentation", "Late Documentation", false],
  ["late_oasis", "Late OASIS", false],
  ["unsigned_orders", "Unsigned 485s / Physician Orders", false],
  ["other_events", "Other Significant Events", false],
] as const;

export type QapiCountKey = (typeof QAPI_COUNT_FIELDS)[number][0];
export type QapiAutoKey = "hospitalizations" | "er_visits" | "falls" | "medication_errors" | "complaints" | "missed_visits" | "infections";

export const INCIDENT_TO_QAPI: Record<string, QapiAutoKey | undefined> = {
  hospitalization: "hospitalizations",
  er_visit: "er_visits",
  fall: "falls",
  medication_error: "medication_errors",
  complaint: "complaints",
  missed_visit: "missed_visits",
  infection: "infections",
};

export const NIL_ON_CALL_STATEMENT =
  "No after-hours/on-call calls were reported during this reporting period.";

export const COMPANY_NAME = "Saintly Home Health LLC";
export const COMPANY_TAGLINE = "Care that goes above.";

export type NaItemKey = "meetings" | "safety" | "emergency_review" | "drill" | "qapi_review";

export function labelFrom(pairs: readonly (readonly [string, string])[], value: string | null | undefined): string {
  if (!value) return "—";
  const found = pairs.find(([key]) => key === value);
  return found ? found[1] : value;
}
