/** Pipeline stage keys for facility referral intake (maps to existing CRM lead statuses). */
export const FACILITY_REFERRAL_PIPELINE_STAGES = [
  {
    key: "new_referral",
    label: "New Referral",
    statuses: ["new", "new_lead", "new_applicant"],
  },
  {
    key: "contact_patient",
    label: "Contact Patient",
    statuses: ["attempted_contact", "spoke", "intake_in_progress"],
  },
  {
    key: "verify_insurance",
    label: "Verify Insurance",
    statuses: ["verify_insurance"],
  },
  {
    key: "waiting_orders",
    label: "Waiting on Orders / F2F",
    statuses: ["waiting_on_referral", "waiting_on_documents"],
  },
  {
    key: "ready_soc",
    label: "Ready for SOC / Scheduling",
    statuses: ["ready_to_convert", "admitted"],
  },
  {
    key: "converted",
    label: "Converted to Patient",
    statuses: ["converted"],
  },
  {
    key: "lost",
    label: "Lost / Not Eligible",
    statuses: ["dead_lead", "duplicate_lead"],
  },
] as const;

export type FacilityReferralPipelineStageKey =
  (typeof FACILITY_REFERRAL_PIPELINE_STAGES)[number]["key"];

export const FACILITY_REFERRAL_LOST_REASONS = [
  "Insurance not accepted",
  "Patient declined",
  "Unable to contact patient",
  "Not home health eligible",
  "Already with another agency",
  "Outside service area",
  "No orders/F2F",
  "Duplicate lead",
  "Other",
] as const;

export type FacilityReferralLostReason = (typeof FACILITY_REFERRAL_LOST_REASONS)[number];

export type FacilityReferralChecklistRow = {
  id: string;
  lead_id: string;
  referring_facility_id: string | null;
  patient_contacted: boolean;
  insurance_verified: boolean;
  service_need_confirmed: boolean;
  orders_requested: boolean;
  f2f_requested: boolean;
  packet_received: boolean;
  soc_availability_checked: boolean;
  clinician_scheduling_started: boolean;
  referral_source_updated: boolean;
  converted_or_closed: boolean;
  checklist_json: Record<string, unknown> | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FacilityReferralPipelineCard = {
  lead_id: string;
  patient_name: string;
  phone: string | null;
  payer: string | null;
  service_needed: string | null;
  facility_id: string | null;
  facility_name: string | null;
  facility_contact_name: string | null;
  sales_rep_id: string | null;
  sales_rep_label: string | null;
  intake_owner_id: string | null;
  intake_owner_label: string | null;
  status: string;
  pipeline_stage: FacilityReferralPipelineStageKey;
  pipeline_stage_label: string;
  created_at: string;
  updated_at: string;
  referral_received_at: string | null;
  referral_age_days: number;
  urgency: "normal" | "attention" | "urgent";
  next_task_due: string | null;
  next_task_title: string | null;
  lost_reason: string | null;
  checklist: FacilityReferralChecklistRow | null;
  needs_referral_source_review?: boolean;
  referral_source_type?: string | null;
  typed_referring_facility_name?: string | null;
  referral_source_match_confidence?: number | null;
  document_count?: number;
  documents_needing_review?: number;
  document_types?: string[];
  missing_physician_order?: boolean;
  missing_face_sheet?: boolean;
  ai_reviewed_count?: number;
  ai_review_needed_count?: number;
  ai_missing_physician_order?: boolean;
  ai_missing_insurance?: boolean;
  ai_missing_demographics?: boolean;
  readiness_status?: import("@/lib/crm/lead-intake-readiness-types").LeadIntakeReadinessStatus;
  readiness_score?: number | null;
  readiness_missing_count?: number;
  readiness_next_action?: string | null;
};

export type FacilityReferralPipelineSummary = {
  total: number;
  by_stage: Record<FacilityReferralPipelineStageKey, number>;
  alerts: {
    unassigned: number;
    stuck_3_days: number;
    waiting_orders_3_days: number;
    overdue_tasks: number;
    documents_needing_review: number;
    referrals_with_documents: number;
    referrals_without_documents: number;
  };
};

export type ReferralPipelineHealthRow = {
  stage_key: FacilityReferralPipelineStageKey;
  stage_label: string;
  count: number;
  average_age_days: number | null;
  oldest_referral_at: string | null;
  action_needed: string | null;
};
