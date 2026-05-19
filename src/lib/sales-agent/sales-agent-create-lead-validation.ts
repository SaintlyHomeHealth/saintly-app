import { normalizePhone } from "@/lib/phone/us-phone-format";
import { normalizeSsnDigits } from "@/lib/crm/ssn-mask";

export type SalesAgentCreateLeadValidationCode =
  | "validation_name"
  | "validation_address"
  | "validation_phone"
  | "validation_dob"
  | "validation_insurance"
  | "validation_ssn"
  | "validation_consent";

export type SalesAgentCreateLeadValidationResult =
  | { ok: true }
  | { ok: false; code: SalesAgentCreateLeadValidationCode; field?: string };

function readTrimmed(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function readCheckbox(formData: FormData, key: string): boolean {
  const v = formData.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function parseSalesAgentDobIso(raw: string): string | null {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1]}-${m[2]}`;
}

/** Client and server shared required-field checks for create-order form. */
export function validateSalesAgentCreateLeadFormData(formData: FormData): SalesAgentCreateLeadValidationResult {
  const patientName = readTrimmed(formData, "patient_name");
  const phoneRaw = readTrimmed(formData, "phone_number");
  const addressRaw = readTrimmed(formData, "address");
  const line1 = readTrimmed(formData, "address_line_1");
  const dobRaw = readTrimmed(formData, "date_of_birth");
  const insuranceTypeRaw = readTrimmed(formData, "insurance_type");
  const insuranceNameRaw = readTrimmed(formData, "insurance_name");
  const consent = readCheckbox(formData, "consent_to_contact");

  if (!patientName) return { ok: false, code: "validation_name", field: "patient_name" };
  if (!addressRaw && !line1) return { ok: false, code: "validation_address", field: "address" };
  if (!phoneRaw) return { ok: false, code: "validation_phone", field: "phone_number" };

  const primary_phone = normalizePhone(phoneRaw);
  if (!primary_phone) return { ok: false, code: "validation_phone", field: "phone_number" };

  const dob = parseSalesAgentDobIso(dobRaw);
  if (!dob) return { ok: false, code: "validation_dob", field: "date_of_birth" };

  if (!insuranceTypeRaw && !insuranceNameRaw) {
    return { ok: false, code: "validation_insurance", field: "insurance_type" };
  }

  if (!consent) return { ok: false, code: "validation_consent", field: "consent_to_contact" };

  const ssnRaw = readTrimmed(formData, "social_security_number");
  if (ssnRaw && !normalizeSsnDigits(ssnRaw)) {
    return { ok: false, code: "validation_ssn", field: "social_security_number" };
  }

  return { ok: true };
}

export function salesAgentCreateLeadValidationMessage(code: string | null): string | null {
  if (!code) return null;
  const m: Record<string, string> = {
    validation_name: "Patient name is required.",
    validation_address: "Address is required.",
    validation_phone: "A valid phone number is required.",
    validation_dob: "Date of birth is required (MM/DD/YYYY).",
    validation_insurance: "Insurance type or insurance name is required.",
    validation_ssn: "Social Security Number must be 9 digits (XXX-XX-XXXX).",
    validation_consent: "Consent to contact is required.",
    contact_failed: "Could not save patient contact. Try again.",
    lead_failed: "Could not create the lead. Try again.",
  };
  return m[code] ?? "Something went wrong. Try again.";
}
