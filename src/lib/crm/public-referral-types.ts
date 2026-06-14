export const PUBLIC_REFERRAL_SERVICE_OPTIONS = [
  { value: "SN", label: "Skilled Nursing (SN)" },
  { value: "PT", label: "Physical Therapy (PT)" },
  { value: "OT", label: "Occupational Therapy (OT)" },
  { value: "ST", label: "Speech Therapy (ST)" },
  { value: "HHA", label: "Home Health Aide (HHA)" },
  { value: "MSW", label: "Medical Social Worker (MSW)" },
  { value: "Wound care", label: "Wound care" },
  { value: "Other", label: "Other" },
] as const;

export type PublicReferralSubmitPayload = {
  source?: string | null;
  token?: string | null;
  referring_facility_name: string;
  referring_contact_name?: string | null;
  referring_contact_phone?: string | null;
  referring_contact_email?: string | null;
  referring_office_city?: string | null;
  referring_office_phone?: string | null;
  patient_first_name: string;
  patient_last_name: string;
  patient_phone: string;
  patient_dob?: string | null;
  payer?: string | null;
  service_needed: string;
  notes?: string | null;
  acknowledged: boolean;
};

export type PublicReferralSubmitResult =
  | {
      ok: true;
      lead_id: string;
      matched: boolean;
      needs_review: boolean;
      facility_id: string | null;
      contact_id: string | null;
      source_link_id: string | null;
      patient_name: string;
      facility_name: string | null;
      sales_rep_user_id: string | null;
      intake_owner_user_id: string | null;
    }
  | { ok: false; error: string; field?: string };

export type PublicReferralValidationError = {
  error: string;
  field?: string;
};

export function validatePublicReferralPayload(
  raw: Record<string, unknown>
): PublicReferralValidationError | { ok: true; payload: PublicReferralSubmitPayload } {
  function trim(v: unknown, max: number): string {
    if (typeof v !== "string") return "";
    const t = v.trim();
    return t.length > max ? t.slice(0, max) : t;
  }

  const payload: PublicReferralSubmitPayload = {
    source: trim(raw.source, 80) || "printed_materials",
    token: trim(raw.token, 120) || null,
    referring_facility_name: trim(raw.referring_facility_name, 200),
    referring_contact_name: trim(raw.referring_contact_name, 120) || null,
    referring_contact_phone: trim(raw.referring_contact_phone, 40) || null,
    referring_contact_email: trim(raw.referring_contact_email, 320) || null,
    referring_office_city: trim(raw.referring_office_city, 80) || null,
    referring_office_phone: trim(raw.referring_office_phone, 40) || null,
    patient_first_name: trim(raw.patient_first_name, 80),
    patient_last_name: trim(raw.patient_last_name, 80),
    patient_phone: trim(raw.patient_phone, 40),
    patient_dob: trim(raw.patient_dob, 10) || null,
    payer: trim(raw.payer, 120) || null,
    service_needed: trim(raw.service_needed, 80),
    notes: trim(raw.notes, 4000) || null,
    acknowledged: raw.acknowledged === true,
  };

  if (!payload.referring_facility_name) {
    return { error: "referring_facility_name_required", field: "referring_facility_name" };
  }
  if (!payload.patient_first_name) {
    return { error: "patient_first_name_required", field: "patient_first_name" };
  }
  if (!payload.patient_last_name) {
    return { error: "patient_last_name_required", field: "patient_last_name" };
  }
  if (!payload.patient_phone.replace(/\D/g, "")) {
    return { error: "patient_phone_required", field: "patient_phone" };
  }
  if (!payload.service_needed) {
    return { error: "service_needed_required", field: "service_needed" };
  }
  if (!payload.acknowledged) {
    return { error: "acknowledgment_required", field: "acknowledged" };
  }

  const allowedServices = new Set(PUBLIC_REFERRAL_SERVICE_OPTIONS.map((o) => o.value));
  if (!allowedServices.has(payload.service_needed as (typeof PUBLIC_REFERRAL_SERVICE_OPTIONS)[number]["value"])) {
    return { error: "invalid_service_needed", field: "service_needed" };
  }

  if (payload.patient_dob && !/^\d{4}-\d{2}-\d{2}$/.test(payload.patient_dob)) {
    return { error: "invalid_patient_dob", field: "patient_dob" };
  }

  if (payload.referring_contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.referring_contact_email)) {
    return { error: "invalid_contact_email", field: "referring_contact_email" };
  }

  return { ok: true, payload };
}

