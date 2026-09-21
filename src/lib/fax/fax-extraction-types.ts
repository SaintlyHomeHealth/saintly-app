export const FAX_DOCUMENT_TYPES = [
  "referral",
  "signed_485",
  "progress_note",
  "encounter_note",
  "dme_order",
  "auth_approval",
  "auth_denial",
  "records_request",
  "cover_sheet_only",
  "other",
] as const;

export type FaxDocumentType = (typeof FAX_DOCUMENT_TYPES)[number];

export const FAX_EXTRACTION_STATUSES = [
  "pending",
  "extracted",
  "needs_review",
  "media_missing",
  "failed",
] as const;

export type FaxExtractionStatus = (typeof FAX_EXTRACTION_STATUSES)[number];

export const FAX_TRIAGE_STATES = ["new", "reviewed", "assigned", "filed", "needs_review", "failed"] as const;

export type FaxTriageState = (typeof FAX_TRIAGE_STATES)[number];

export type FaxExtractionConfidence = {
  patientName: number;
  documentType: number;
};

export type FaxStructuredExtraction = {
  patientName: string | null;
  patientDob: string | null;
  documentType: FaxDocumentType;
  serviceDate: string | null;
  referringProvider: string | null;
  clinician: string | null;
  payer: string | null;
  senderOrg: string | null;
  disciplines: string[];
  confidence: FaxExtractionConfidence;
  sourcePage: number | null;
};

export const FAX_DOCUMENT_TYPE_LABEL: Record<FaxDocumentType, string> = {
  referral: "Referral",
  signed_485: "Signed 485",
  progress_note: "Progress note",
  encounter_note: "Encounter note",
  dme_order: "DME order",
  auth_approval: "Auth approval",
  auth_denial: "Auth denial",
  records_request: "Records request",
  cover_sheet_only: "Cover sheet",
  other: "Other",
};

export const FAX_TRIAGE_LABEL: Record<FaxTriageState, string> = {
  new: "New",
  reviewed: "Reviewed",
  assigned: "Assigned",
  filed: "Filed",
  needs_review: "Needs review",
  failed: "Failed",
};

export const PATIENT_NAME_CONFIDENCE_THRESHOLD = 0.6;

export function isFaxDocumentType(v: unknown): v is FaxDocumentType {
  return typeof v === "string" && (FAX_DOCUMENT_TYPES as readonly string[]).includes(v);
}

export function isFaxTriageState(v: unknown): v is FaxTriageState {
  return typeof v === "string" && (FAX_TRIAGE_STATES as readonly string[]).includes(v);
}
