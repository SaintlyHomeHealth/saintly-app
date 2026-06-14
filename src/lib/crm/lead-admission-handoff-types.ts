export const ADMISSION_HANDOFF_STATUSES = [
  "draft",
  "intake_review",
  "ready_for_soc",
  "scheduled",
  "admitted",
  "on_hold",
  "canceled",
] as const;

export type AdmissionHandoffStatus = (typeof ADMISSION_HANDOFF_STATUSES)[number];

export const ADMISSION_PRIORITIES = ["Low", "Normal", "High", "Urgent"] as const;
export type AdmissionPriority = (typeof ADMISSION_PRIORITIES)[number];

export const ADMISSION_PAYER_STATUSES = [
  "unknown",
  "needs_verification",
  "verified",
  "not_accepted",
  "auth_required",
  "auth_pending",
  "auth_approved",
  "auth_denied",
] as const;

export type AdmissionPayerStatus = (typeof ADMISSION_PAYER_STATUSES)[number];

export const ADMISSION_AUTH_STATUSES = [
  "not_required",
  "unknown",
  "required",
  "pending",
  "approved",
  "denied",
] as const;

export type AdmissionAuthStatus = (typeof ADMISSION_AUTH_STATUSES)[number];

export const ADMISSION_SOC_STATUSES = [
  "not_scheduled",
  "target_set",
  "scheduled",
  "completed",
  "delayed",
  "canceled",
] as const;

export type AdmissionSocStatus = (typeof ADMISSION_SOC_STATUSES)[number];

export const ADMISSION_ALORA_STATUSES = [
  "not_started",
  "entered",
  "pending_info",
  "completed",
  "not_applicable",
] as const;

export type AdmissionAloraStatus = (typeof ADMISSION_ALORA_STATUSES)[number];

export const ADMISSION_ORDER_STATUSES = [
  "missing",
  "requested",
  "received",
  "reviewed",
  "not_required",
  "unknown",
] as const;

export type AdmissionOrderStatus = (typeof ADMISSION_ORDER_STATUSES)[number];

export const ADMISSION_DOCUMENT_STATUSES = ["missing", "partial", "complete", "needs_review"] as const;
export type AdmissionDocumentStatus = (typeof ADMISSION_DOCUMENT_STATUSES)[number];

export const ADMISSION_CHECKLIST_STATUSES = ["pending", "complete", "not_required", "blocked"] as const;
export type AdmissionChecklistItemStatus = (typeof ADMISSION_CHECKLIST_STATUSES)[number];

