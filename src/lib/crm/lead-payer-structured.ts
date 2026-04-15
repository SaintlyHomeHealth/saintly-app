/**
 * Structured payer fields on `leads` (`primary_payer_*`, `secondary_payer_*`).
 * Legacy `payer_name` / `payer_type` (broad categories) are still written for lists and conversion.
 */

export const LEAD_STRUCTURED_PAYER_TYPES = [
  "original_medicare",
  "medicare_advantage",
  "medicaid",
  "commercial",
  "supplement",
  "other",
] as const;

export type LeadStructuredPayerType = (typeof LEAD_STRUCTURED_PAYER_TYPES)[number];

const STRUCTURED_SET = new Set<string>(LEAD_STRUCTURED_PAYER_TYPES);

export function isValidLeadStructuredPayerType(v: string): v is LeadStructuredPayerType {
  return STRUCTURED_SET.has(v.trim());
}

export function leadStructuredPayerTypeLabel(v: string): string {
  const t = v.trim();
  const map: Record<string, string> = {
    original_medicare: "Original Medicare",
    medicare_advantage: "Medicare Advantage",
    medicaid: "Medicaid",
    commercial: "Commercial",
    supplement: "Supplement",
    other: "Other",
  };
  return map[t] ?? t;
}

/**
 * Maps structured primary type to legacy broad `payer_type` used by CRM lists/filters
 * (`PAYER_BROAD_CATEGORY_OPTIONS` style).
 */
export function legacyBroadPayerCategoryFromStructured(primaryType: string | null | undefined): string | null {
  const t = (primaryType ?? "").trim();
  if (!t) return null;
  switch (t) {
    case "original_medicare":
    case "medicare_advantage":
    case "supplement":
      return "Medicare";
    case "medicaid":
      return "Medicaid";
    case "commercial":
      return "Private Insurance";
    case "other":
    default:
      return "Other";
  }
}

/** Combined label for legacy `payer_name` when both primary and secondary exist. */
export function legacyPayerNameFromStructured(
  primary: string | null | undefined,
  secondary: string | null | undefined
): string | null {
  const p = (primary ?? "").trim();
  const s = (secondary ?? "").trim();
  if (!p && !s) return null;
  if (p && s) return `${p} · ${s}`;
  return p || s;
}

/** Snapshot / summary: prefer structured fields, fall back to legacy `payer_*`. */
export function leadDisplayPrimaryPayerName(d: {
  primary_payer_name: string;
  payer_name: string;
}): string {
  return d.primary_payer_name.trim() || d.payer_name.trim();
}

export function leadDisplayPrimaryPayerTypeLine(d: {
  primary_payer_type: string;
  payer_type: string;
}): string {
  const p = d.primary_payer_type.trim();
  if (p) return isValidLeadStructuredPayerType(p) ? leadStructuredPayerTypeLabel(p) : p;
  return d.payer_type.trim();
}

export function leadDisplaySecondaryPayerName(d: { secondary_payer_name: string }): string {
  return d.secondary_payer_name.trim();
}

export function leadDisplaySecondaryPayerTypeLine(d: { secondary_payer_type: string }): string {
  const p = d.secondary_payer_type.trim();
  if (!p) return "";
  return isValidLeadStructuredPayerType(p) ? leadStructuredPayerTypeLabel(p) : p;
}
