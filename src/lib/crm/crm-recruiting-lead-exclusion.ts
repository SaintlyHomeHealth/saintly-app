/**
 * Detect and exclude recruiting/applicant rows from patient CRM → Leads.
 * Requires strong recruiting evidence; patient indicators override weak signals.
 */

import { parseEmploymentApplicationMeta } from "@/lib/crm/lead-employment-meta";
import { isFacebookRecruitingLeadPayload } from "@/lib/recruiting/facebook-recruiting-lead-detect";
import { MANUAL_RESUME_UPLOAD_SOURCE } from "@/lib/recruiting/manual-resume-upload-constants";
import {
  WEBSITE_CAREERS_FORM_NAME,
  WEBSITE_RECRUITING_SOURCE,
} from "@/lib/recruiting/website-recruiting-lead-constants";

const RECRUITING_SOURCE_NEEDLES = [
  "employment application",
  "employment form",
  "careers form",
  "careers application",
  "job application",
  "website careers",
] as const;

const RECRUITING_EMPLOYMENT_FIELD_KEYS = [
  "applying_for_position",
  "position_applied_for",
  "license_type",
  "are_you_a_licensed_physical_therapist",
  "do_you_have_home_health_experience",
  "how_many_visits_can_you_take_per_week",
  "what_area_can_you_cover",
  "resume",
  "resume_url",
  "applicant",
  "candidate",
  "years_experience",
  "preferred_hours",
  "available_start_date",
  "license_number",
  "position",
] as const;

const WEAK_RECRUITING_TEXT_NEEDLES = [
  "nurse",
  "lpn",
  "rn",
  "pta",
  "therapist",
  "aide",
  "home health",
  "care",
  "patient",
  "referral",
  "legacy crm",
  "licensed",
] as const;

const PATIENT_FIELD_KEYS = [
  "patient_name",
  "patient_first_name",
  "patient_last_name",
  "patient_phone",
  "patient_contact",
  "referral_source",
  "payer",
  "insurance",
  "diagnosis",
  "service_requested",
  "service_needed",
  "start_of_care",
  "physician",
  "doctor",
  "facility_referral",
  "referring_facility",
  "patient_address",
  "medicare",
  "ahcccs",
  "mbi",
] as const;

export type CrmLeadClassificationInput = {
  lead_type?: string | null;
  source?: string | null;
  notes?: string | null;
  external_source_metadata?: unknown;
  referral_source?: string | null;
  payer_name?: string | null;
  payer_type?: string | null;
  primary_payer_name?: string | null;
  primary_payer_type?: string | null;
  secondary_payer_name?: string | null;
  secondary_payer_type?: string | null;
  referring_doctor_name?: string | null;
  doctor_office_name?: string | null;
  referring_provider_name?: string | null;
  service_type?: string | null;
  service_disciplines?: unknown;
  dob?: string | null;
  medicare_number?: string | null;
};

