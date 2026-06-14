import type { LeadReferralDocumentType } from "@/lib/crm/lead-referral-documents-constants";

export type LeadReferralDocumentAiChecklistSuggestion = {
  key: string;
  label: string;
  suggested_status: "complete" | "needs_review";
  reason: string;
};

export type LeadReferralDocumentExtraction = {
  document_type: LeadReferralDocumentType | "other" | null;
  confidence: number | null;
  summary: string;
  patient: {
    first_name: string;
    last_name: string;
    dob: string;
    phone: string;
    address: string;
  };
  payer: {
    name: string;
    member_id: string;
    plan_type: string;
  };
  provider: {
    ordering_provider_name: string;
    practice_name: string;
    phone: string;
    fax: string;
  };
  services_requested: string[];
  diagnoses_or_clinical_notes: string;
  order_detected: boolean;
  face_sheet_detected: boolean;
  insurance_detected: boolean;
  missing_items: string[];
  suggested_checklist_updates: LeadReferralDocumentAiChecklistSuggestion[];
  warnings: string[];
};

export type LeadDocumentIntakeSummary = {
  configured: boolean;
  document_count: number;
  ai_ready_count: number;
  ai_pending_count: number;
  ai_failed_count: number;
  average_confidence: number | null;
  combined_summary: string | null;
  patient: LeadReferralDocumentExtraction["patient"];
  payer: LeadReferralDocumentExtraction["payer"];
  provider: LeadReferralDocumentExtraction["provider"];
  services_requested: string[];
  diagnoses_or_clinical_notes: string | null;
  missing_items: string[];
  suggested_checklist_updates: LeadReferralDocumentAiChecklistSuggestion[];
  warnings: string[];
  order_detected: boolean;
  face_sheet_detected: boolean;
  insurance_detected: boolean;
  documents: Array<{
    id: string;
    original_file_name: string;
    document_type: LeadReferralDocumentType | null;
    status: string;
    ai_processed_at: string | null;
    ai_confidence: number | null;
    ai_processing_error: string | null;
    extracted_summary: string | null;
    extraction: LeadReferralDocumentExtraction | null;
  }>;
};

export type ApplyLeadDocumentSuggestionsInput = {
  selected_fields: Partial<{
    patient_first_name: string;
    patient_last_name: string;
    dob: string;
    phone: string;
    address_line_1: string;
    address_line_2: string;
    city: string;
    state: string;
    zip: string;
    primary_payer_name: string;
    payer_name: string;
    service_type: string;
    notes: string;
    referring_provider_name: string;
    doctor_office_name: string;
    doctor_office_phone: string;
    referring_doctor_name: string;
  }>;
  selected_checklist_updates: Array<{ key: string; apply: boolean }>;
  notes: string | null;
};

export type AnalyzeDocumentResult =
  | { ok: true; document_id: string; extraction: LeadReferralDocumentExtraction }
  | { ok: false; error: string; message: string };
