/**
 * Canonical CRM contact / relationship types for the master directory.
 * Stored in `contacts.contact_type` as lowercase slugs; labels are for UI.
 */

export const CRM_CONTACT_TYPE_VALUES = [
  "patient",
  "lead",
  "recruit",
  "referral",
  "physician",
  "facility",
  "facility_vendor",
  "payer",
  "employee",
  "other",
] as const;

export type CrmContactTypeValue = (typeof CRM_CONTACT_TYPE_VALUES)[number];

export const CRM_CONTACT_TYPE_LABELS: Record<CrmContactTypeValue, string> = {
  patient: "Patient",
  lead: "Lead",
  recruit: "Recruit",
  referral: "Referral",
  physician: "Physician",
  facility: "Facility",
  facility_vendor: "Facility / Vendor",
  payer: "Payer",
  employee: "Employee",
  other: "Contact",
};

export function isCrmContactTypeValue(v: string): v is CrmContactTypeValue {
  return (CRM_CONTACT_TYPE_VALUES as readonly string[]).includes(v);
}

/** Normalize free-text `contact_type` to a canonical slug, or null if unknown/empty. */
export function normalizeCrmContactType(raw: string | null | undefined): CrmContactTypeValue | null {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return null;
  if (t === "payor") return "payer";
  /** UI label "Contact" maps to canonical slug `other`. */
  if (t === "contact") return "other";
  if (t === "vendor" || t === "facility/vendor" || t === "facility_vendor") return "facility_vendor";
  if (isCrmContactTypeValue(t)) return t;
  return null;
}

/** Human label for display; falls back to title-cased raw when not a known slug. */
export function labelForContactType(raw: string | null | undefined): string {
  const n = normalizeCrmContactType(raw);
  if (n) return CRM_CONTACT_TYPE_LABELS[n];
  const s = (raw ?? "").trim();
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