function norm(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function collectTextBlobs(lead: CrmLeadClassificationInput): string[] {
  const blobs: string[] = [];
  const push = (v: string | null | undefined) => {
    const t = (v ?? "").trim();
    if (t) blobs.push(t);
  };

  push(lead.source);
  push(lead.notes);
  push(lead.referral_source);
  push(lead.payer_name);
  push(lead.payer_type);
  push(lead.primary_payer_name);
  push(lead.primary_payer_type);
  push(lead.secondary_payer_name);
  push(lead.secondary_payer_type);
  push(lead.referring_doctor_name);
  push(lead.doctor_office_name);
  push(lead.referring_provider_name);
  push(lead.service_type);
  push(lead.dob);
  push(lead.medicare_number);

  if (Array.isArray(lead.service_disciplines)) {
    push(lead.service_disciplines.map(String).join(" "));
  }

  const meta = asRecord(lead.external_source_metadata);
  if (meta) {
    for (const [key, value] of Object.entries(meta)) {
      if (typeof value === "string") blobs.push(`${key} ${value}`);
      else if (value && typeof value === "object") blobs.push(`${key} ${JSON.stringify(value)}`);
    }
  }

  return blobs;
}

function hayIncludesNeedle(hay: string, needle: string): boolean {
  return hay.includes(needle);
}

function textIncludesAny(haystack: string, needles: readonly string[]): boolean {
  const hay = norm(haystack);
  if (!hay) return false;
  return needles.some((needle) => hayIncludesNeedle(hay, needle));
}

function objectHasEmploymentFields(value: unknown, depth = 0): boolean {
  if (depth > 4 || value == null) return false;
  if (typeof value === "string") {
    const hay = norm(value);
    return RECRUITING_EMPLOYMENT_FIELD_KEYS.some((key) => hayIncludesNeedle(hay, norm(key.replace(/_/g, " "))));
  }
  if (Array.isArray(value)) {
    return value.some((item) => objectHasEmploymentFields(item, depth + 1));
  }
  if (typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const keyNorm = norm(key);
    if (RECRUITING_EMPLOYMENT_FIELD_KEYS.some((field) => keyNorm === field || keyNorm.includes(field))) {
      const val = record[key];
      if (val !== null && val !== undefined && String(val).trim() !== "") return true;
    }
    if (objectHasEmploymentFields(record[key], depth + 1)) return true;
  }
  return false;
}

function hasStrongRecruitingEvidence(lead: CrmLeadClassificationInput): boolean {
  const leadType = norm(lead.lead_type);
  if (leadType === "employee" || leadType === "recruiting") {
    return true;
  }

  const meta = asRecord(lead.external_source_metadata);
  if (meta) {
    if (meta.employment_application === true) return true;
    if (parseEmploymentApplicationMeta(meta)) return true;
    if (norm(String(meta.pipeline ?? "")) === "recruiting") return true;
    if (meta.migrated_to_recruiting === true) return true;
    if (meta.restored_from_recruiting === true) return false;

    const formName = typeof meta.form_name === "string" ? meta.form_name : null;
    const metaLeadType = typeof meta.lead_type === "string" ? meta.lead_type : null;
    if (
      isFacebookRecruitingLeadPayload({
        form_name: formName ?? undefined,
        lead_type: metaLeadType ?? undefined,
      })
    ) {
      return true;
    }
    if (objectHasEmploymentFields(meta)) return true;
  }

  const source = norm(lead.source);
  if (
    source === WEBSITE_RECRUITING_SOURCE ||
    source === "website" ||
    source === "careers_form" ||
    source === MANUAL_RESUME_UPLOAD_SOURCE
  ) {
    return true;
  }
  if (RECRUITING_SOURCE_NEEDLES.some((needle) => source.includes(needle))) return true;

  const notes = norm(lead.notes);
  if (notes.includes(WEBSITE_CAREERS_FORM_NAME.toLowerCase())) return true;

  if (objectHasEmploymentFields(lead.external_source_metadata)) return true;

  return false;
}

function hasWeakRecruitingEvidenceOnly(lead: CrmLeadClassificationInput): boolean {
  const blobs = collectTextBlobs(lead);
  return blobs.some((blob) => textIncludesAny(blob, WEAK_RECRUITING_TEXT_NEEDLES));
}

function hasPatientLeadEvidence(lead: CrmLeadClassificationInput): boolean {
  if (lead.referral_source?.trim()) return true;
  if (lead.payer_name?.trim() || lead.primary_payer_name?.trim() || lead.secondary_payer_name?.trim()) return true;
  if (lead.payer_type?.trim() || lead.primary_payer_type?.trim() || lead.secondary_payer_type?.trim()) return true;
  if (lead.referring_doctor_name?.trim() || lead.doctor_office_name?.trim() || lead.referring_provider_name?.trim()) {
    return true;
  }
  if (lead.service_type?.trim()) return true;
  if (Array.isArray(lead.service_disciplines) && lead.service_disciplines.length > 0) return true;
  if (lead.dob?.trim()) return true;
  if (lead.medicare_number?.trim()) return true;

  const meta = asRecord(lead.external_source_metadata);
  if (meta) {
    if (objectHasPatientFields(meta)) return true;
    const intake = asRecord(meta.intake_request);
    if (intake && objectHasPatientFields(intake)) return true;
  }

  const blobs = collectTextBlobs(lead);
  return blobs.some((blob) => {
    const hay = norm(blob);
    return PATIENT_FIELD_KEYS.some((key) => hayIncludesNeedle(hay, key.replace(/_/g, " ")) || hayIncludesNeedle(hay, key));
  });
}

function objectHasPatientFields(value: unknown, depth = 0): boolean {
  if (depth > 4 || value == null) return false;
  if (typeof value === "string") {
    const hay = norm(value);
    return PATIENT_FIELD_KEYS.some((key) => hayIncludesNeedle(hay, key.replace(/_/g, " ")) || hayIncludesNeedle(hay, key));
  }
  if (Array.isArray(value)) {
    return value.some((item) => objectHasPatientFields(item, depth + 1));
  }
  if (typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const keyNorm = norm(key);
    if (PATIENT_FIELD_KEYS.some((field) => keyNorm === field || keyNorm.includes(field))) {
      const val = record[key];
      if (val !== null && val !== undefined && String(val).trim() !== "") return true;
    }
    if (objectHasPatientFields(record[key], depth + 1)) return true;
  }
  return false;
}

export function isCrmRecruitingApplicantLead(lead: CrmLeadClassificationInput): boolean {
  const meta = asRecord(lead.external_source_metadata);
  if (meta?.restored_from_recruiting === true) {
    return false;
  }

  const strongRecruiting = hasStrongRecruitingEvidence(lead);
  const patientEvidence = hasPatientLeadEvidence(lead);

  if (patientEvidence && !strongRecruiting) {
    return false;
  }

  if (strongRecruiting) {
    return true;
  }

  if (hasWeakRecruitingEvidenceOnly(lead)) {
    return false;
  }

  return false;
}

type LeadListFilterQB = {
  or(expr: string): LeadListFilterQB;
  is(column: string, value: unknown): LeadListFilterQB;
  not(column: string, operator: string, value: unknown): LeadListFilterQB;
  filter(column: string, operator: string, value: unknown): LeadListFilterQB;
};

/**
 * Apply patient CRM exclusions for recruiting/applicant leads.
 */
export function attachExcludeRecruitingCrmLeadsPredicates(qb: unknown): unknown {
  let q = qb as LeadListFilterQB;

  q = q.or("lead_type.is.null,lead_type.neq.employee,lead_type.neq.recruiting");
  q = q.is("external_source_metadata->employment_application", null);
  q = q.or(
    "external_source_metadata.is.null,external_source_metadata->>pipeline.is.null,external_source_metadata->>pipeline.neq.recruiting"
  );
  q = q.or(
    "external_source_metadata.is.null,external_source_metadata->>migrated_to_recruiting.is.null,external_source_metadata->>migrated_to_recruiting.neq.true"
  );
  q = q.or(
    "external_source_metadata.is.null,external_source_metadata->>restored_from_recruiting.is.null,external_source_metadata->>restored_from_recruiting.neq.true"
  );

  for (const needle of ["employment application", "careers form", "job application"]) {
    q = q.not("source", "ilike", `%${needle}%`);
  }

  return q;
}

export function resolveRestoredPatientLeadSource(input: {
  recruitingSource?: string | null;
}): "legacy_crm_lead" | "restored_from_recruiting_misclassification" {
  const recruitingSource = norm(input.recruitingSource);
  if (recruitingSource === "legacy_crm_lead") {
    return "legacy_crm_lead";
  }
  return "restored_from_recruiting_misclassification";
}
