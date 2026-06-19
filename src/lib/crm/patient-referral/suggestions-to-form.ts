import type { ParsedPatientReferralSuggestions } from "./types";
import { DEFAULT_INTAKE_STATUS, DEFAULT_PATIENT_STATUS } from "./options";

export type PatientReferralReviewFormState = {
  first_name: string;
  last_name: string;
  full_name: string;
  date_of_birth: string;
  age: string;
  sex: string;
  phone: string;
  alternate_phone: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  zip: string;
  emergency_contact_1_name: string;
  emergency_contact_1_phone: string;
  emergency_contact_2_name: string;
  emergency_contact_2_phone: string;
  referral_source_type: string;
  referral_source_name: string;
  referral_facility: string;
  source_contact_name: string;
  source_phone: string;
  source_fax: string;
  source_email: string;
  sales_agent_name: string;
  referral_received_date: string;
  requested_soc_date: string;
  best_available_soc_date: string;
  discharge_date: string;
  chief_complaint: string;
  diagnosis_text: string;
  diagnosis_code: string;
  prior_medical_history: string;
  allergies: string;
  notes: string;
  ordering_physician_name: string;
  ordering_physician_phone: string;
  ordering_physician_fax: string;
  pcp_name: string;
  pcp_phone: string;
  pcp_fax: string;
  following_physician_name: string;
  following_physician_phone: string;
  following_physician_fax: string;
  insurance_name: string;
  payer_type: string;
  member_id: string;
  medicaid_id: string;
  mbi: string;
  authorization_number: string;
  authorization_type: string;
  authorization_bill_type: string;
  authorization_effective_start: string;
  authorization_effective_end: string;
  skilled_nursing_visits: string;
  pt_visits: string;
  ot_visits: string;
  st_visits: string;
  msw_visits: string;
  hha_visits: string;
  approved_disciplines: string;
  denied_disciplines: string;
  total_authorized_visits: string;
  authorization_status: string;
  agency_assigned: string;
  assigned_to_saintly: string;
  intake_status: string;
  patient_status: string;
  document_type: string;
};

export const EMPTY_PATIENT_REFERRAL_REVIEW_FORM: PatientReferralReviewFormState = {
  first_name: "",
  last_name: "",
  full_name: "",
  date_of_birth: "",
  age: "",
  sex: "",
  phone: "",
  alternate_phone: "",
  address_line_1: "",
  address_line_2: "",
  city: "",
  state: "",
  zip: "",
  emergency_contact_1_name: "",
  emergency_contact_1_phone: "",
  emergency_contact_2_name: "",
  emergency_contact_2_phone: "",
  referral_source_type: "",
  referral_source_name: "",
  referral_facility: "",
  source_contact_name: "",
  source_phone: "",
  source_fax: "",
  source_email: "",
  sales_agent_name: "",
  referral_received_date: "",
  requested_soc_date: "",
  best_available_soc_date: "",
  discharge_date: "",
  chief_complaint: "",
  diagnosis_text: "",
  diagnosis_code: "",
  prior_medical_history: "",
  allergies: "",
  notes: "",
  ordering_physician_name: "",
  ordering_physician_phone: "",
  ordering_physician_fax: "",
  pcp_name: "",
  pcp_phone: "",
  pcp_fax: "",
  following_physician_name: "",
  following_physician_phone: "",
  following_physician_fax: "",
  insurance_name: "",
  payer_type: "",
  member_id: "",
  medicaid_id: "",
  mbi: "",
  authorization_number: "",
  authorization_type: "",
  authorization_bill_type: "",
  authorization_effective_start: "",
  authorization_effective_end: "",
  skilled_nursing_visits: "",
  pt_visits: "",
  ot_visits: "",
  st_visits: "",
  msw_visits: "",
  hha_visits: "",
  approved_disciplines: "",
  denied_disciplines: "",
  total_authorized_visits: "",
  authorization_status: "",
  agency_assigned: "",
  assigned_to_saintly: "",
  intake_status: DEFAULT_INTAKE_STATUS,
  patient_status: DEFAULT_PATIENT_STATUS,
  document_type: "",
};

