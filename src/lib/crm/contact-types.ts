/**
 * Canonical CRM contact / relationship types for the master directory.
 * Stored in `contacts.contact_type` as lowercase slugs; labels are for UI.
 */

export const CRM_CONTACT_TYPE_VALUES = [
  "patient",
  "lead",
  "referral",
  "physician",
  "facility",
  "payer",
  "other",
] as const;

export type CrmContactTypeValue = (typeof CRM_CONTACT_TYPE_VALUES)[number];

export const CRM_CONTACT_TYPE_LABELS: Record<CrmContactTypeValue, string> = {
  patient: "Patient",
  lead: "Lead",
  referral: "Referral",
  physician: "Physician",
  facility: "Facility",
  payer: "Payer",
  other: "Other",
};

export function isCrmContactTypeValue(v: string): v is CrmContactTypeValue {
  return (CRM_CONTACT_TYPE_VALUES as readonly string[]).includes(v);
}

/** Normalize free-text `contact_type` to a canonical slug, or null if unknown/empty. */
export function normalizeCrmContactType(raw: string | null | undefined): CrmContactTypeValue | null {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return null;
  if (t === "payor") return "payer";
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
