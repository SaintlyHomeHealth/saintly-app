import type { QapiCountKey } from "@/lib/compliance/constants";

export type ActionResult = { ok: true; id?: string; message?: string } | { ok: false; error: string };

export type SignatureFields = {
  admin_signed_by_user_id: string | null;
  admin_signed_name: string | null;
  admin_signed_at: string | null;
  clinical_signed_by_user_id?: string | null;
  clinical_signed_name?: string | null;
  clinical_signed_at?: string | null;
};

export type MeetingRow = {
  id: string;
  year: number;
  quarter: number;
  meeting_type: string;
  meeting_date: string | null;
  start_time: string | null;
  end_time: string | null;
  attendees: string | null;
  topics_discussed: string | null;
  problems_identified: string | null;
  actions_decided: string | null;
  person_responsible: string | null;
  due_date: string | null;
  follow_up_prior: string | null;
  additional_notes: string | null;
  status: string;
  admin_signed_by_user_id: string | null;
  admin_signed_name: string | null;
  admin_signed_at: string | null;
  clinical_signed_by_user_id: string | null;
  clinical_signed_name: string | null;
  clinical_signed_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  finalized_at: string | null;
  finalized_by: string | null;
};

export type OnCallRow = {
  id: string;
  occurred_at: string;
  patient_id: string | null;
  patient_name: string;
  reason: string;
  action_taken: string;
  handled_by_user_id: string | null;
  handled_by_name: string;
  follow_up_needed: boolean;
  follow_up_completed: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type AttestationRow = {
  id: string;
  period_kind: string;
  year: number;
  quarter: number | null;
  month: number | null;
  statement: string;
  administrator_name: string;
  signed_by_user_id: string | null;
  signed_name: string;
  signed_at: string;
  created_by: string | null;
  created_at: string;
};

export type SafetyRow = {
  id: string;
  year: number;
  quarter: number;
  inspection_date: string | null;
  completed_by_name: string | null;
  checks: Record<string, boolean> | null;
  problems_found: string | null;
  corrective_action: string | null;
  date_corrected: string | null;
  corrected_by: string | null;
  completed_signed_by_user_id: string | null;
  completed_signed_name: string | null;
  completed_signed_at: string | null;
  admin_signed_by_user_id: string | null;
  admin_signed_name: string | null;
  admin_signed_at: string | null;
  status: string;
  finalized_at: string | null;
  finalized_by: string | null;
};

export type EmergencyReviewRow = {
  id: string;
  year: number;
  quarter: number;
  review_date: string | null;
  reviewed_by_name: string | null;
  checks: Record<string, boolean> | null;
  changes_required: boolean;
  changes_made: string | null;
  date_updated: string | null;
  updated_by_name: string | null;
  admin_signed_by_user_id: string | null;
  admin_signed_name: string | null;
  admin_signed_at: string | null;
  status: string;
  finalized_at: string | null;
};

export type DrillRow = {
  id: string;
  year: number;
  quarter: number;
  exercise_date: string | null;
  exercise_type: string | null;
  scenario: string | null;
  participants: string | null;
  what_happened: string | null;
  what_worked: string | null;
  what_did_not_work: string | null;
  problems_identified: string | null;
  corrective_action: string | null;
  person_responsible: string | null;
  corrective_due_date: string | null;
  plan_updated: boolean | null;
  additional_notes: string | null;
  admin_signed_by_user_id: string | null;
  admin_signed_name: string | null;
  admin_signed_at: string | null;
  status: string;
  finalized_at: string | null;
};

export type QapiReviewRow = {
  id: string;
  year: number;
  quarter: number;
  review_date: string | null;
  reviewed_by_name: string | null;
  counts_overridden: boolean;
  trends: string | null;
  action_plan: string | null;
  previous_action_effective: string | null;
  additional_notes: string | null;
  admin_signed_by_user_id: string | null;
  admin_signed_name: string | null;
  admin_signed_at: string | null;
  clinical_signed_by_user_id: string | null;
  clinical_signed_name: string | null;
  clinical_signed_at: string | null;
  status: string;
  finalized_at: string | null;
} & { [K in QapiCountKey]: number | null };

export type ProjectRow = {
  id: string;
  project_name: string;
  problem_identified: string | null;
  reason_selected: string | null;
  baseline: string | null;
  goal: string | null;
  action_intervention: string | null;
  responsible_person: string | null;
  start_date: string | null;
  target_date: string | null;
  current_results: string | null;
  status: string;
  outcome: string | null;
  goal_met: string | null;
  follow_up_needed: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  completed_at: string | null;
};

export type ProjectUpdateRow = {
  id: string;
  project_id: string;
  update_date: string;
  update_text: string;
  result: string | null;
  entered_by_user_id: string | null;
  entered_by_name: string | null;
  created_at: string;
};

export type IncidentRow = {
  id: string;
  occurred_on: string;
  patient_id: string | null;
  patient_name: string | null;
  incident_type: string;
  description: string;
  action_taken: string | null;
  handled_by_user_id: string | null;
  handled_by_name: string | null;
  follow_up_needed: boolean;
  resolved: boolean;
  resolution_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type NaMark = {
  year: number;
  quarter: number;
  item_key: string;
  reason: string | null;
  marked_at: string;
};

export type YearSummary = {
  meetings: { quarter: number; status: string }[];
  safety: { quarter: number; status: string }[];
  reviews: { quarter: number; status: string }[];
  drills: { quarter: number; status: string }[];
  qapi: { quarter: number; status: string }[];
  onCallAt: string[];
  attestations: { period_kind: string; quarter: number | null; month: number | null }[];
  incidentDates: string[];
  projects: { id: string; project_name: string; status: string; updated_at: string }[];
  naMarks: { quarter: number; item_key: string }[];
};
