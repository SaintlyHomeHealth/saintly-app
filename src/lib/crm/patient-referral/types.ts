import type { PatientReferralDocumentType, PatientReferralParseStatus, PatientReferralSourceType } from "./options";

export type PatientReferralListRow = {
  id: string;
  referral_source_type: string;
  referral_facility: string | null;
  received_date: string | null;
  requested_soc_date: string | null;
  insurance_name: string | null;
  authorization_number: string | null;
  sn_visits: number | null;
  pt_visits: number | null;
  ot_visits: number | null;
  st_visits: number | null;
  msw_visits: number | null;
  hha_visits: number | null;
  intake_status: string | null;
  chief_complaint: string | null;
  notes: string | null;
  created_at: string;
};

export type PatientFileListRow = {
  id: string;
  file_name: string;
  file_path: string;
  document_type: string | null;
  referral_source_type: string | null;
  created_at: string;
};

export type PatientReferralFieldConfidence = "high" | "medium" | "low";

export type PatientReferralFieldDebug<T = string | number | boolean | null> = {
  value: T;
  confidence: PatientReferralFieldConfidence;
  source?: string;
};

export type ParsedPatientReferralSuggestions = {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  date_of_birth?: string | null;
  age?: number | null;
  sex?: string | null;
  phone?: string | null;
  alternate_phone?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  emergency_contact_1_name?: string | null;
  emergency_contact_1_phone?: string | null;
  emergency_contact_2_name?: string | null;
  emergency_contact_2_phone?: string | null;
  referral_source_type?: PatientReferralSourceType | null;
  referral_source_name?: string | null;
  referral_facility?: string | null;
  referral_received_date?: string | null;
  requested_soc_date?: string | null;
  best_available_soc_date?: string | null;
  discharge_date?: string | null;
  chief_complaint?: string | null;
  diagnosis_text?: string | null;
  diagnosis_code?: string | null;
  prior_medical_history?: string | null;
  allergies?: string | null;
  notes?: string | null;
  ordering_physician_name?: string | null;
  ordering_physician_phone?: string | null;
  ordering_physician_fax?: string | null;
  pcp_name?: string | null;
  pcp_phone?: string | null;
  pcp_fax?: string | null;
  following_physician_name?: string | null;
  following_physician_phone?: string | null;
  following_physician_fax?: string | null;
  insurance_name?: string | null;
  payer_type?: string | null;
  member_id?: string | null;
  medicaid_id?: string | null;
  mbi?: string | null;
  authorization_number?: string | null;
  authorization_type?: string | null;
  authorization_bill_type?: string | null;
  authorization_effective_start?: string | null;
  authorization_effective_end?: string | null;
  skilled_nursing_visits?: number | null;
  pt_visits?: number | null;
  ot_visits?: number | null;
  st_visits?: number | null;
  msw_visits?: number | null;
  hha_visits?: number | null;
  approved_disciplines?: string[] | null;
  denied_disciplines?: string[] | null;
  total_authorized_visits?: number | null;
  authorization_status?: string | null;
  agency_assigned?: string | null;
  assigned_to_saintly?: boolean | null;
  intake_status?: string | null;
  patient_status?: string | null;
  source_contact_name?: string | null;
  source_phone?: string | null;
  source_fax?: string | null;
  source_email?: string | null;
  sales_agent_name?: string | null;
  document_type?: PatientReferralDocumentType | null;
};

export type PatientReferralParseQuality =
  | "parsed_ok"
  | "limited_parse"
  | "needs_review"
  | "ocr_success"
  | "ocr_limited"
  | "manual"
  | "tango_parsed";

export type PatientReferralExtractionMethod = "pdf_text" | "ocr" | "hybrid" | "manual" | "tango" | "ai";

export type PatientReferralParsePayload = {
  ok: boolean;
  quality: PatientReferralParseQuality;
  suggestions: ParsedPatientReferralSuggestions | null;
  messages: string[];
  statusHeadline?: string;
  extractionMethod?: PatientReferralExtractionMethod;
  confidenceWarnings?: string[];
  parseNotes?: string[];
  needsReview?: boolean;
  isTangoDocument?: boolean;
  documentType?: PatientReferralDocumentType | null;
};

export type PatientReferralUploadStatus =
  | "uploading"
  | "reading"
  | "extracting"
  | "needs_review"
  | "ready"
  | "duplicate"
  | "failed";

export function uploadStatusLabel(status: PatientReferralUploadStatus | PatientReferralParseStatus): string {
  switch (status) {
    case "uploading":
      return "Uploading";
    case "reading":
      return "Reading document";
    case "extracting":
      return "Extracting patient information";
    case "needs_review":
      return "Needs review";
    case "ready":
      return "Ready to create patient";
    case "duplicate":
      return "Duplicate found";
    case "failed":
      return "Failed to parse";
    case "manual":
      return "Manual entry";
    default:
      return status;
  }
}