export function publicReferralErrorMessage(code: string): string {
  switch (code) {
    case "referring_facility_name_required":
      return "Please enter the referring office or facility name.";
    case "patient_first_name_required":
      return "Please enter the patient’s first name.";
    case "patient_last_name_required":
      return "Please enter the patient’s last name.";
    case "patient_phone_required":
      return "Please enter a phone number for the patient.";
    case "service_needed_required":
      return "Please select the service needed.";
    case "acknowledgment_required":
      return "Please confirm you understand Saintly will follow up with the patient.";
    case "invalid_service_needed":
      return "Please choose a valid service from the list.";
    case "invalid_patient_dob":
      return "Date of birth must be YYYY-MM-DD.";
    case "invalid_contact_email":
      return "Please enter a valid contact email address.";
    case "rate_limited":
      return "Too many submissions. Please try again later or call Saintly directly.";
    case "invalid_json":
      return "Invalid submission. Please refresh and try again.";
    case "server_error":
      return "Something went wrong. Please try again or call Saintly Home Health.";
    case "lead_failed":
      return "We could not save the referral. Please call Saintly Home Health directly.";
    case "too_many_files":
      return "You can upload up to 5 files.";
    case "file_too_large":
      return "Each file must be 10 MB or smaller.";
    case "invalid_file_type":
      return "Accepted file types: PDF, JPG, PNG, WEBP, or DOCX.";
    case "document_upload_partial":
      return "Your referral was saved, but some documents could not be uploaded. Saintly intake will follow up.";
    default:
      return "Something went wrong. Please try again or call Saintly Home Health.";
  }
}

function trimField(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  const t = v.trim();
  return t.length > max ? t.slice(0, max) : t;
}

export function validatePublicReferralPayloadFromFormData(
  formData: FormData
): PublicReferralValidationError | { ok: true; payload: PublicReferralSubmitPayload } {
  const acknowledgedRaw = formData.get("acknowledged");
  const acknowledged =
    acknowledgedRaw === "true" ||
    acknowledgedRaw === "1" ||
    acknowledgedRaw === "on" ||
    acknowledgedRaw === true;

  return validatePublicReferralPayload({
    source: trimField(formData.get("source"), 80) || "printed_materials",
    token: trimField(formData.get("token"), 120) || null,
    referring_facility_name: trimField(formData.get("referring_facility_name"), 200),
    referring_contact_name: trimField(formData.get("referring_contact_name"), 120) || null,
    referring_contact_phone: trimField(formData.get("referring_contact_phone"), 40) || null,
    referring_contact_email: trimField(formData.get("referring_contact_email"), 320) || null,
    referring_office_city: trimField(formData.get("referring_office_city"), 80) || null,
    referring_office_phone: trimField(formData.get("referring_office_phone"), 40) || null,
    patient_first_name: trimField(formData.get("patient_first_name"), 80),
    patient_last_name: trimField(formData.get("patient_last_name"), 80),
    patient_phone: trimField(formData.get("patient_phone"), 40),
    patient_dob: trimField(formData.get("patient_dob"), 10) || null,
    payer: trimField(formData.get("payer"), 120) || null,
    service_needed: trimField(formData.get("service_needed"), 80),
    notes: trimField(formData.get("notes"), 4000) || null,
    acknowledged,
  });
}
