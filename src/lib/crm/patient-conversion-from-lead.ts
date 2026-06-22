import {
  legacyBroadPayerCategoryFromStructured,
  legacyPayerNameFromStructured,
} from "@/lib/crm/lead-payer-structured";

function trimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function mergeText(existing: unknown, incoming: unknown): string | null {
  const inc = trimOrNull(incoming);
  if (inc) return inc;
  return trimOrNull(existing);
}

function mergeDisciplines(existing: unknown, incoming: unknown, serviceType: unknown): string[] {
  const inc = Array.isArray(incoming)
    ? incoming.filter((x): x is string => typeof x === "string" && x.trim() !== "")
    : [];
  if (inc.length > 0) return inc;
  const ex = Array.isArray(existing)
    ? existing.filter((x): x is string => typeof x === "string" && x.trim() !== "")
    : [];
  if (ex.length > 0) return ex;
  const legacy = trimOrNull(serviceType);
  if (legacy) return legacy.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

export type LeadIntakeForPatientConversion = {
  referring_provider_name?: string | null;
  referring_provider_phone?: string | null;
  referring_doctor_name?: string | null;
  doctor_office_name?: string | null;
  doctor_office_phone?: string | null;
  doctor_office_fax?: string | null;
  doctor_office_contact_person?: string | null;
  payer_name?: string | null;
  payer_type?: string | null;
  primary_payer_type?: string | null;
  primary_payer_name?: string | null;
  secondary_payer_type?: string | null;
  secondary_payer_name?: string | null;
  referral_source?: string | null;
  service_type?: string | null;
  service_disciplines?: string[] | null;
  intake_status?: string | null;
  referring_facility_id?: string | null;
  referring_facility_contact_id?: string | null;
  dob?: string | null;
  medicare_number?: string | null;
  notes?: string | null;
  referral_received_at?: string | null;
  source?: string | null;
};

export type PatientRowForConversionMerge = Record<string, unknown>;

export function buildPatientInsertFromLead(lead: LeadIntakeForPatientConversion): Record<string, unknown> {
  const doctorName = trimOrNull(lead.referring_doctor_name);
  const legacyRefName = trimOrNull(lead.referring_provider_name);
  const physician_name = doctorName || legacyRefName;
  const referring_provider_phone =
    trimOrNull(lead.referring_provider_phone) || trimOrNull(lead.doctor_office_phone);

  const payer_name =
    legacyPayerNameFromStructured(lead.primary_payer_name, lead.secondary_payer_name) ||
    trimOrNull(lead.payer_name);
  const payer_type =
    legacyBroadPayerCategoryFromStructured(lead.primary_payer_type) || trimOrNull(lead.payer_type);

  const serviceDisciplines = mergeDisciplines(null, lead.service_disciplines, lead.service_type);

  return {
    patient_status: "active",
    referring_provider_name: legacyRefName,
    referring_provider_phone,
    referring_doctor_name: doctorName,
    doctor_office_name: trimOrNull(lead.doctor_office_name),
    doctor_office_phone: trimOrNull(lead.doctor_office_phone),
    doctor_office_fax: trimOrNull(lead.doctor_office_fax),
    doctor_office_contact_person: trimOrNull(lead.doctor_office_contact_person),
    payer_name,
    payer_type,
    referral_source: trimOrNull(lead.referral_source),
    service_type: serviceDisciplines.length > 0 ? serviceDisciplines.join(", ") : trimOrNull(lead.service_type),
    service_disciplines: serviceDisciplines,
    intake_status: trimOrNull(lead.intake_status),
    physician_name,
    referring_facility_id: lead.referring_facility_id ?? null,
    referring_facility_contact_id: lead.referring_facility_contact_id ?? null,
    medicare_number: trimOrNull(lead.medicare_number),
    referral_source_phone: trimOrNull(lead.doctor_office_phone) || trimOrNull(lead.referring_provider_phone),
    referral_received_at: trimOrNull(lead.referral_received_at),
    notes: trimOrNull(lead.notes),
  };
}

export function mergePatientUpdateFromLead(
  existing: PatientRowForConversionMerge,
  lead: LeadIntakeForPatientConversion
): Record<string, unknown> {
  const insertPayload = buildPatientInsertFromLead(lead);
  const merged: Record<string, unknown> = {};

  for (const [key, incoming] of Object.entries(insertPayload)) {
    if (key === "patient_status") {
      merged[key] = existing.patient_status ?? incoming;
      continue;
    }
    if (key === "service_disciplines") {
      merged[key] = mergeDisciplines(existing.service_disciplines, lead.service_disciplines, lead.service_type);
      continue;
    }
    merged[key] = mergeText(existing[key], incoming);
  }

  return merged;
}

export function contactDobUpdateFromLead(leadDob: unknown, existingDob: unknown): string | null | undefined {
  const inc = trimOrNull(leadDob);
  if (inc && /^\d{4}-\d{2}-\d{2}/.test(inc)) return inc.slice(0, 10);
  const ex = trimOrNull(existingDob);
  if (ex) return ex;
  return undefined;
}
