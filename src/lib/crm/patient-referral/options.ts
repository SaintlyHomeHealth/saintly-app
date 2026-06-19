export const PATIENT_REFERRAL_SOURCE_OPTIONS = [
  { value: "tango_dina", label: "Tango / Dina" },
  { value: "doctor_provider", label: "Doctor / Provider Office" },
  { value: "hospital_facility", label: "Hospital / Facility" },
  { value: "sales_agent", label: "Sales Agent" },
  { value: "call_in", label: "Call-In" },
  { value: "website_lead", label: "Website Lead" },
  { value: "fax", label: "Fax" },
  { value: "email", label: "Email" },
  { value: "existing_patient_family", label: "Existing Patient / Family Referral" },
  { value: "insurance_payer", label: "Insurance / Payer" },
  { value: "other", label: "Other" },
] as const;

export type PatientReferralSourceType = (typeof PATIENT_REFERRAL_SOURCE_OPTIONS)[number]["value"];

export const PATIENT_REFERRAL_DOCUMENT_TYPES = [
  "referral",
  "doctor_order",
  "tango_authorization",
  "hospital_discharge",
  "insurance_authorization",
  "face_sheet",
  "other",
] as const;

export type PatientReferralDocumentType = (typeof PATIENT_REFERRAL_DOCUMENT_TYPES)[number];

export const PATIENT_REFERRAL_PARSE_STATUSES = [
  "uploading",
  "reading",
  "extracting",
  "needs_review",
  "ready",
  "duplicate",
  "failed",
  "manual",
] as const;

export type PatientReferralParseStatus = (typeof PATIENT_REFERRAL_PARSE_STATUSES)[number];

export const DEFAULT_INTAKE_STATUS = "New Referral";
export const DEFAULT_PATIENT_STATUS = "pending";

export function isValidPatientReferralSourceType(v: string): v is PatientReferralSourceType {
  return (PATIENT_REFERRAL_SOURCE_OPTIONS as readonly { value: string }[]).some((o) => o.value === v);
}

export function isValidPatientReferralDocumentType(v: string): v is PatientReferralDocumentType {
  return (PATIENT_REFERRAL_DOCUMENT_TYPES as readonly string[]).includes(v);
}

export function patientReferralSourceLabel(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  const hit = PATIENT_REFERRAL_SOURCE_OPTIONS.find((o) => o.value === v);
  return hit?.label ?? (v || "—");
}
