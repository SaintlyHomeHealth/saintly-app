/**
 * Normalizes Zapier / partner JSON for `/api/leads/facebook`.
 * Supports wound-care Facebook Lead Ads keys and legacy field aliases.
 */

/** Public POST body for `/api/leads/facebook` (partner JSON integration). */
export type FacebookPartnerStandardPayload = {
  name?: unknown;
  full_name?: unknown;
  phone?: unknown;
  email?: unknown;
  city?: unknown;
  zip?: unknown;
  notes?: unknown;
  medicare?: unknown;
  has_medicare?: unknown;
  insurance_answer?: unknown;
  service_needed?: unknown;
  service?: unknown;
  wound_type?: unknown;
  wound_care_needed?: unknown;
  care_for?: unknown;
  pt_timing?: unknown;
  form_name?: unknown;
  source?: unknown;
  campaign?: unknown;
  lead_type?: unknown;
};

export const DEFAULT_FACEBOOK_WOUND_CARE_SOURCE = "Facebook Wound Care Ad";
export const DEFAULT_FACEBOOK_LEAD_NAME = "Facebook Lead";

/** Example Zapier POST body for wound care Facebook Lead Ads. */
export const FACEBOOK_WOUND_CARE_ZAPIER_EXAMPLE_PAYLOAD = {
  full_name: "Jane Doe",
  phone_number: "4805551234",
  email: "test@example.com",
  city: "Mesa",
  insurance_answer: "Medicare",
  wound_care_needed: "Open wound / pressure sore",
  care_for: "My parent",
  source: "Facebook Wound Care Ad",
  lead_type: "wound_care",
} as const;

export type NormalizedFacebookPartnerLead = {
  full_name: string;
  phone: string;
  email: string;
  city: string;
  insurance_answer: string;
  wound_care_needed: string;
  care_for: string;
  source: string;
  lead_type: string;
  form_name: string;
  has_medicare_raw: unknown;
  wound_type: string;
  zip: string;
  notes: string;
  pt_timing: string;
  service_needed: string;
  campaign: string;
  license_status: string;
  home_health_experience: string;
  visits_per_week: string;
  coverage_area: string;
  start_date: string;
  contact_preference: string;
};

function canonicalFieldKey(k: string): string {
  return k.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeIncomingRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[canonicalFieldKey(k)] = v;
  }
  return out;
}

function pickScalarString(norm: Record<string, unknown>, aliases: string[]): string {
  for (const a of aliases) {
    const ck = canonicalFieldKey(a);
    const v = norm[ck];
    if (v === null || v === undefined) continue;
    if (typeof v === "string") {
      const t = v.trim();
      if (t) return t;
    }
    if (typeof v === "number" && Number.isFinite(v)) {
      const t = String(v).trim();
      if (t) return t;
    }
  }
  return "";
}

function pickOptionalUnknown(norm: Record<string, unknown>, aliases: string[]): unknown {
  for (const a of aliases) {
    const ck = canonicalFieldKey(a);
    if (Object.prototype.hasOwnProperty.call(norm, ck) && norm[ck] !== undefined) {
      return norm[ck];
    }
  }
  return undefined;
}

