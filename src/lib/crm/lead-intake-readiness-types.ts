export const LEAD_INTAKE_READINESS_STATUSES = [
  "needs_review",
  "ready",
  "needs_info",
  "needs_clinical_review",
  "needs_payer_review",
  "needs_staffing_review",
  "cannot_accept",
  "accepted",
  "declined",
] as const;

export type LeadIntakeReadinessStatus = (typeof LEAD_INTAKE_READINESS_STATUSES)[number];

export const LEAD_INTAKE_DECISIONS = [
  "pending",
  "request_info",
  "clinical_review",
  "payer_review",
  "staffing_review",
  "accept",
  "decline",
  "hold",
] as const;

export type LeadIntakeDecision = (typeof LEAD_INTAKE_DECISIONS)[number];

export const LEAD_INTAKE_PAYER_STATUSES = [
  "unknown",
  "acceptable",
  "needs_verification",
  "out_of_network",
  "not_accepted",
] as const;

export type LeadIntakePayerStatus = (typeof LEAD_INTAKE_PAYER_STATUSES)[number];

export const LEAD_INTAKE_DOCUMENT_STATUSES = [
  "missing",
  "partial",
  "complete",
  "needs_review",
] as const;

export type LeadIntakeDocumentStatus = (typeof LEAD_INTAKE_DOCUMENT_STATUSES)[number];

export const LEAD_INTAKE_CLINICAL_STATUSES = [
  "unknown",
  "appears_appropriate",
  "needs_clinical_review",
  "not_appropriate",
] as const;

export type LeadIntakeClinicalStatus = (typeof LEAD_INTAKE_CLINICAL_STATUSES)[number];

export const LEAD_INTAKE_SERVICE_AREA_STATUSES = [
  "unknown",
  "in_area",
  "out_of_area",
  "needs_review",
] as const;

export type LeadIntakeServiceAreaStatus = (typeof LEAD_INTAKE_SERVICE_AREA_STATUSES)[number];

export const LEAD_INTAKE_STAFFING_STATUSES = [
  "unknown",
  "available",
  "limited",
  "unavailable",
  "needs_review",
] as const;

export type LeadIntakeStaffingStatus = (typeof LEAD_INTAKE_STAFFING_STATUSES)[number];

export const LEAD_INTAKE_DECLINE_REASONS = [
  "payer not accepted",
  "out of service area",
  "staffing unavailable",
  "not home health appropriate",
  "duplicate",
  "unable to contact",
  "other",
] as const;

export type LeadIntakeDeclineReason = (typeof LEAD_INTAKE_DECLINE_REASONS)[number];

export type LeadIntakeReadinessReviewRow = {
  id: string;
  lead_id: string;
  readiness_status: LeadIntakeReadinessStatus;
  readiness_score: number | null;
  decision: LeadIntakeDecision | null;
  payer_status: LeadIntakePayerStatus | null;
  document_status: LeadIntakeDocumentStatus | null;
  clinical_status: LeadIntakeClinicalStatus | null;
  service_area_status: LeadIntakeServiceAreaStatus | null;
  staffing_status: LeadIntakeStaffingStatus | null;
  missing_items: string[] | null;
  blockers: string[] | null;
  warnings: string[] | null;
  suggested_next_action: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  declined_by: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  notes: string | null;
  ai_summary: string | null;
  ai_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type LeadIntakeReadinessSummary = {
  review: LeadIntakeReadinessReviewRow;
  can_decide: boolean;
  lead_status: string | null;
  is_terminal: boolean;
};

export type UpdateLeadIntakeReadinessInput = {
  readiness_status?: LeadIntakeReadinessStatus;
  decision?: LeadIntakeDecision | null;
  payer_status?: LeadIntakePayerStatus | null;
  document_status?: LeadIntakeDocumentStatus | null;
  clinical_status?: LeadIntakeClinicalStatus | null;
  service_area_status?: LeadIntakeServiceAreaStatus | null;
  staffing_status?: LeadIntakeStaffingStatus | null;
  missing_items?: string[] | null;
  blockers?: string[] | null;
  warnings?: string[] | null;
  suggested_next_action?: string | null;
  notes?: string | null;
};

export type AcceptLeadReferralInput = {
  note?: string | null;
  intake_owner_id?: string | null;
  create_soc_task?: boolean;
};

export type DeclineLeadReferralInput = {
  decline_reason: LeadIntakeDeclineReason | string;
  internal_note?: string | null;
};

export type RequestMissingReferralInfoInput = {
  missing_items: string[];
  message?: string | null;
  create_follow_up_task?: boolean;
  due_at?: string | null;
};

export type ClinicalReviewReferralInput = {
  assign_to?: string | null;
  clinical_note?: string | null;
  due_at?: string | null;
};

export type IntakeReadinessAnalytics = {
  newReferrals: number;
  readyReferrals: number;
  needsInfo: number;
  needsPayerReview: number;
  needsClinicalReview: number;
  accepted: number;
  declined: number;
  averageReadinessScore: number | null;
  averageHoursToAcceptance: number | null;
  topMissingItems: Array<{ item: string; count: number }>;
  topDeclineReasons: Array<{ reason: string; count: number }>;
  byFacilityAccepted: Array<{ facilityId: string; facilityName: string; count: number }>;
  byFacilityIncomplete: Array<{ facilityId: string; facilityName: string; count: number }>;
};
