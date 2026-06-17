/**
 * PT/PTA cold-calling: shared option lists for statuses, Google Places search types,
 * call outcomes, and quick actions. Keep aligned with the migration defaults and UI.
 */

export const PT_COLD_CALL_STATUSES = [
  "New",
  "Call Today",
  "Called - No Answer",
  "Left Voicemail",
  "Gatekeeper",
  "Asked for Manager",
  "Interested",
  "Candidate Identified",
  "Send Application",
  "Follow Up",
  "Waiting on Rates",
  "Interview Scheduled",
  "Hired",
  "Not Interested",
  "Bad Number",
  "Do Not Call",
] as const;

export type PtColdCallStatus = (typeof PT_COLD_CALL_STATUSES)[number];

export function isValidPtColdCallStatus(value: string): value is PtColdCallStatus {
  return (PT_COLD_CALL_STATUSES as readonly string[]).includes(value);
}

/** Statuses that should be excluded from "Call Today" unless explicitly filtered. */
export const PT_COLD_CALL_DORMANT_STATUSES: readonly string[] = [
  "Do Not Call",
  "Bad Number",
  "Not Interested",
  "Hired",
];

export const PT_COLD_CALL_OUTCOMES = [
  "No Answer",
  "Left Voicemail",
  "Reached Gatekeeper",
  "Spoke with Manager",
  "Spoke with PT/PTA",
  "Interested",
  "Not Interested",
  "Wrong Number",
  "Asked to Call Back",
  "Waiting on Rates",
  "Other",
] as const;

export type PtColdCallOutcome = (typeof PT_COLD_CALL_OUTCOMES)[number];

/** Google Places sourcing search types (keyword used in the text query). */
export const PT_COLD_CALL_SEARCH_TYPES = [
  "Physical therapy clinic",
  "Outpatient physical therapy",
  "Sports physical therapy",
  "Orthopedic physical therapy",
  "Rehabilitation clinic",
  "Physical therapist",
  "Physical therapy assistant",
] as const;

export type PtColdCallSearchType = (typeof PT_COLD_CALL_SEARCH_TYPES)[number];

/** Saved-record filter buckets / dashboard cards. */
export const PT_COLD_CALL_FILTERS = [
  { id: "all", label: "All" },
  { id: "call_today", label: "Call Today" },
  { id: "follow_up_due", label: "Follow Up Due" },
  { id: "new", label: "New / Not Called" },
  { id: "interested", label: "Interested" },
  { id: "candidate", label: "Candidate Identified" },
  { id: "do_not_call", label: "Do Not Call" },
  { id: "bad_number", label: "Bad Number" },
  { id: "not_interested", label: "Not Interested" },
] as const;

export type PtColdCallFilterId = (typeof PT_COLD_CALL_FILTERS)[number]["id"];

export function isValidPtColdCallFilter(value: string): value is PtColdCallFilterId {
  return PT_COLD_CALL_FILTERS.some((f) => f.id === value);
}

/** Quick-action buttons on a saved record. Each maps to a status + whether it counts as a call attempt. */
export type PtColdCallQuickAction = {
  id: string;
  label: string;
  status: PtColdCallStatus;
  /** Increments call_attempts + sets last_called_at. */
  countsAsCall: boolean;
  /** Sets do_not_call = true. */
  doNotCall?: boolean;
  outcome?: PtColdCallOutcome;
};

export const PT_COLD_CALL_QUICK_ACTIONS: readonly PtColdCallQuickAction[] = [
  { id: "called", label: "Mark Called", status: "Called - No Answer", countsAsCall: true, outcome: "No Answer" },
  { id: "voicemail", label: "Left Voicemail", status: "Left Voicemail", countsAsCall: true, outcome: "Left Voicemail" },
  { id: "gatekeeper", label: "Gatekeeper", status: "Gatekeeper", countsAsCall: true, outcome: "Reached Gatekeeper" },
  { id: "interested", label: "Interested", status: "Interested", countsAsCall: true, outcome: "Interested" },
  { id: "candidate", label: "Candidate Identified", status: "Candidate Identified", countsAsCall: true },
  { id: "send_application", label: "Send Application", status: "Send Application", countsAsCall: false },
  { id: "waiting_on_rates", label: "Waiting on Rates", status: "Waiting on Rates", countsAsCall: true, outcome: "Waiting on Rates" },
  { id: "not_interested", label: "Not Interested", status: "Not Interested", countsAsCall: true, outcome: "Not Interested" },
  { id: "bad_number", label: "Bad Number", status: "Bad Number", countsAsCall: true, outcome: "Wrong Number" },
  { id: "do_not_call", label: "Do Not Call", status: "Do Not Call", countsAsCall: false, doNotCall: true },
] as const;

export function getQuickActionById(id: string): PtColdCallQuickAction | null {
  return PT_COLD_CALL_QUICK_ACTIONS.find((a) => a.id === id) ?? null;
}

export const PT_COLD_CALL_DISCIPLINE_OPTIONS = ["PT", "PTA"] as const;
export type PtColdCallDiscipline = (typeof PT_COLD_CALL_DISCIPLINE_OPTIONS)[number];
