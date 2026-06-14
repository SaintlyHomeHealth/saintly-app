export const FACILITY_REFERRAL_LEAD_STATUSES = [
  { value: "new", label: "New" },
  { value: "attempted_contact", label: "Contacted" },
  { value: "waiting_on_referral", label: "Waiting on Orders" },
  { value: "verify_insurance", label: "Insurance Verification" },
  { value: "dead_lead", label: "Not Eligible / Lost" },
  { value: "converted", label: "Converted to Patient" },
] as const;

export type FacilityReferralLeadStatus = (typeof FACILITY_REFERRAL_LEAD_STATUSES)[number]["value"];

export type FacilityReferralLeadInput = {
  facility_id: string;
  contact_id?: string | null;
  activity_id?: string | null;
  referral_date?: string | null;
  sales_rep_id?: string | null;
  status?: string;
  patient_first_name?: string;
  patient_last_name?: string;
  patient_phone?: string;
  patient_dob?: string | null;
  payer?: string;
  service_needed?: string | string[];
  notes?: string;
  create_follow_up_task?: boolean;
  force_create?: boolean;
  attribution?: {
    source_type?: string;
    source_name?: string;
    originating_activity_type?: string | null;
    originating_outcome?: string | null;
  };
};

export type FacilityReferralDuplicateHit = {
  lead_id: string;
  patient_name: string;
  status: string | null;
  matched_by: string[];
  created_at: string | null;
};

export type FacilityReferralAttributionSummary = {
  total_leads: number;
  open_referrals: number;
  converted: number;
  lost: number;
  last_referral_at: string | null;
  top_contact_name: string | null;
  top_rep_label: string | null;
  pending_intake_tasks: number;
  next_source_follow_up: { title: string; due_at: string } | null;
  last_referral_outcome: string | null;
  referrals_needing_info?: number;
  recent_leads: Array<{
    lead_id: string;
    patient_name: string;
    status: string;
    pipeline_stage_label: string;
    service_type: string | null;
    payer_name: string | null;
    created_at: string;
    updated_at: string;
    created_by_label: string | null;
    intake_owner_label: string | null;
    readiness_status?: string | null;
    readiness_score?: number | null;
    readiness_missing_count?: number;
  }>;
};

export type FacilityReferralAiDetection = {
  referral_detected: boolean;
  patient_first_name: string | null;
  patient_last_name: string | null;
  patient_phone: string | null;
  patient_dob: string | null;
  payer: string | null;
  service_needed: string | null;
  referral_notes: string | null;
  should_create_referral_lead: boolean;
};