function str(v: string | number | boolean | null | undefined): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "1" : "";
  return String(v);
}

export function parsedSuggestionsToReviewForm(
  s: ParsedPatientReferralSuggestions,
  referralSourceType?: string
): PatientReferralReviewFormState {
  return {
    ...EMPTY_PATIENT_REFERRAL_REVIEW_FORM,
    first_name: str(s.first_name),
    last_name: str(s.last_name),
    full_name: str(s.full_name),
    date_of_birth: str(s.date_of_birth),
    age: str(s.age),
    sex: str(s.sex),
    phone: str(s.phone),
    alternate_phone: str(s.alternate_phone),
    address_line_1: str(s.address_line_1),
    address_line_2: str(s.address_line_2),
    city: str(s.city),
    state: str(s.state),
    zip: str(s.zip),
    emergency_contact_1_name: str(s.emergency_contact_1_name),
    emergency_contact_1_phone: str(s.emergency_contact_1_phone),
    emergency_contact_2_name: str(s.emergency_contact_2_name),
    emergency_contact_2_phone: str(s.emergency_contact_2_phone),
    referral_source_type: referralSourceType || str(s.referral_source_type),
    referral_source_name: str(s.referral_source_name),
    referral_facility: str(s.referral_facility),
    source_contact_name: str(s.source_contact_name),
    source_phone: str(s.source_phone),
    source_fax: str(s.source_fax),
    source_email: str(s.source_email),
    sales_agent_name: str(s.sales_agent_name),
    referral_received_date: str(s.referral_received_date),
    requested_soc_date: str(s.requested_soc_date),
    best_available_soc_date: str(s.best_available_soc_date),
    discharge_date: str(s.discharge_date),
    chief_complaint: str(s.chief_complaint),
    diagnosis_text: str(s.diagnosis_text),
    diagnosis_code: str(s.diagnosis_code),
    prior_medical_history: str(s.prior_medical_history),
    allergies: str(s.allergies),
    notes: str(s.notes),
    ordering_physician_name: str(s.ordering_physician_name),
    ordering_physician_phone: str(s.ordering_physician_phone),
    ordering_physician_fax: str(s.ordering_physician_fax),
    pcp_name: str(s.pcp_name),
    pcp_phone: str(s.pcp_phone),
    pcp_fax: str(s.pcp_fax),
    following_physician_name: str(s.following_physician_name),
    following_physician_phone: str(s.following_physician_phone),
    following_physician_fax: str(s.following_physician_fax),
    insurance_name: str(s.insurance_name),
    payer_type: str(s.payer_type),
    member_id: str(s.member_id),
    medicaid_id: str(s.medicaid_id),
    mbi: str(s.mbi),
    authorization_number: str(s.authorization_number),
    authorization_type: str(s.authorization_type),
    authorization_bill_type: str(s.authorization_bill_type),
    authorization_effective_start: str(s.authorization_effective_start),
    authorization_effective_end: str(s.authorization_effective_end),
    skilled_nursing_visits: str(s.skilled_nursing_visits),
    pt_visits: str(s.pt_visits),
    ot_visits: str(s.ot_visits),
    st_visits: str(s.st_visits),
    msw_visits: str(s.msw_visits),
    hha_visits: str(s.hha_visits),
    approved_disciplines: Array.isArray(s.approved_disciplines) ? s.approved_disciplines.join(", ") : "",
    denied_disciplines: Array.isArray(s.denied_disciplines) ? s.denied_disciplines.join(", ") : "",
    total_authorized_visits: str(s.total_authorized_visits),
    authorization_status: str(s.authorization_status),
    agency_assigned: str(s.agency_assigned),
    assigned_to_saintly: s.assigned_to_saintly ? "1" : "",
    intake_status: str(s.intake_status) || DEFAULT_INTAKE_STATUS,
    patient_status: str(s.patient_status) || DEFAULT_PATIENT_STATUS,
    document_type: str(s.document_type),
  };
}

export function reviewFormToFormData(form: PatientReferralReviewFormState, file?: File | null): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(form)) {
    fd.set(k, v ?? "");
  }
  if (file) fd.set("file", file);
  return fd;
}
