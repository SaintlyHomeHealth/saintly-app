export const LEAD_REFERRAL_DOCUMENTS_BUCKET = "lead-referral-documents";

export const LEAD_REFERRAL_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export const LEAD_REFERRAL_DOCUMENT_MAX_FILES = 5;

export const LEAD_REFERRAL_DOCUMENT_TYPES = [
  "face_sheet",
  "physician_order",
  "demographics",
  "insurance_card",
  "medication_list",
  "wound_note",
  "clinical_note",
  "referral_packet",
  "other",
] as const;

export type LeadReferralDocumentType = (typeof LEAD_REFERRAL_DOCUMENT_TYPES)[number];

const DOCUMENT_TYPE_SET = new Set<string>(LEAD_REFERRAL_DOCUMENT_TYPES);

export function isLeadReferralDocumentType(v: string): v is LeadReferralDocumentType {
  return DOCUMENT_TYPE_SET.has(v);
}

export const LEAD_REFERRAL_DOCUMENT_TYPE_LABELS: Record<LeadReferralDocumentType, string> = {
  face_sheet: "Face sheet",
  physician_order: "Physician order",
  demographics: "Demographics",
  insurance_card: "Insurance card",
  medication_list: "Medication list",
  wound_note: "Wound note",
  clinical_note: "Clinical note",
  referral_packet: "Referral packet",
  other: "Other",
};

export const LEAD_REFERRAL_DOCUMENT_REVIEW_STATUSES = ["needs_review", "reviewed", "rejected"] as const;

export type LeadReferralDocumentReviewStatus = (typeof LEAD_REFERRAL_DOCUMENT_REVIEW_STATUSES)[number];

const MIME_ALLOW = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function isAllowedLeadReferralDocumentContentType(mime: string): boolean {
  const t = mime.trim().toLowerCase();
  if (!t) return false;
  return MIME_ALLOW.has(t);
}

export function sanitizeReferralDocumentFileName(name: string): string {
  const base = typeof name === "string" && name.trim() ? name.trim() : "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return cleaned.slice(0, 180) || "file";
}