/** Trim strings; apply wound-care defaults for name and source. */
export function normalizeFacebookPartnerWebhookBody(body: Record<string, unknown>): NormalizedFacebookPartnerLead {
  const norm = normalizeIncomingRecord(body);

  const fullNameRaw = pickScalarString(norm, ["full_name", "full name", "name"]);
  const phone = pickScalarString(norm, ["phone", "phone_number", "phone number", "mobile"]);
  const email = pickScalarString(norm, ["email", "email_address", "email address"]);
  const city = pickScalarString(norm, ["city"]);
  const insuranceAnswer = pickScalarString(norm, [
    "insurance_answer",
    "insurance answer",
    "has_medicare",
    "has medicare",
    "medicare",
  ]);
  const woundCareNeeded = pickScalarString(norm, [
    "wound_care_needed",
    "wound care needed",
    "wound_type",
    "wound type",
  ]);
  const careFor = pickScalarString(norm, ["care_for", "care for"]);
  const sourceRaw = pickScalarString(norm, ["source", "utm_source", "referral_source"]);
  const leadType = pickScalarString(norm, ["lead_type", "lead type"]);
  const formName = pickScalarString(norm, ["form_name", "form name"]);
  const hasMedicareRaw = pickOptionalUnknown(norm, ["has_medicare", "has medicare", "medicare", "insurance_answer"]);
  const woundTypeLegacy = pickScalarString(norm, ["wound_type", "wound type"]);
  const zip = pickScalarString(norm, ["zip", "zip_code", "zip code", "postal_code", "postal code"]);
  const notes = pickScalarString(norm, ["notes", "note", "message"]);
  const ptTiming = pickScalarString(norm, ["pt_timing", "pt timing"]);
  const serviceNeededRaw = pickScalarString(norm, ["service_needed", "service needed", "service"]);
  const campaign = pickScalarString(norm, ["campaign", "utm_campaign"]);
  const licenseStatus = pickScalarString(norm, ["license_status", "license status"]);
  const homeHealthExperience = pickScalarString(norm, ["home_health_experience", "home health experience"]);
  const visitsPerWeek = pickScalarString(norm, ["visits_per_week", "visits per week"]);
  const coverageArea = pickScalarString(norm, ["coverage_area", "coverage area"]);
  const startDate = pickScalarString(norm, ["start_date", "start date"]);
  const contactPreference = pickScalarString(norm, ["contact_preference", "contact preference"]);

  const woundType = woundCareNeeded || woundTypeLegacy;
  const source = sourceRaw || DEFAULT_FACEBOOK_WOUND_CARE_SOURCE;
  const full_name = fullNameRaw || DEFAULT_FACEBOOK_LEAD_NAME;

  let service_needed = serviceNeededRaw;
  if (!service_needed && leadType.toLowerCase() === "wound_care") {
    service_needed = "Wound Care";
  }

  return {
    full_name,
    phone,
    email,
    city,
    insurance_answer: insuranceAnswer,
    wound_care_needed: woundCareNeeded || woundType,
    care_for: careFor,
    source,
    lead_type: leadType,
    form_name: formName,
    has_medicare_raw: hasMedicareRaw ?? (insuranceAnswer || undefined),
    wound_type: woundType,
    zip,
    notes,
    pt_timing: ptTiming,
    service_needed,
    campaign,
    license_status: licenseStatus,
    home_health_experience: homeHealthExperience,
    visits_per_week: visitsPerWeek,
    coverage_area: coverageArea,
    start_date: startDate,
    contact_preference: contactPreference,
  };
}

/** Human-readable notes block for wound-care Facebook leads. */
export function buildFacebookWoundCareLeadNotes(input: {
  insurance_answer: string;
  wound_care_needed: string;
  care_for: string;
  source: string;
  pt_timing?: string;
  form_name?: string;
  user_notes?: string;
  campaign?: string;
}): string {
  const lines = [
    "Facebook Wound Care Lead",
    "",
    input.insurance_answer.trim() ? `Insurance: ${input.insurance_answer.trim()}` : null,
    input.wound_care_needed.trim() ? `Wound care needed: ${input.wound_care_needed.trim()}` : null,
    input.care_for.trim() ? `Care for: ${input.care_for.trim()}` : null,
    `Source: ${(input.source.trim() || DEFAULT_FACEBOOK_WOUND_CARE_SOURCE).trim()}`,
    input.pt_timing?.trim() ? `PT timing: ${input.pt_timing.trim()}` : null,
    input.form_name?.trim() ? `Form name: ${input.form_name.trim()}` : null,
    input.user_notes?.trim() ? `Notes: ${input.user_notes.trim()}` : null,
    input.campaign?.trim() ? `Campaign: ${input.campaign.trim()}` : null,
  ].filter(Boolean);

  return lines.join("\n").slice(0, 8000);
}

export function isFacebookWoundCarePartnerLead(input: {
  lead_type?: string;
  wound_care_needed?: string;
  wound_type?: string;
  service_needed?: string;
}): boolean {
  const lt = (input.lead_type ?? "").trim().toLowerCase();
  if (lt === "wound_care" || lt.includes("wound")) return true;
  if ((input.wound_care_needed ?? "").trim()) return true;
  if ((input.wound_type ?? "").trim()) return true;
  const svc = (input.service_needed ?? "").trim().toLowerCase();
  return svc.includes("wound");
}

export function normalizedToPartnerPayload(norm: NormalizedFacebookPartnerLead): FacebookPartnerStandardPayload {
  return {
    full_name: norm.full_name,
    name: norm.full_name,
    phone: norm.phone || undefined,
    email: norm.email || undefined,
    city: norm.city || undefined,
    form_name: norm.form_name || undefined,
    has_medicare: norm.has_medicare_raw,
    medicare: norm.insurance_answer || undefined,
    insurance_answer: norm.insurance_answer || undefined,
    wound_type: norm.wound_type || undefined,
    wound_care_needed: norm.wound_care_needed || undefined,
    care_for: norm.care_for || undefined,
    zip: norm.zip || undefined,
    notes: norm.notes || undefined,
    service_needed: norm.service_needed || undefined,
    service: norm.service_needed || undefined,
    lead_type: norm.lead_type || undefined,
    pt_timing: norm.pt_timing || undefined,
    campaign: norm.campaign || undefined,
    source: norm.source || undefined,
  };
}