export type LeadAdmissionHandoffRow = {
  id: string;
  lead_id: string;
  patient_id: string | null;
  referring_facility_id: string | null;
  referring_facility_contact_id: string | null;
  source_link_id: string | null;
  intake_readiness_review_id: string | null;
  status: AdmissionHandoffStatus;
  admission_priority: AdmissionPriority;
  primary_discipline: string | null;
  requested_services: string[] | null;
  payer_name: string | null;
  payer_status: AdmissionPayerStatus | null;
  auth_required: boolean | null;
  auth_status: AdmissionAuthStatus | null;
  benefits_verified: boolean;
  benefits_verified_at: string | null;
  benefits_verified_by: string | null;
  target_soc_date: string | null;
  scheduled_soc_at: string | null;
  soc_status: AdmissionSocStatus | null;
  assigned_intake_owner: string | null;
  assigned_clinician_id: string | null;
  assigned_clinician_name: string | null;
  alora_status: AdmissionAloraStatus | null;
  alora_patient_id: string | null;
  alora_entered_at: string | null;
  alora_entered_by: string | null;
  physician_order_status: AdmissionOrderStatus | null;
  f2f_status: AdmissionOrderStatus | null;
  documents_status: AdmissionDocumentStatus | null;
  missing_items: string[] | null;
  blockers: string[] | null;
  notes: string | null;
  created_by: string | null;
  completed_by: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type LeadAdmissionChecklistItemRow = {
  id: string;
  admission_handoff_id: string;
  key: string;
  label: string;
  category: string | null;
  status: AdmissionChecklistItemStatus;
  required: boolean;
  due_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type AdmissionHandoffListFilters = {
  status?: AdmissionHandoffStatus | AdmissionHandoffStatus[] | null;
  tab?: "needs_review" | "ready_for_soc" | "scheduled" | "on_hold" | "admitted" | "all" | null;
  priority?: AdmissionPriority | null;
  target_soc_from?: string | null;
  target_soc_to?: string | null;
  assigned_intake_owner?: string | null;
  assigned_clinician_id?: string | null;
  payer_status?: AdmissionPayerStatus | null;
  auth_status?: AdmissionAuthStatus | null;
  alora_status?: AdmissionAloraStatus | null;
  referring_facility_id?: string | null;
  has_missing_items?: boolean | null;
  rep_id?: string | null;
  limit?: number;
};

export type AdmissionHandoffListCard = {
  id: string;
  lead_id: string;
  patient_id: string | null;
  patient_name: string;
  facility_id: string | null;
  facility_name: string | null;
  status: AdmissionHandoffStatus;
  admission_priority: AdmissionPriority;
  payer_name: string | null;
  payer_status: AdmissionPayerStatus | null;
  requested_services: string[] | null;
  primary_discipline: string | null;
  target_soc_date: string | null;
  scheduled_soc_at: string | null;
  assigned_clinician_name: string | null;
  intake_owner_label: string | null;
  checklist_complete: number;
  checklist_total: number;
  missing_item_count: number;
  blocker_count: number;
  alora_status: AdmissionAloraStatus | null;
  created_at: string;
};

export type AdmissionHandoffDetail = {
  handoff: LeadAdmissionHandoffRow;
  checklist: LeadAdmissionChecklistItemRow[];
  patient_name: string;
  facility_name: string | null;
  lead_status: string | null;
  document_count: number;
  documents_needing_review: number;
  ai_summary_available: boolean;
  can_edit: boolean;
  intake_owner_label: string | null;
  alora_summary_text: string | null;
};

export type UpdateAdmissionHandoffInput = Partial<
  Pick<
    LeadAdmissionHandoffRow,
    | "status"
    | "admission_priority"
    | "primary_discipline"
    | "requested_services"
    | "payer_name"
    | "payer_status"
    | "auth_required"
    | "auth_status"
    | "benefits_verified"
    | "target_soc_date"
    | "scheduled_soc_at"
    | "soc_status"
    | "assigned_intake_owner"
    | "assigned_clinician_id"
    | "assigned_clinician_name"
    | "alora_status"
    | "alora_patient_id"
    | "physician_order_status"
    | "f2f_status"
    | "documents_status"
    | "missing_items"
    | "blockers"
    | "notes"
    | "patient_id"
  >
> & {
  benefits_verified_note?: string | null;
};

export type UpdateAdmissionChecklistItemInput = {
  status?: AdmissionChecklistItemStatus;
  notes?: string | null;
  due_at?: string | null;
};

export type AdmissionHandoffAnalytics = {
  acceptedReferrals: number;
  handoffsCreated: number;
  readyForSoc: number;
  scheduledSoc: number;
  admitted: number;
  onHold: number;
  avgHoursReferralToAccepted: number | null;
  avgHoursAcceptedToReady: number | null;
  avgHoursAcceptedToScheduled: number | null;
  topBlockers: Array<{ item: string; count: number }>;
  missingByCategory: Array<{ category: string; count: number }>;
  byFacility: Array<{ facilityId: string; facilityName: string; count: number }>;
};

export const DEFAULT_ADMISSION_CHECKLIST_ITEMS: Array<{
  key: string;
  label: string;
  category: string;
}> = [
  { key: "demographics_verified", label: "Patient demographics verified", category: "patient" },
  { key: "contact_verified", label: "Patient phone/contact verified", category: "patient" },
  { key: "payer_verified", label: "Payer/benefits verified", category: "payer" },
  { key: "auth_checked", label: "Authorization checked", category: "payer" },
  { key: "physician_order", label: "Physician order received/reviewed", category: "clinical" },
  { key: "f2f_reviewed", label: "F2F status reviewed", category: "clinical" },
  { key: "documents_reviewed", label: "Required documents reviewed", category: "documents" },
  { key: "soc_target_set", label: "SOC target date set", category: "soc" },
  { key: "clinician_assigned", label: "Clinician assigned", category: "soc" },
  { key: "alora_entry", label: "Alora entry completed", category: "alora" },
  { key: "referral_source_updated", label: "Referral source updated", category: "source" },
  { key: "patient_contacted", label: "Patient/family contacted", category: "patient" },
];
